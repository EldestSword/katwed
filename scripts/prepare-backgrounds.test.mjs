import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  LARGE_OUTPUT_WARNING_BYTES,
  WEBP_QUALITY,
  backgroundIdFromFilename,
  calculateOutputDimensions,
  discoverBackgroundSources,
  formatBytes,
  isLargeOutput,
  isSupportedSourceFile,
  isValidBackgroundId,
  prepareBackgrounds,
} from './prepare-backgrounds.mjs'

sharp.cache(false)

let temporaryRoot
let sourceDir
let outputDir

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'katwed-backgrounds-'))
  sourceDir = join(temporaryRoot, 'sources')
  outputDir = join(temporaryRoot, 'outputs')
  await mkdir(sourceDir, { recursive: true })
})

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

async function createSource(filename, width, height, format = 'png') {
  let image = sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 160 } },
  })
  if (format === 'jpeg') image = image.jpeg()
  else if (format === 'webp') image = image.webp()
  else image = image.png()
  await image.toFile(join(sourceDir, filename))
}

describe('background source discovery', () => {
  it('accepts safe stable IDs and supported extensions case-insensitively', () => {
    for (const id of ['arcade-grid', 'midnight2', 'paper-desk-2']) expect(isValidBackgroundId(id)).toBe(true)
    for (const filename of ['arcade-grid.png', 'arcade-grid.JPG', 'arcade-grid.JPEG', 'arcade-grid.WebP']) {
      expect(isSupportedSourceFile(filename)).toBe(true)
      expect(backgroundIdFromFilename(filename)).toBe('arcade-grid')
    }
  })

  it('rejects unsafe IDs and filenames clearly', async () => {
    for (const id of ['Arcade', 'arcade grid', 'arcade_grid', '-arcade', 'arcade-', 'arcade--grid']) {
      expect(isValidBackgroundId(id)).toBe(false)
    }
    await writeFile(join(sourceDir, 'Arcade Grid.png'), '')
    await expect(discoverBackgroundSources(sourceDir)).rejects.toThrow(/Invalid background filename.*lowercase kebab-case/)
  })

  it('rejects duplicate stems across formats before processing', async () => {
    await writeFile(join(sourceDir, 'arcade-grid.png'), '')
    await writeFile(join(sourceDir, 'arcade-grid.jpg'), '')
    await expect(discoverBackgroundSources(sourceDir)).rejects.toThrow(
      /Duplicate background ID "arcade-grid".*arcade-grid\.jpg.*arcade-grid\.png/,
    )
  })

  it('ignores unrelated files, hidden files and directories', async () => {
    await writeFile(join(sourceDir, 'README.md'), 'Notes')
    await writeFile(join(sourceDir, '.preview.png'), '')
    await mkdir(join(sourceDir, 'folder.png'))
    await writeFile(join(sourceDir, 'paper-desk.PNG'), '')
    await expect(discoverBackgroundSources(sourceDir)).resolves.toEqual([
      { filename: 'paper-desk.PNG', id: 'paper-desk' },
    ])
  })
})

describe('background reporting helpers', () => {
  it('formats byte sizes in readable units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(3 * 1024 ** 2)).toBe('3 MB')
  })

  it('warns only above the configured 500 KB threshold', () => {
    expect(isLargeOutput(LARGE_OUTPUT_WARNING_BYTES)).toBe(false)
    expect(isLargeOutput(LARGE_OUTPUT_WARNING_BYTES + 1)).toBe(true)
  })
})

describe('background preparation', () => {
  it('succeeds for an empty source folder and preserves unrelated existing outputs', async () => {
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'keep.webp'), 'existing')
    const messages = []

    const report = await prepareBackgrounds({ sourceDir, outputDir, log: (message) => messages.push(message) })

    expect(report).toMatchObject({ processedCount: 0, totalInputBytes: 0, totalOutputBytes: 0 })
    expect(messages).toEqual([
      'No background source images found.',
      'Add PNG, JPEG or WebP artwork to artwork/backgrounds-source/ and run this command again.',
    ])
    await expect(readFile(join(outputDir, 'keep.webp'), 'utf8')).resolves.toBe('existing')
  })

  it('centre-crops landscape and square images to exact 16:9 WebP dimensions', async () => {
    await createSource('wide-scene.png', 1536, 1024)
    await createSource('square-scene.png', 100, 100)

    const report = await prepareBackgrounds({ sourceDir, outputDir, log: () => undefined })
    const wideMetadata = await sharp(join(outputDir, 'wide-scene.webp')).metadata()
    const squareMetadata = await sharp(join(outputDir, 'square-scene.webp')).metadata()

    expect(report.processedCount).toBe(2)
    expect(wideMetadata).toMatchObject({ format: 'webp', width: 1536, height: 864 })
    expect(squareMetadata).toMatchObject({ format: 'webp', width: 96, height: 54 })
    expect(wideMetadata.width / wideMetadata.height).toBe(16 / 9)
    expect(squareMetadata.width / squareMetadata.height).toBe(16 / 9)
  })

  it('reduces large images to 1920x1080 and does not upscale smaller images', async () => {
    await createSource('large-scene.png', 2200, 1600)
    await createSource('small-scene.png', 640, 480)

    await prepareBackgrounds({ sourceDir, outputDir, log: () => undefined })

    await expect(sharp(join(outputDir, 'large-scene.webp')).metadata()).resolves.toMatchObject({
      format: 'webp', width: 1920, height: 1080,
    })
    await expect(sharp(join(outputDir, 'small-scene.webp')).metadata()).resolves.toMatchObject({
      format: 'webp', width: 640, height: 360,
    })
    expect(calculateOutputDimensions(1280, 720)).toEqual({ width: 1280, height: 720 })
  })

  it('applies orientation metadata before calculating and cropping the output', async () => {
    await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 80, g: 40, b: 120 } },
    }).withMetadata({ orientation: 6 }).jpeg().toFile(join(sourceDir, 'oriented-scene.jpg'))

    const report = await prepareBackgrounds({ sourceDir, outputDir, log: () => undefined })
    const metadata = await sharp(join(outputDir, 'oriented-scene.webp')).metadata()

    expect(report.results[0]).toMatchObject({ inputWidth: 480, inputHeight: 640 })
    expect(metadata).toMatchObject({ format: 'webp', width: 480, height: 270 })
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
  })

  it('replaces an existing same-ID output only after a new WebP is ready', async () => {
    await createSource('replace-me.png', 640, 480)
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'replace-me.webp'), 'old output')

    await prepareBackgrounds({ sourceDir, outputDir, log: () => undefined })

    const metadata = await sharp(join(outputDir, 'replace-me.webp')).metadata()
    expect(metadata).toMatchObject({ format: 'webp', width: 640, height: 360 })
  })

  it('reports every image, totals and a configurable heavy-output warning', async () => {
    await createSource('reported-scene.png', 640, 480)
    const messages = []
    const warnings = []

    const report = await prepareBackgrounds({
      sourceDir,
      outputDir,
      log: (message) => messages.push(message),
      warn: (message) => warnings.push(message),
      warningThresholdBytes: 1,
    })

    expect(report.processedCount).toBe(1)
    expect(report.totalInputBytes).toBeGreaterThan(0)
    expect(report.totalOutputBytes).toBeGreaterThan(0)
    expect(messages.join('\n')).toMatch(/reported-scene\.png[\s\S]*640x480 -> 640x360[\s\S]*Original total:[\s\S]*WebP total:/)
    expect(warnings).toEqual([
      expect.stringMatching(/reported-scene\.webp is .*Consider simplifying or recompressing/),
    ])
    expect(WEBP_QUALITY).toBe(82)
  })

  it('fails on corrupt recognised input before writing valid batch outputs', async () => {
    await createSource('valid-scene.png', 640, 480)
    await writeFile(join(sourceDir, 'broken-scene.png'), 'not an image')

    await expect(prepareBackgrounds({ sourceDir, outputDir, log: () => undefined })).rejects.toThrow(
      /Could not process "broken-scene\.png"/,
    )
    await expect(readFile(join(outputDir, 'valid-scene.webp'))).rejects.toThrow()
  })
})
