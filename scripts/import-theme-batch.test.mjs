import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  THEME_BATCH_WEBP_QUALITY,
  THEME_THUMBNAIL_HEIGHT,
  THEME_THUMBNAIL_QUALITY,
  THEME_THUMBNAIL_WIDTH,
  compileThemeManifest,
  importThemeBatch,
} from './import-theme-batch.mjs'

const contract = {
  'sample-theme': {
    name: 'Sample Theme',
    category: 'abstract',
    displayFontId: 'space-grotesk',
    uiFontId: 'system-ui',
    backgroundIds: ['sample-theme-one', 'sample-theme-two', 'sample-theme-three'],
  },
}

function sampleManifest() {
  return {
    schemaVersion: 2,
    id: 'sample-theme',
    name: 'Sample Theme',
    category: 'abstract',
    description: 'A safe and deliberately small importer test theme.',
    keywords: ['sample', 'safe', 'test'],
    displayFontId: 'space-grotesk',
    uiFontId: 'system-ui',
    swatches: ['#101820', '#F5F7FA', '#4FD1C5'],
    preview: { kind: 'thumbnail', label: 'Sample theme artwork preview', sourceFilename: 'sample-theme-one.png' },
    tokens: {
      canvas: '#101820', surface: '#17232D', surfaceSecondary: '#243542', text: '#FFFFFF',
      textMuted: '#C5D0D8', border: '#647785', accent: '#4FD1C5', accentSecondary: '#F6C453',
      accentText: '#101820', focus: '#F6C453', featureBackground: '#F6C453', featureText: '#101820',
      buttonBackground: '#4FD1C5', buttonText: '#101820', buttonShadow: '#26776F',
      answerSurface: '#243542', answerSelected: '#365266', leaderboardSurface: '#243542',
      leaderboardHighlight: '#5D4B25', progress: '#F6C453',
      stageBackground: { kind: 'radial-gradient', position: 'top-right', inner: '#365266', outer: '#101820', outerStopPercent: 64 },
      playerBarBackground: '#101820', playerBarText: '#FFFFFF', playerBarMuted: '#C5D0D8',
      stageText: '#FFFFFF', stageTextMuted: '#C5D0D8', stageSurface: '#17232DE8',
      stageBorder: '#647785', roomAccent: '#F6C453', stageEyebrow: '#4FD1C5',
      shadow: { xPx: 0, yPx: 18, blurPx: 48, colour: '#000000B0' },
    },
    backgrounds: [
      { id: 'sample-theme-one', name: 'One', sourceFilename: 'sample-theme-one.png' },
      { id: 'sample-theme-two', name: 'Two', sourceFilename: 'sample-theme-two.png' },
      { id: 'sample-theme-three', name: 'Three', sourceFilename: 'sample-theme-three.png' },
    ],
  }
}

let temporaryRoot
let sourceDir
let themeDir

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'katwed-theme-batch-test-'))
  sourceDir = join(temporaryRoot, 'source')
  themeDir = join(sourceDir, 'sample-theme')
  await mkdir(themeDir, { recursive: true })
  await writeFile(join(themeDir, 'theme.json'), `${JSON.stringify(sampleManifest(), null, 2)}\n`)
  for (const id of contract['sample-theme'].backgroundIds) {
    await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 16, g: 24, b: 32 } },
    }).png().toFile(join(themeDir, `${id}.png`))
  }
})

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

function options(overrides = {}) {
  return {
    sourceDir,
    schemaPath: resolve('docs/theme-authoring/theme-manifest.schema.json'),
    outputBackgroundDir: join(temporaryRoot, 'public', 'backgrounds'),
    outputPreviewDir: join(temporaryRoot, 'public', 'backgrounds', 'previews'),
    generatedModulePath: join(temporaryRoot, 'src', 'generated', 'visualThemeBatch1.ts'),
    reportPath: join(temporaryRoot, 'docs', 'visual-theme-batch-1-size-report.json'),
    expectedContracts: contract,
    log: () => undefined,
    ...overrides,
  }
}

describe('theme batch manifest compilation', () => {
  it('compiles only structured gradients, shadows and trusted local asset paths', () => {
    const compiled = compileThemeManifest(sampleManifest())
    expect(compiled.tokens.stage.background).toBe('radial-gradient(circle at top right, #365266, #101820 64%)')
    expect(compiled.tokens.shadow).toBe('0px 18px 48px #000000B0')
    expect(compiled.preview.thumbnailPath).toBe('/backgrounds/previews/sample-theme.webp')
    expect(JSON.stringify(compiled)).not.toContain('sourceFilename')
  })
})

describe('theme batch validation and output', () => {
  it('fully validates and measures a batch without writing during a dry run', async () => {
    const result = await importThemeBatch(options())
    expect(result.report).toMatchObject({ themeCount: 1, backgroundCount: 3, thumbnailCount: 1 })
    expect(result.report.production.totalProductionBytes).toBeGreaterThan(0)
    expect(result.report.thumbnails.totalBytes).toBeGreaterThan(0)
    expect(existsSync(options().generatedModulePath)).toBe(false)
  })

  it('writes quality-82 production WebPs, a small thumbnail, metadata and controlled portable enums', async () => {
    const portableSchemaPath = join(temporaryRoot, 'portable.schema.json')
    await writeFile(portableSchemaPath, JSON.stringify({
      marker: { keep: true },
      $defs: { quiz: { properties: { themeId: { enum: ['katwed'] }, backgroundId: { oneOf: [{ type: 'string' }, { type: 'null' }] } } } },
    }))
    const paths = options({ write: true, portableSchemaPaths: [portableSchemaPath] })
    await importThemeBatch(paths)

    await expect(sharp(join(paths.outputBackgroundDir, 'sample-theme-one.webp')).metadata()).resolves.toMatchObject({
      format: 'webp', width: 1920, height: 1080,
    })
    await expect(sharp(join(paths.outputPreviewDir, 'sample-theme.webp')).metadata()).resolves.toMatchObject({
      format: 'webp', width: THEME_THUMBNAIL_WIDTH, height: THEME_THUMBNAIL_HEIGHT,
    })
    const report = JSON.parse(await readFile(paths.reportPath, 'utf8'))
    expect(report.production.quality).toBe(THEME_BATCH_WEBP_QUALITY)
    expect(report.thumbnails.quality).toBe(THEME_THUMBNAIL_QUALITY)
    const schema = JSON.parse(await readFile(portableSchemaPath, 'utf8'))
    expect(schema.$defs.quiz.properties.themeId.enum).toContain('sample-theme')
    expect(schema.$defs.quiz.properties.backgroundId.oneOf[0].enum).toContain('sample-theme-three')
    expect(await readFile(portableSchemaPath, 'utf8')).toContain('{"marker":{"keep":true},')
    expect(await readFile(paths.generatedModulePath, 'utf8')).toContain('visualThemeBatch1Themes')
  })

  it('rejects unknown manifest fields before producing any output', async () => {
    const manifest = { ...sampleManifest(), arbitraryCss: 'body { display: none }' }
    await writeFile(join(themeDir, 'theme.json'), JSON.stringify(manifest))
    await expect(importThemeBatch(options())).rejects.toThrow(/does not match the v2 schema/)
    expect(existsSync(options().generatedModulePath)).toBe(false)
  })

  it('rejects unexpected source transparency before producing any output', async () => {
    await sharp({
      create: { width: 1920, height: 1080, channels: 4, background: { r: 16, g: 24, b: 32, alpha: 0.5 } },
    }).png().toFile(join(themeDir, 'sample-theme-two.png'))
    await expect(importThemeBatch(options())).rejects.toThrow(/unexpected transparent pixels/)
    expect(existsSync(options().generatedModulePath)).toBe(false)
  })
})
