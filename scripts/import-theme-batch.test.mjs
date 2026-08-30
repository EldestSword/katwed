import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  THEME_BATCH_WEBP_QUALITY,
  THEME_THUMBNAIL_HEIGHT,
  THEME_THUMBNAIL_QUALITY,
  THEME_THUMBNAIL_WIDTH,
  calculateFileSha256,
  calculateSourceContentSha256,
  calculateSourceContentSha256FromPaths,
  compileThemeManifest,
  importThemeBatch,
  portableSchemaPathsForBatch,
} from './import-theme-batch.mjs'
import {
  VISUAL_THEME_BATCH_CONFIGS,
  getVisualThemeBatchConfig,
  isLatestVisualThemeBatch,
} from './theme-batch-configs.mjs'

const sampleGeneratedExports = {
  themeIds: 'VISUAL_THEME_BATCH_99_THEME_IDS',
  backgroundIds: 'VISUAL_THEME_BATCH_99_BACKGROUND_IDS',
  themes: 'visualThemeBatch99Themes',
  backgrounds: 'visualThemeBatch99Backgrounds',
}

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
    batchId: 'batch-99',
    sourceDir,
    schemaPath: resolve('docs/theme-authoring/theme-manifest.schema.json'),
    outputBackgroundDir: join(temporaryRoot, 'public', 'backgrounds'),
    outputPreviewDir: join(temporaryRoot, 'public', 'backgrounds', 'previews'),
    generatedModulePath: join(temporaryRoot, 'src', 'generated', 'visualThemeBatch99.ts'),
    reportPath: join(temporaryRoot, 'docs', 'visual-theme-batch-99-size-report.json'),
    expectedContracts: contract,
    generatedExports: sampleGeneratedExports,
    log: () => undefined,
    ...overrides,
  }
}

function sourceFilePaths() {
  return [
    join(themeDir, 'theme.json'),
    ...contract['sample-theme'].backgroundIds.map((id) => join(themeDir, `${id}.png`)),
  ]
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

describe('theme source provenance', () => {
  it('produces the same content digest for the same source tree', async () => {
    const first = await calculateSourceContentSha256(sourceDir)
    const second = await calculateSourceContentSha256(sourceDir)
    expect(second).toBe(first)
  })

  it('does not depend on filesystem enumeration order', async () => {
    const filePaths = sourceFilePaths()
    const forward = await calculateSourceContentSha256FromPaths(sourceDir, filePaths)
    const reverse = await calculateSourceContentSha256FromPaths(sourceDir, [...filePaths].reverse())
    expect(reverse).toBe(forward)
  })

  it('changes the content digest when one PNG byte changes', async () => {
    const imagePath = join(themeDir, 'sample-theme-one.png')
    const before = await calculateSourceContentSha256(sourceDir)
    const changedImage = Buffer.from(await readFile(imagePath))
    changedImage[changedImage.length - 1] ^= 1
    await writeFile(imagePath, changedImage)
    await expect(calculateSourceContentSha256(sourceDir)).resolves.not.toBe(before)
  })

  it('changes the content digest when manifest content changes', async () => {
    const before = await calculateSourceContentSha256(sourceDir)
    const manifest = sampleManifest()
    manifest.description = 'The same valid manifest with changed source content.'
    await writeFile(join(themeDir, 'theme.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await expect(calculateSourceContentSha256(sourceDir)).resolves.not.toBe(before)
  })

  it('changes the content digest when a source file is renamed', async () => {
    const before = await calculateSourceContentSha256(sourceDir)
    await rename(
      join(themeDir, 'sample-theme-one.png'),
      join(themeDir, 'sample-theme-renamed.png'),
    )
    await expect(calculateSourceContentSha256(sourceDir)).resolves.not.toBe(before)
  })

  it('changes the content digest when a source file is added or removed', async () => {
    const before = await calculateSourceContentSha256(sourceDir)
    const extraPath = join(themeDir, 'extra.txt')
    await writeFile(extraPath, 'extra source content')
    const withAddition = await calculateSourceContentSha256(sourceDir)
    expect(withAddition).not.toBe(before)
    await rm(extraPath)
    await rm(join(themeDir, 'sample-theme-three.png'))
    await expect(calculateSourceContentSha256(sourceDir)).resolves.not.toBe(before)
  })
})

describe('theme batch validation and output', () => {
  it('fully validates and measures a batch without writing during a dry run', async () => {
    const sourceContentSha256 = await calculateSourceContentSha256(sourceDir)
    const result = await importThemeBatch(options())
    expect(result.report).toMatchObject({
      batchId: 'batch-99',
      sourceContentSha256,
      themeCount: 1,
      backgroundCount: 3,
      thumbnailCount: 1,
    })
    expect(result.report).not.toHaveProperty('sourceSha256')
    expect(result.report.production.totalProductionBytes).toBeGreaterThan(0)
    expect(result.report.thumbnails.totalBytes).toBeGreaterThan(0)
    expect(existsSync(options().generatedModulePath)).toBe(false)
  })

  it('continues when the expected content digest matches the supplied source', async () => {
    const expectedSourceContentSha256 = await calculateSourceContentSha256(sourceDir)
    const result = await importThemeBatch(options({ expectedSourceContentSha256 }))
    expect(result.report.sourceContentSha256).toBe(expectedSourceContentSha256)
  })

  it('rejects a mismatched expected digest before writing production outputs', async () => {
    const paths = options({
      write: true,
      expectedSourceContentSha256: '0'.repeat(64),
    })
    await expect(importThemeBatch(paths)).rejects.toThrow(/source content SHA-256 mismatch/i)
    expect(existsSync(paths.outputBackgroundDir)).toBe(false)
    expect(existsSync(paths.outputPreviewDir)).toBe(false)
    expect(existsSync(paths.generatedModulePath)).toBe(false)
    expect(existsSync(paths.reportPath)).toBe(false)
  })

  it('does not let --allow-existing bypass a mismatched expected digest', async () => {
    const paths = options({
      write: true,
      allowExistingOutputs: true,
      expectedSourceContentSha256: '0'.repeat(64),
    })
    await mkdir(resolve(paths.generatedModulePath, '..'), { recursive: true })
    await writeFile(paths.generatedModulePath, 'existing reviewed output')
    await expect(importThemeBatch(paths)).rejects.toThrow(/source content SHA-256 mismatch/i)
    await expect(readFile(paths.generatedModulePath, 'utf8')).resolves.toBe('existing reviewed output')
    expect(existsSync(paths.outputBackgroundDir)).toBe(false)
    expect(existsSync(paths.reportPath)).toBe(false)
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
    expect(report.sourceContentSha256).toBe(await calculateSourceContentSha256(sourceDir))
    expect(report).not.toHaveProperty('sourceSha256')
    expect(report.production.quality).toBe(THEME_BATCH_WEBP_QUALITY)
    expect(report.thumbnails.quality).toBe(THEME_THUMBNAIL_QUALITY)
    const schema = JSON.parse(await readFile(portableSchemaPath, 'utf8'))
    expect(schema.$defs.quiz.properties.themeId.enum).toContain('sample-theme')
    expect(schema.$defs.quiz.properties.backgroundId.oneOf[0].enum).toContain('sample-theme-three')
    expect(await readFile(portableSchemaPath, 'utf8')).toContain('{"marker":{"keep":true},')
    expect(await readFile(paths.generatedModulePath, 'utf8')).toContain('visualThemeBatch99Themes')
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

  it('rejects collisions against the supplied prior registered catalogue', async () => {
    await expect(importThemeBatch(options({ existingThemeIds: ['sample-theme'] })))
      .rejects.toThrow(/collides with an existing registered theme/i)
    expect(existsSync(options().generatedModulePath)).toBe(false)
  })
})

describe('reviewed theme batch configuration', () => {
  it('derives Batch 2 prior and complete IDs from Batch 1 without duplicated registry lists', () => {
    const batchOne = getVisualThemeBatchConfig('batch-01')
    const batchTwo = getVisualThemeBatchConfig('batch-02')
    expect(batchOne).toBe(VISUAL_THEME_BATCH_CONFIGS['batch-01'])
    expect(batchTwo.existingThemeIds).toEqual(batchOne.registeredThemeIds)
    expect(batchTwo.existingBackgroundIds).toEqual(batchOne.registeredBackgroundIds)
    expect(batchTwo.registeredThemeIds).toHaveLength(36)
    expect(batchTwo.registeredBackgroundIds).toHaveLength(108)
    expect(getVisualThemeBatchConfig('batch-03')).toBeNull()
  })

  it('allows only the latest reviewed batch to rewrite the shared portable schemas', () => {
    expect(isLatestVisualThemeBatch('batch-01')).toBe(false)
    expect(isLatestVisualThemeBatch('batch-02')).toBe(true)
    expect(isLatestVisualThemeBatch('batch-03')).toBe(false)
    expect(portableSchemaPathsForBatch('batch-01', temporaryRoot)).toEqual([])
    expect(portableSchemaPathsForBatch('batch-02', temporaryRoot)).toHaveLength(5)
  })
})

function reviewedBatchAvailable(batchId) {
  const config = getVisualThemeBatchConfig(batchId)
  return existsSync(resolve('theme-source', config.sourceDirectory))
    && existsSync(resolve('theme-source', config.sourceArchiveFilename))
}

async function reproduceReviewedBatch(batchId) {
  const config = getVisualThemeBatchConfig(batchId)
  const sourceDir = resolve('theme-source', config.sourceDirectory)
  const archivePath = resolve('theme-source', config.sourceArchiveFilename)
  const outputRoot = join(temporaryRoot, batchId)
  const outputBackgroundDir = join(outputRoot, 'public', 'backgrounds')
  const outputPreviewDir = join(outputBackgroundDir, 'previews')
  const generatedModulePath = join(outputRoot, 'src', 'generated', config.generatedModuleFilename)
  const reportPath = join(outputRoot, 'docs', config.reportFilename)
  const currentPortableSchemaPaths = [1, 2, 3, 4, 5].map((version) => ({
    source: resolve('docs', 'schemas', `katwed-quiz-v${version}.schema.json`),
    output: join(outputRoot, 'docs', 'schemas', `katwed-quiz-v${version}.schema.json`),
  }))
  for (const schemaPath of currentPortableSchemaPaths) {
    await mkdir(dirname(schemaPath.output), { recursive: true })
    await copyFile(schemaPath.source, schemaPath.output)
  }
  const portableSchemaSnapshots = await Promise.all(
    currentPortableSchemaPaths.map(({ output }) => readFile(output, 'utf8')),
  )

  const unrelatedBatch2Assets = []
  if (batchId === 'batch-01') {
    const batchTwoReport = JSON.parse(await readFile(resolve('docs/visual-theme-batch-2-size-report.json'), 'utf8'))
    await mkdir(outputBackgroundDir, { recursive: true })
    await mkdir(outputPreviewDir, { recursive: true })
    for (const background of batchTwoReport.backgrounds) {
      const output = join(outputBackgroundDir, background.productionFilename)
      await copyFile(resolve('public', 'backgrounds', background.productionFilename), output)
      unrelatedBatch2Assets.push(output)
    }
    for (const preview of batchTwoReport.previewThumbnails) {
      const output = join(outputPreviewDir, preview.thumbnailFilename)
      await copyFile(resolve('public', 'backgrounds', 'previews', preview.thumbnailFilename), output)
      unrelatedBatch2Assets.push(output)
    }
  }
  const unrelatedAssetSnapshots = await Promise.all(unrelatedBatch2Assets.map(async (path) => ({
    path,
    sha256: await calculateFileSha256(path),
    mtimeMs: (await stat(path)).mtimeMs,
  })))
  const result = await importThemeBatch({
    batchId: config.batchId,
    sourceDir,
    sourceArchivePath: archivePath,
    expectedSourceContentSha256: config.expectedSourceContentSha256,
    expectedSourceArchiveSha256: config.expectedSourceArchiveSha256,
    schemaPath: resolve('docs/theme-authoring/theme-manifest.schema.json'),
    outputBackgroundDir,
    outputPreviewDir,
    generatedModulePath,
    reportPath,
    portableSchemaPaths: portableSchemaPathsForBatch(batchId, outputRoot),
    expectedContracts: config.contracts,
    existingThemeIds: config.existingThemeIds,
    existingBackgroundIds: config.existingBackgroundIds,
    generatedExports: config.exports,
    semanticTokenCorrections: config.semanticTokenCorrections,
    write: true,
    allowExistingOutputs: batchId === 'batch-01',
    log: () => undefined,
  })
  const trustedReport = JSON.parse(await readFile(resolve('docs', config.reportFilename), 'utf8'))
  expect(result.report).toEqual(trustedReport)
  expect(await readFile(generatedModulePath, 'utf8')).toBe(
    await readFile(resolve('src', 'generated', config.generatedModuleFilename), 'utf8'),
  )
  for (const background of result.report.backgrounds) {
    await expect(calculateFileSha256(join(outputBackgroundDir, background.productionFilename))).resolves.toBe(
      await calculateFileSha256(resolve('public', 'backgrounds', background.productionFilename)),
    )
  }
  for (const preview of result.report.previewThumbnails) {
    await expect(calculateFileSha256(join(outputPreviewDir, preview.thumbnailFilename))).resolves.toBe(
      await calculateFileSha256(resolve('public', 'backgrounds', 'previews', preview.thumbnailFilename)),
    )
  }
  const latestConfig = Object.values(VISUAL_THEME_BATCH_CONFIGS).at(-1)
  for (const [index, { output }] of currentPortableSchemaPaths.entries()) {
    const schemaText = await readFile(output, 'utf8')
    const schema = JSON.parse(schemaText)
    expect(schema.$defs.quiz.properties.themeId.enum).toEqual(latestConfig.registeredThemeIds)
    expect(schema.$defs.quiz.properties.backgroundId.oneOf[0].enum).toEqual(latestConfig.registeredBackgroundIds)
    if (batchId === 'batch-01') expect(schemaText).toBe(portableSchemaSnapshots[index])
  }
  for (const snapshot of unrelatedAssetSnapshots) {
    await expect(calculateFileSha256(snapshot.path)).resolves.toBe(snapshot.sha256)
    expect((await stat(snapshot.path)).mtimeMs).toBe(snapshot.mtimeMs)
  }
  await expect(calculateFileSha256(archivePath)).resolves.toBe(config.expectedSourceArchiveSha256)
}

describe('reviewed Visual Theme Batch 1 reproduction', () => {
  it.runIf(reviewedBatchAvailable('batch-01'))(
    'reproduces trusted outputs while write/allow-existing preserves current schemas and Batch 2 assets',
    () => reproduceReviewedBatch('batch-01'),
    120_000,
  )
})

describe('reviewed Visual Theme Batch 2 provenance', () => {
  it.runIf(reviewedBatchAvailable('batch-02'))(
    'reproduces every trusted registry, report, background, preview and reviewed digest in temporary output',
    () => reproduceReviewedBatch('batch-02'),
    120_000,
  )
})
