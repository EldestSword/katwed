import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import sharp from 'sharp'
import { formatBytes } from './prepare-backgrounds.mjs'
import {
  ORIGINAL_BACKGROUND_ID_LIST,
  ORIGINAL_THEME_ID_LIST,
  VISUAL_THEME_BATCH_1_CONTRACTS,
  getVisualThemeBatchConfig,
} from './theme-batch-configs.mjs'

export { VISUAL_THEME_BATCH_1_CONTRACTS } from './theme-batch-configs.mjs'

export const THEME_BATCH_WEBP_QUALITY = 82
export const THEME_BATCH_MAX_WIDTH = 1920
export const THEME_BATCH_MAX_HEIGHT = 1080
export const THEME_THUMBNAIL_WIDTH = 480
export const THEME_THUMBNAIL_HEIGHT = 270
export const THEME_THUMBNAIL_QUALITY = 68

const DISPLAY_FONT_IDS = new Set([
  'bricolage-grotesque', 'space-grotesk', 'oswald', 'fraunces', 'cinzel', 'rye',
  'pixelify-sans', 'orbitron', 'limelight', 'uncial-antiqua', 'roboto-slab',
])
const UI_FONT_IDS = new Set(['system-ui', 'bricolage-grotesque', 'space-grotesk', 'roboto-slab'])
const PROHIBITED_MANIFEST_PATTERNS = [
  { pattern: /:\/\//iu, label: 'a remote URL' },
  { pattern: /(?:javascript|data):/iu, label: 'an executable or inline URL scheme' },
  { pattern: /<(?:script|style|iframe)\b/iu, label: 'executable markup' },
  { pattern: /(?:linear|radial)-gradient\s*\(/iu, label: 'raw gradient CSS' },
  { pattern: /rgba?\s*\(/iu, label: 'raw colour CSS' },
  { pattern: /font-family|url\s*\(/iu, label: 'raw font or URL CSS' },
]

sharp.cache(false)

const SOURCE_CONTENT_DIGEST_DOMAIN = 'katwed-theme-source-content-v1\0'

function uint64Buffer(value) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(value))
  return buffer
}

function normaliseExpectedSha256(value, label) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/iu.test(value)) {
    throw new Error(`${label} must be a 64-character SHA-256 digest.`)
  }
  return value.toLowerCase()
}

async function collectSourceFiles(directoryPath) {
  const files = []
  const entries = await readdir(directoryPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)
    if (entry.isDirectory()) files.push(...await collectSourceFiles(entryPath))
    else if (entry.isFile()) files.push(entryPath)
    else throw new Error(`Theme source contains an unsupported filesystem entry: ${entryPath}`)
  }
  return files
}

async function updateHashFromFile(hash, filePath, expectedBytes) {
  let bytesRead = 0
  for await (const chunk of createReadStream(filePath)) {
    bytesRead += chunk.length
    hash.update(chunk)
  }
  if (expectedBytes !== undefined && bytesRead !== expectedBytes) {
    throw new Error(`Theme source changed while its digest was being calculated: ${filePath}`)
  }
}

export async function calculateSourceContentSha256FromPaths(sourceDir, filePaths) {
  const resolvedSourceDir = resolve(sourceDir)
  const entries = []
  const seenRelativePaths = new Set()
  for (const filePath of filePaths) {
    const resolvedFilePath = resolve(filePath)
    const platformRelativePath = relative(resolvedSourceDir, resolvedFilePath)
    if (!platformRelativePath || platformRelativePath === '..' || platformRelativePath.startsWith(`..${sep}`) || isAbsolute(platformRelativePath)) {
      throw new Error(`Theme source digest path is outside the source directory: ${resolvedFilePath}`)
    }
    const relativePath = platformRelativePath.replaceAll('\\', '/')
    if (seenRelativePaths.has(relativePath)) throw new Error(`Duplicate theme source digest path: ${relativePath}`)
    seenRelativePaths.add(relativePath)
    entries.push({ filePath: resolvedFilePath, relativePath })
  }
  entries.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0)

  const hash = createHash('sha256')
  hash.update(SOURCE_CONTENT_DIGEST_DOMAIN, 'utf8')
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.relativePath, 'utf8')
    const fileStat = await stat(entry.filePath)
    if (!fileStat.isFile()) throw new Error(`Theme source digest entry is not a file: ${entry.filePath}`)
    hash.update(uint64Buffer(pathBytes.length))
    hash.update(pathBytes)
    hash.update(uint64Buffer(fileStat.size))
    await updateHashFromFile(hash, entry.filePath, fileStat.size)
  }
  return hash.digest('hex')
}

export async function calculateSourceContentSha256(sourceDir) {
  const resolvedSourceDir = resolve(sourceDir)
  return calculateSourceContentSha256FromPaths(resolvedSourceDir, await collectSourceFiles(resolvedSourceDir))
}

export async function calculateFileSha256(filePath) {
  const resolvedFilePath = resolve(filePath)
  const fileStat = await stat(resolvedFilePath)
  if (!fileStat.isFile()) throw new Error(`SHA-256 source is not a file: ${resolvedFilePath}`)
  const hash = createHash('sha256')
  await updateHashFromFile(hash, resolvedFilePath, fileStat.size)
  return hash.digest('hex')
}

function verifyDigest({ actual, expected, label }) {
  if (expected && actual !== expected) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, calculated ${actual}.`)
  }
}

function exactArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function formatAjvErrors(errors) {
  return (errors ?? []).map((error) => {
    const location = error.instancePath || '/'
    return `${location} ${error.message}`
  }).join('; ')
}

function compileStageBackground(value) {
  if (value.kind === 'solid') return value.colour
  const position = value.position.replaceAll('-', ' ').replace('centre', 'center')
  return `radial-gradient(circle at ${position}, ${value.inner}, ${value.outer} ${value.outerStopPercent}%)`
}

function compileShadow(value) {
  return `${value.xPx}px ${value.yPx}px ${value.blurPx}px ${value.colour}`
}

export function compileThemeManifest(manifest) {
  const tokens = manifest.tokens
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    keywords: manifest.keywords,
    swatches: manifest.swatches,
    typography: { displayFontId: manifest.displayFontId, uiFontId: manifest.uiFontId },
    preview: {
      kind: 'thumbnail',
      label: manifest.preview.label,
      thumbnailPath: `/backgrounds/previews/${manifest.id}.webp`,
    },
    tokens: {
      canvas: tokens.canvas,
      surface: tokens.surface,
      surfaceSecondary: tokens.surfaceSecondary,
      text: tokens.text,
      textMuted: tokens.textMuted,
      border: tokens.border,
      accent: tokens.accent,
      accentSecondary: tokens.accentSecondary,
      accentText: tokens.accentText,
      focus: tokens.focus,
      shadow: compileShadow(tokens.shadow),
      feature: { background: tokens.featureBackground, text: tokens.featureText },
      button: { background: tokens.buttonBackground, text: tokens.buttonText, shadow: tokens.buttonShadow },
      answer: { surface: tokens.answerSurface, selected: tokens.answerSelected },
      leaderboard: { surface: tokens.leaderboardSurface, highlight: tokens.leaderboardHighlight },
      progress: tokens.progress,
      stage: {
        background: compileStageBackground(tokens.stageBackground),
        playerBarBackground: tokens.playerBarBackground,
        playerBarText: tokens.playerBarText,
        playerBarMuted: tokens.playerBarMuted,
        text: tokens.stageText,
        textMuted: tokens.stageTextMuted,
        surface: tokens.stageSurface,
        border: tokens.stageBorder,
        roomAccent: tokens.roomAccent,
        eyebrow: tokens.stageEyebrow,
      },
    },
  }
}

const BATCH_1_GENERATED_EXPORTS = {
  themeIds: 'VISUAL_THEME_BATCH_1_THEME_IDS',
  backgroundIds: 'VISUAL_THEME_BATCH_1_BACKGROUND_IDS',
  themes: 'visualThemeBatch1Themes',
  backgrounds: 'visualThemeBatch1Backgrounds',
}

function validateGeneratedExports(exports) {
  for (const [label, value] of Object.entries(exports)) {
    if (typeof value !== 'string' || !/^[A-Z_a-z][\w]*$/u.test(value)) {
      throw new Error(`Generated ${label} export must be a safe JavaScript identifier.`)
    }
  }
}

function buildGeneratedModule(manifests, generatedExports) {
  validateGeneratedExports(generatedExports)
  const themes = manifests.map(compileThemeManifest)
  const backgrounds = manifests.flatMap((manifest) => manifest.backgrounds.map((background) => ({
    id: background.id,
    name: background.name,
    themeId: manifest.id,
    assetPath: `/backgrounds/${background.id}.webp`,
  })))
  const themeIds = themes.map((theme) => theme.id)
  const backgroundIds = backgrounds.map((background) => background.id)
  return [
    '// Generated by scripts/import-theme-batch.mjs from a reviewed local source package.',
    '// Do not edit by hand.',
    '',
    `export const ${generatedExports.themeIds} = ${JSON.stringify(themeIds, null, 2)} as const`,
    '',
    `export const ${generatedExports.backgroundIds} = ${JSON.stringify(backgroundIds, null, 2)} as const`,
    '',
    `export const ${generatedExports.themes} = ${JSON.stringify(themes, null, 2)} as const`,
    '',
    `export const ${generatedExports.backgrounds} = ${JSON.stringify(backgrounds, null, 2)} as const`,
    '',
  ].join('\n')
}

async function buildPortableSchemaUpdates(schemaPaths, themeIds, backgroundIds) {
  const updates = []
  for (const schemaPath of schemaPaths) {
    const source = await readFile(schemaPath, 'utf8')
    const schema = JSON.parse(source)
    const quizProperties = schema?.$defs?.quiz?.properties
    if (!quizProperties?.themeId || !quizProperties?.backgroundId) {
      throw new Error(`${schemaPath}: portable schema does not expose controlled theme and background fields.`)
    }
    let content = replaceJsonObjectProperty(source, 'themeId', { enum: themeIds })
    content = replaceJsonObjectProperty(content, 'backgroundId', {
      oneOf: [{ enum: backgroundIds }, { type: 'null' }],
    })
    JSON.parse(content)
    updates.push({ path: schemaPath, content: content.endsWith('\n') ? content : `${content}\n` })
  }
  return updates
}

function replaceJsonObjectProperty(source, propertyName, value) {
  const propertyPattern = new RegExp(`"${propertyName}"\\s*:\\s*`)
  const match = propertyPattern.exec(source)
  if (!match) throw new Error(`Portable schema is missing ${propertyName}.`)
  const objectStart = match.index + match[0].length
  if (source[objectStart] !== '{') throw new Error(`Portable schema ${propertyName} must be an object.`)

  let depth = 0
  let inString = false
  let escaped = false
  let objectEnd = -1
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        objectEnd = index + 1
        break
      }
    }
  }
  if (objectEnd === -1) throw new Error(`Portable schema ${propertyName} object is incomplete.`)

  const lineStart = source.lastIndexOf('\n', match.index) + 1
  const linePrefix = source.slice(lineStart, match.index)
  const indentation = /^\s*$/.test(linePrefix) ? linePrefix : ''
  const replacement = JSON.stringify(value, null, 2)
    .split('\n')
    .map((line, index) => index === 0 ? line : `${indentation}${line}`)
    .join('\n')
  return `${source.slice(0, objectStart)}${replacement}${source.slice(objectEnd)}`
}

async function inspectPng(imagePath, label) {
  try {
    const image = sharp(imagePath, { failOn: 'error', limitInputPixels: 1920 * 1080 })
    const [metadata, statistics, sourceStat] = await Promise.all([
      image.metadata(),
      image.stats(),
      stat(imagePath),
    ])
    if (metadata.format !== 'png') throw new Error(`expected PNG, found ${metadata.format ?? 'unknown format'}`)
    if (metadata.width !== 1920 || metadata.height !== 1080) {
      throw new Error(`expected 1920x1080, found ${metadata.width ?? '?'}x${metadata.height ?? '?'}`)
    }
    if (metadata.width * 9 !== metadata.height * 16) throw new Error('dimensions are not exact 16:9')
    if (![3, 4].includes(metadata.channels ?? 0)) {
      throw new Error(`expected three or four channels, found ${metadata.channels ?? 'unknown'}`)
    }
    if (metadata.hasAlpha) {
      const alpha = statistics.channels[3]
      if (!alpha || alpha.min < 255 || alpha.max < 255) {
        throw new Error('contains unexpected transparent pixels')
      }
    }
    return { width: metadata.width, height: metadata.height, channels: metadata.channels, bytes: sourceStat.size }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    throw new Error(`${label}: source image validation failed: ${message}`)
  }
}

async function buildProductionImage(inputPath, outputPath) {
  await sharp(inputPath, { failOn: 'error', limitInputPixels: 1920 * 1080 })
    .resize({
      width: THEME_BATCH_MAX_WIDTH,
      height: THEME_BATCH_MAX_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .webp({ quality: THEME_BATCH_WEBP_QUALITY })
    .toFile(outputPath)
  const [metadata, outputStat] = await Promise.all([sharp(outputPath).metadata(), stat(outputPath)])
  if (metadata.format !== 'webp' || metadata.width !== 1920 || metadata.height !== 1080) {
    throw new Error(`Production output ${basename(outputPath)} is not a 1920x1080 WebP.`)
  }
  if (metadata.exif || metadata.icc || metadata.xmp) {
    throw new Error(`Production output ${basename(outputPath)} retained unnecessary metadata.`)
  }
  return outputStat.size
}

async function buildThumbnail(inputPath, outputPath) {
  await sharp(inputPath, { failOn: 'error', limitInputPixels: 1920 * 1080 })
    .resize({
      width: THEME_THUMBNAIL_WIDTH,
      height: THEME_THUMBNAIL_HEIGHT,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .webp({ quality: THEME_THUMBNAIL_QUALITY })
    .toFile(outputPath)
  const [metadata, outputStat] = await Promise.all([sharp(outputPath).metadata(), stat(outputPath)])
  if (metadata.format !== 'webp' || metadata.width !== THEME_THUMBNAIL_WIDTH || metadata.height !== THEME_THUMBNAIL_HEIGHT) {
    throw new Error(`Thumbnail ${basename(outputPath)} is not a ${THEME_THUMBNAIL_WIDTH}x${THEME_THUMBNAIL_HEIGHT} WebP.`)
  }
  return outputStat.size
}

async function validateManifestFolder({ batchId, folderPath, folderName, validateSchema, contract }) {
  const manifestPath = join(folderPath, 'theme.json')
  if (!existsSync(manifestPath)) throw new Error(`${folderName}: missing theme.json.`)
  const rawManifest = await readFile(manifestPath, 'utf8')
  let manifest
  try {
    manifest = JSON.parse(rawManifest)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    throw new Error(`${folderName}: theme.json is not valid JSON: ${message}`)
  }
  if (!validateSchema(manifest)) {
    throw new Error(`${folderName}: theme.json does not match the v2 schema: ${formatAjvErrors(validateSchema.errors)}`)
  }
  if (manifest.id !== folderName) throw new Error(`${folderName}: manifest ID must match its folder name.`)
  if (!DISPLAY_FONT_IDS.has(manifest.displayFontId)) {
    throw new Error(`${folderName}: display font is not approved for display use.`)
  }
  if (!UI_FONT_IDS.has(manifest.uiFontId)) throw new Error(`${folderName}: UI font is not approved for utility use.`)
  for (const prohibited of PROHIBITED_MANIFEST_PATTERNS) {
    if (prohibited.pattern.test(rawManifest)) throw new Error(`${folderName}: manifest contains ${prohibited.label}.`)
  }
  if (!manifest.preview || manifest.preview.kind !== 'thumbnail') {
    throw new Error(`${folderName}: ${batchId} requires one reviewed thumbnail preview source.`)
  }
  if (!contract) throw new Error(`${folderName}: is not part of the reviewed ${batchId} contract.`)
  for (const field of ['name', 'category', 'displayFontId', 'uiFontId']) {
    if (manifest[field] !== contract[field]) {
      throw new Error(`${folderName}: ${field} differs from the reviewed batch contract.`)
    }
  }
  const backgroundIds = manifest.backgrounds.map((background) => background.id)
  if (!exactArray(backgroundIds, contract.backgroundIds)) {
    throw new Error(`${folderName}: background IDs or order differ from the reviewed batch contract.`)
  }
  const filenames = new Set(['theme.json'])
  const imageResults = []
  for (const background of manifest.backgrounds) {
    if (!background.id.startsWith(`${manifest.id}-`)) {
      throw new Error(`${folderName}: background ${background.id} does not use its owning theme prefix.`)
    }
    if (background.sourceFilename !== `${background.id}.png`) {
      throw new Error(`${folderName}: ${background.id} must use the exact source filename ${background.id}.png.`)
    }
    filenames.add(background.sourceFilename)
    const imagePath = join(folderPath, background.sourceFilename)
    if (!existsSync(imagePath)) throw new Error(`${folderName}: missing ${background.sourceFilename}.`)
    const inspection = await inspectPng(imagePath, `${folderName}/${background.sourceFilename}`)
    imageResults.push({ ...background, imagePath, sourceBytes: inspection.bytes })
  }
  if (!filenames.has(manifest.preview.sourceFilename)) {
    throw new Error(`${folderName}: preview source must name one of the three registered backgrounds.`)
  }
  const entries = await readdir(folderPath, { withFileTypes: true })
  const actualFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
  const expectedFiles = [...filenames].sort()
  if (entries.some((entry) => !entry.isFile()) || !exactArray(actualFiles, expectedFiles)) {
    throw new Error(`${folderName}: folder contents differ from theme.json.`)
  }
  return { manifest, folderPath, images: imageResults }
}

export async function importThemeBatch({
  batchId = 'batch-01',
  sourceDir,
  sourceArchivePath,
  expectedSourceContentSha256,
  expectedSourceArchiveSha256,
  schemaPath,
  outputBackgroundDir,
  outputPreviewDir,
  generatedModulePath,
  reportPath,
  portableSchemaPaths = [],
  expectedContracts = VISUAL_THEME_BATCH_1_CONTRACTS,
  existingThemeIds = ORIGINAL_THEME_ID_LIST,
  existingBackgroundIds = ORIGINAL_BACKGROUND_ID_LIST,
  generatedExports = BATCH_1_GENERATED_EXPORTS,
  semanticTokenCorrections = [],
  write = false,
  allowExistingOutputs = false,
  log = console.log,
}) {
  if (typeof batchId !== 'string' || !/^batch-\d{2,}$/u.test(batchId)) {
    throw new Error('Theme batch ID must use the form batch-01.')
  }
  const resolvedSourceDir = resolve(sourceDir)
  if (!existsSync(resolvedSourceDir)) throw new Error(`Theme batch source does not exist: ${resolvedSourceDir}`)
  const expectedContentDigest = normaliseExpectedSha256(
    expectedSourceContentSha256,
    'Expected source content digest',
  )
  const expectedArchiveDigest = normaliseExpectedSha256(
    expectedSourceArchiveSha256,
    'Expected source archive digest',
  )
  if (expectedArchiveDigest && !sourceArchivePath) {
    throw new Error('An expected source archive digest requires sourceArchivePath.')
  }
  const sourceContentSha256 = await calculateSourceContentSha256(resolvedSourceDir)
  verifyDigest({
    actual: sourceContentSha256,
    expected: expectedContentDigest,
    label: 'Theme source content',
  })
  let sourceArchiveSha256
  if (sourceArchivePath) {
    sourceArchiveSha256 = await calculateFileSha256(sourceArchivePath)
    verifyDigest({
      actual: sourceArchiveSha256,
      expected: expectedArchiveDigest,
      label: 'Theme source archive',
    })
  }
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validateSchema = ajv.compile(schema)
  const expectedThemeIds = Object.keys(expectedContracts)
  if (expectedThemeIds.length === 0) throw new Error(`${batchId}: reviewed theme contract is empty.`)
  if (new Set(existingThemeIds).size !== existingThemeIds.length) {
    throw new Error(`${batchId}: existing theme IDs must be unique.`)
  }
  if (new Set(existingBackgroundIds).size !== existingBackgroundIds.length) {
    throw new Error(`${batchId}: existing background IDs must be unique.`)
  }
  const entries = await readdir(resolvedSourceDir, { withFileTypes: true })
  const folderNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  if (entries.some((entry) => !entry.isDirectory()) || !exactArray(folderNames, [...expectedThemeIds].sort())) {
    throw new Error(`Theme folders must be exactly: ${[...expectedThemeIds].sort().join(', ')}.`)
  }

  const validatedById = new Map()
  for (const themeId of expectedThemeIds) {
    const result = await validateManifestFolder({
      batchId,
      folderPath: join(resolvedSourceDir, themeId),
      folderName: themeId,
      validateSchema,
      contract: expectedContracts[themeId],
    })
    validatedById.set(themeId, result)
  }
  const validated = expectedThemeIds.map((themeId) => validatedById.get(themeId))
  const manifests = validated.map((item) => item.manifest)
  const allBackgroundIds = manifests.flatMap((manifest) => manifest.backgrounds.map((background) => background.id))
  if (new Set(allBackgroundIds).size !== allBackgroundIds.length) throw new Error('Background IDs must be unique across the complete batch.')
  const existingThemeIdSet = new Set(existingThemeIds)
  const existingBackgroundIdSet = new Set(existingBackgroundIds)
  if (expectedThemeIds.some((id) => existingThemeIdSet.has(id))) {
    throw new Error(`${batchId}: a theme ID collides with an existing registered theme.`)
  }
  if (allBackgroundIds.some((id) => existingBackgroundIdSet.has(id))) {
    throw new Error(`${batchId}: a background ID collides with an existing registered background.`)
  }

  if (write && !allowExistingOutputs) {
    const collisions = [
      ...allBackgroundIds.map((id) => join(outputBackgroundDir, `${id}.webp`)),
      ...expectedThemeIds.map((id) => join(outputPreviewDir, `${id}.webp`)),
      generatedModulePath,
      reportPath,
    ].filter(existsSync)
    if (collisions.length > 0) {
      throw new Error(`Refusing to replace existing outputs without --allow-existing: ${collisions.join(', ')}`)
    }
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'katwed-theme-import-'))
  const temporaryBackgroundDir = join(temporaryRoot, 'backgrounds')
  const temporaryPreviewDir = join(temporaryRoot, 'previews')
  await Promise.all([mkdir(temporaryBackgroundDir), mkdir(temporaryPreviewDir)])
  try {
    const backgroundReport = []
    const thumbnailReport = []
    for (const item of validated) {
      for (const image of item.images) {
        const outputPath = join(temporaryBackgroundDir, `${image.id}.webp`)
        const outputBytes = await buildProductionImage(image.imagePath, outputPath)
        backgroundReport.push({
          id: image.id,
          themeId: item.manifest.id,
          sourceFilename: image.sourceFilename,
          sourceBytes: image.sourceBytes,
          productionFilename: `${image.id}.webp`,
          productionBytes: outputBytes,
          width: 1920,
          height: 1080,
          quality: THEME_BATCH_WEBP_QUALITY,
        })
      }
      const previewSource = item.images.find((image) => image.sourceFilename === item.manifest.preview.sourceFilename)
      const thumbnailPath = join(temporaryPreviewDir, `${item.manifest.id}.webp`)
      const thumbnailBytes = await buildThumbnail(previewSource.imagePath, thumbnailPath)
      thumbnailReport.push({
        themeId: item.manifest.id,
        sourceFilename: previewSource.sourceFilename,
        thumbnailFilename: `${item.manifest.id}.webp`,
        thumbnailBytes,
        width: THEME_THUMBNAIL_WIDTH,
        height: THEME_THUMBNAIL_HEIGHT,
        quality: THEME_THUMBNAIL_QUALITY,
      })
    }

    const generatedModule = buildGeneratedModule(manifests, generatedExports)
    const allThemeIds = [...existingThemeIds, ...expectedThemeIds]
    const allRegisteredBackgroundIds = [...existingBackgroundIds, ...allBackgroundIds]
    const portableSchemaUpdates = await buildPortableSchemaUpdates(
      portableSchemaPaths,
      allThemeIds,
      allRegisteredBackgroundIds,
    )
    const totalSourceBytes = backgroundReport.reduce((total, item) => total + item.sourceBytes, 0)
    const totalProductionBytes = backgroundReport.reduce((total, item) => total + item.productionBytes, 0)
    const smallestBackground = backgroundReport.reduce((smallest, item) => (
      item.productionBytes < smallest.productionBytes ? item : smallest
    ))
    const largestBackground = backgroundReport.reduce((largest, item) => (
      item.productionBytes > largest.productionBytes ? item : largest
    ))
    const report = {
      batchId,
      sourceContentSha256,
      ...(sourceArchiveSha256 ? { sourceArchiveSha256 } : {}),
      themeCount: manifests.length,
      backgroundCount: backgroundReport.length,
      thumbnailCount: thumbnailReport.length,
      production: {
        format: 'webp',
        quality: THEME_BATCH_WEBP_QUALITY,
        maximumDimensions: `${THEME_BATCH_MAX_WIDTH}x${THEME_BATCH_MAX_HEIGHT}`,
        totalSourceBytes,
        totalProductionBytes,
        reductionPercent: Number(((1 - (totalProductionBytes / totalSourceBytes)) * 100).toFixed(2)),
        averageBytes: Math.round(totalProductionBytes / backgroundReport.length),
        smallest: { id: smallestBackground.id, bytes: smallestBackground.productionBytes },
        largest: { id: largestBackground.id, bytes: largestBackground.productionBytes },
      },
      thumbnails: {
        format: 'webp',
        quality: THEME_THUMBNAIL_QUALITY,
        dimensions: `${THEME_THUMBNAIL_WIDTH}x${THEME_THUMBNAIL_HEIGHT}`,
        totalBytes: thumbnailReport.reduce((total, item) => total + item.thumbnailBytes, 0),
      },
      semanticTokenCorrections,
      portableFormat: {
        exportVersion: 5,
        versionBumpRequired: false,
        decision: 'Additive controlled-ID expansion; v5 semantics are unchanged and historical imports remain supported.',
      },
      backgrounds: backgroundReport,
      previewThumbnails: thumbnailReport,
    }

    if (write) {
      await Promise.all([
        mkdir(outputBackgroundDir, { recursive: true }),
        mkdir(outputPreviewDir, { recursive: true }),
        mkdir(dirname(generatedModulePath), { recursive: true }),
        mkdir(dirname(reportPath), { recursive: true }),
      ])
      for (const item of backgroundReport) {
        await copyFile(join(temporaryBackgroundDir, item.productionFilename), join(outputBackgroundDir, item.productionFilename))
      }
      for (const item of thumbnailReport) {
        await copyFile(join(temporaryPreviewDir, item.thumbnailFilename), join(outputPreviewDir, item.thumbnailFilename))
      }
      await writeFile(generatedModulePath, generatedModule, 'utf8')
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      for (const update of portableSchemaUpdates) await writeFile(update.path, update.content, 'utf8')
    }

    log(`Validated ${manifests.length} themes and ${backgroundReport.length} source backgrounds.`)
    log(`Source content SHA-256: ${sourceContentSha256}.`)
    if (sourceArchiveSha256) log(`Source archive SHA-256: ${sourceArchiveSha256}.`)
    log(`Production WebPs: ${formatBytes(report.production.totalSourceBytes)} -> ${formatBytes(report.production.totalProductionBytes)}.`)
    log(`Preview thumbnails: ${formatBytes(report.thumbnails.totalBytes)}.`)
    log(write ? 'Production outputs written.' : 'Dry run only; no production outputs written.')
    return { manifests, report, generatedModule }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

function parseArguments(arguments_) {
  const options = {
    batchId: 'batch-01',
    sourceDir: null,
    sourceArchivePath: null,
    expectedSourceContentSha256: null,
    expectedSourceArchiveSha256: null,
    write: false,
    allowExistingOutputs: false,
  }
  const readValue = (argument, index) => {
    const value = arguments_[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
    return value
  }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--write') options.write = true
    else if (argument === '--allow-existing') options.allowExistingOutputs = true
    else if (argument === '--batch') {
      options.batchId = readValue(argument, index)
      index += 1
    } else if (argument === '--source') {
      options.sourceDir = readValue(argument, index)
      index += 1
    } else if (argument === '--source-archive') {
      options.sourceArchivePath = readValue(argument, index)
      index += 1
    } else if (argument === '--expected-content-sha256') {
      options.expectedSourceContentSha256 = readValue(argument, index)
      index += 1
    } else if (argument === '--expected-archive-sha256') {
      options.expectedSourceArchiveSha256 = readValue(argument, index)
      index += 1
    } else throw new Error(`Unknown theme import argument: ${argument}`)
  }
  return options
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runningAsCommand = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (runningAsCommand) {
  const options = parseArguments(process.argv.slice(2))
  const batchConfig = getVisualThemeBatchConfig(options.batchId)
  if (!batchConfig) {
    console.error(`Theme batch import failed: unknown reviewed batch ${options.batchId}.`)
    process.exitCode = 1
  } else importThemeBatch({
    batchId: batchConfig.batchId,
    sourceDir: options.sourceDir ?? join(repositoryRoot, 'theme-source', batchConfig.sourceDirectory),
    sourceArchivePath: options.sourceArchivePath ?? join(
      repositoryRoot,
      'theme-source',
      batchConfig.sourceArchiveFilename,
    ),
    expectedSourceContentSha256: options.expectedSourceContentSha256
      ?? batchConfig.expectedSourceContentSha256,
    expectedSourceArchiveSha256: options.expectedSourceArchiveSha256
      ?? batchConfig.expectedSourceArchiveSha256,
    schemaPath: join(repositoryRoot, 'docs', 'theme-authoring', 'theme-manifest.schema.json'),
    outputBackgroundDir: join(repositoryRoot, 'public', 'backgrounds'),
    outputPreviewDir: join(repositoryRoot, 'public', 'backgrounds', 'previews'),
    generatedModulePath: join(repositoryRoot, 'src', 'generated', batchConfig.generatedModuleFilename),
    reportPath: join(repositoryRoot, 'docs', batchConfig.reportFilename),
    portableSchemaPaths: [1, 2, 3, 4, 5].map((version) => (
      join(repositoryRoot, 'docs', 'schemas', `katwed-quiz-v${version}.schema.json`)
    )),
    expectedContracts: batchConfig.contracts,
    existingThemeIds: batchConfig.existingThemeIds,
    existingBackgroundIds: batchConfig.existingBackgroundIds,
    generatedExports: batchConfig.exports,
    semanticTokenCorrections: batchConfig.semanticTokenCorrections,
    write: options.write,
    allowExistingOutputs: options.allowExistingOutputs,
  }).catch((reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(`Theme batch import failed: ${message}`)
    process.exitCode = 1
  })
}
