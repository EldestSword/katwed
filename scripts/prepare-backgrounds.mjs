import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

export const BACKGROUND_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_OUTPUT_WIDTH = 1920
export const MAX_OUTPUT_HEIGHT = 1080
export const WEBP_QUALITY = 82
export const LARGE_OUTPUT_WARNING_BYTES = 500 * 1024

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export function isSupportedSourceFile(filename) {
  return !filename.startsWith('.') && SUPPORTED_EXTENSIONS.has(extname(filename).toLowerCase())
}

export function isValidBackgroundId(value) {
  return BACKGROUND_ID_PATTERN.test(value)
}

export function backgroundIdFromFilename(filename) {
  if (!isSupportedSourceFile(filename)) {
    throw new Error(`Unsupported background source file "${filename}".`)
  }
  const extension = extname(filename)
  const id = basename(filename, extension)
  if (!isValidBackgroundId(id)) {
    throw new Error(
      `Invalid background filename "${filename}". Use a lowercase kebab-case name such as "arcade-grid.png".`,
    )
  }
  return id
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Byte size must be a non-negative finite number.')
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${formatUnit(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${formatUnit(bytes / 1024 ** 2)} MB`
  return `${formatUnit(bytes / 1024 ** 3)} GB`
}

function formatUnit(value) {
  return value.toFixed(1).replace(/\.0$/, '')
}

export function isLargeOutput(bytes, thresholdBytes = LARGE_OUTPUT_WARNING_BYTES) {
  return bytes > thresholdBytes
}

export function calculateOutputDimensions(width, height) {
  if (!Number.isInteger(width) || width < 16 || !Number.isInteger(height) || height < 9) {
    throw new Error('Background images must be at least 16x9 pixels.')
  }
  const scaleUnit = Math.min(
    Math.floor(width / 16),
    Math.floor(height / 9),
    MAX_OUTPUT_WIDTH / 16,
    MAX_OUTPUT_HEIGHT / 9,
  )
  return { width: scaleUnit * 16, height: scaleUnit * 9 }
}

export async function discoverBackgroundSources(sourceDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const sources = entries
    .filter((entry) => entry.isFile() && isSupportedSourceFile(entry.name))
    .map((entry) => ({ filename: entry.name, id: backgroundIdFromFilename(entry.name) }))
    .sort((left, right) => left.filename.localeCompare(right.filename, 'en-GB'))

  const seen = new Map()
  for (const source of sources) {
    const previous = seen.get(source.id)
    if (previous) {
      throw new Error(
        `Duplicate background ID "${source.id}" from "${previous}" and "${source.filename}". ` +
        'Background IDs must be unique across source formats.',
      )
    }
    seen.set(source.id, source.filename)
  }
  return sources
}

function orientedDimensions(metadata) {
  if (!metadata.width || !metadata.height) throw new Error('Image dimensions could not be read.')
  const swapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8
  return swapsAxes
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height }
}

async function inspectSource(sourceDir, source) {
  const inputPath = join(sourceDir, source.filename)
  try {
    const [metadata, inputStats] = await Promise.all([
      sharp(inputPath, { failOn: 'error' }).metadata(),
      stat(inputPath),
    ])
    const dimensions = orientedDimensions(metadata)
    return {
      ...source,
      inputPath,
      inputBytes: inputStats.size,
      inputWidth: dimensions.width,
      inputHeight: dimensions.height,
      outputDimensions: calculateOutputDimensions(dimensions.width, dimensions.height),
    }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    throw new Error(`Could not process "${source.filename}": ${message}`)
  }
}

async function writeBackground(source, outputDir) {
  const outputFilename = `${source.id}.webp`
  const outputPath = join(outputDir, outputFilename)
  const temporaryPath = join(outputDir, `.${source.id}.${process.pid}.${randomUUID()}.webp`)
  try {
    await sharp(source.inputPath, { failOn: 'error' })
      .rotate()
      .resize({
        width: source.outputDimensions.width,
        height: source.outputDimensions.height,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .webp({ quality: WEBP_QUALITY })
      .toFile(temporaryPath)

    await rm(outputPath, { force: true })
    await rename(temporaryPath, outputPath)
    const outputStats = await stat(outputPath)
    return { ...source, outputFilename, outputPath, outputBytes: outputStats.size }
  } catch (reason) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    const message = reason instanceof Error ? reason.message : String(reason)
    throw new Error(`Could not write "${outputFilename}": ${message}`)
  }
}

export async function prepareBackgrounds({
  sourceDir,
  outputDir,
  log = console.log,
  warn = console.warn,
  warningThresholdBytes = LARGE_OUTPUT_WARNING_BYTES,
}) {
  await mkdir(sourceDir, { recursive: true })
  await mkdir(outputDir, { recursive: true })

  const sources = await discoverBackgroundSources(sourceDir)
  if (sources.length === 0) {
    log('No background source images found.')
    log('Add PNG, JPEG or WebP artwork to artwork/backgrounds-source/ and run this command again.')
    return { processedCount: 0, totalInputBytes: 0, totalOutputBytes: 0, results: [] }
  }

  // Inspect the complete recognised batch before replacing any existing output.
  const inspected = []
  for (const source of sources) inspected.push(await inspectSource(sourceDir, source))

  const results = []
  for (const source of inspected) {
    const result = await writeBackground(source, outputDir)
    results.push(result)
    log(`[ok] ${result.filename}`)
    log(`  ${result.inputWidth}x${result.inputHeight} -> ${result.outputDimensions.width}x${result.outputDimensions.height}`)
    log(`  ${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`)
    if (isLargeOutput(result.outputBytes, warningThresholdBytes)) {
      warn(
        `WARNING: ${result.outputFilename} is ${formatBytes(result.outputBytes)}. ` +
        'Consider simplifying or recompressing the source artwork.',
      )
    }
  }

  const totalInputBytes = results.reduce((total, result) => total + result.inputBytes, 0)
  const totalOutputBytes = results.reduce((total, result) => total + result.outputBytes, 0)
  const savedPercent = totalInputBytes === 0 ? 0 : (1 - totalOutputBytes / totalInputBytes) * 100
  log('')
  log(`Processed ${results.length} background${results.length === 1 ? '' : 's'}`)
  log(`Original total: ${formatBytes(totalInputBytes)}`)
  log(`WebP total: ${formatBytes(totalOutputBytes)}`)
  log(`Saved: ${savedPercent.toFixed(1)}%`)

  return { processedCount: results.length, totalInputBytes, totalOutputBytes, results }
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runningAsCommand = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (runningAsCommand) {
  prepareBackgrounds({
    sourceDir: join(repositoryRoot, 'artwork', 'backgrounds-source'),
    outputDir: join(repositoryRoot, 'public', 'backgrounds'),
  }).catch((reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(`Background preparation failed: ${message}`)
    process.exitCode = 1
  })
}
