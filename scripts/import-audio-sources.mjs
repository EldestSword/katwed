import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoot = resolve('audio-source')
const zipRoot = resolve(process.env.AUDIO_ZIP_DIR || sourceRoot)
const reportPath = join(sourceRoot, 'import-report.json')
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
export const audioRoles = ['lobby', 'question', 'urgent', 'double-score', 'lock', 'reveal', 'leaderboard', 'final']
const sourcePattern = /^(lobby|question|urgent|double-score|lock|reveal|leaderboard|final)-(\d{2})\.mp3$/u

const rolePatterns = [
  ['double-score', /\b(?:double|doubel)\s+score/i],
  ['leaderboard', /\b(?:leaderboard|leaderbaord|standings)/i],
  ['final', /\bfinal(?:\s+(?:results|standings))?/i],
  ['urgent', /\burgenc(?:y|e|ies)?/i],
  ['question', /\bquestion/i],
  ['lobby', /\blobby/i],
  ['reveal', /\brevea(?:l)?/i],
  ['lock', /\block(?:ed)?/i],
]

function listZipEntries(zipPath) {
  return execFileSync('tar', ['-tf', zipPath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => extname(entry).toLowerCase() === '.mp3')
}

export function classifyAudioRole(filename) {
  for (const [role, pattern] of rolePatterns) {
    if (pattern.test(filename)) return role
  }
  return null
}

export function packNameCandidate(filename) {
  let firstRoleIndex = Number.POSITIVE_INFINITY
  for (const [, pattern] of rolePatterns) {
    const index = filename.search(pattern)
    if (index >= 0) firstRoleIndex = Math.min(firstRoleIndex, index)
  }
  if (!Number.isFinite(firstRoleIndex)) return null
  const prefix = filename.slice(0, firstRoleIndex).replace(/[\s_.-]+$/u, '').trim()
  if (!prefix || /\b(?:premium|short|sting)\b/i.test(prefix)) return null
  return prefix
}

export function slugifyAudioPack(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
}

export function parseAudioPackAliases(value = '') {
  const aliases = new Map()
  for (const pair of value.split(';').map((entry) => entry.trim()).filter(Boolean)) {
    const separator = pair.indexOf('=')
    if (separator <= 0 || separator === pair.length - 1) {
      throw new Error(`Invalid AUDIO_PACK_ALIASES entry: ${pair}. Use Source name=Final name.`)
    }
    aliases.set(pair.slice(0, separator).trim().toLocaleLowerCase('en-GB'), pair.slice(separator + 1).trim())
  }
  return aliases
}

export function describeAudioEntry(entry, aliases = new Map()) {
  const filename = basename(entry, extname(entry))
  const role = classifyAudioRole(basename(entry))
  const candidate = packNameCandidate(filename)
  if (!role || !candidate) return null
  const name = aliases.get(candidate.toLocaleLowerCase('en-GB')) ?? candidate
  const packId = slugifyAudioPack(name)
  return packId ? { entry, role, name, packId } : null
}

function probe(filePath) {
  const raw = execFileSync(ffprobe, [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'format=duration,bit_rate:stream=sample_rate,channels,bit_rate',
    '-of', 'json', filePath,
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  const data = JSON.parse(raw)
  const stream = data.streams?.[0] ?? {}
  return {
    durationSeconds: Number(Number(data.format?.duration ?? 0).toFixed(3)),
    bitrate: Number(stream.bit_rate ?? data.format?.bit_rate ?? 0),
    sampleRate: Number(stream.sample_rate ?? 0),
    channels: Number(stream.channels ?? 0),
  }
}

function readEntry(zipPath, entry) {
  return execFileSync('tar', ['-xOf', zipPath, entry], { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024 })
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function selectedPackIds() {
  const value = process.env.AUDIO_IMPORT_PACK_IDS
  return value ? new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean)) : null
}

function main() {
  if (!existsSync(zipRoot)) throw new Error(`Audio ZIP directory does not exist: ${zipRoot}`)
  const aliases = parseAudioPackAliases(process.env.AUDIO_PACK_ALIASES)
  const selected = selectedPackIds()
  const discovered = new Set()
  const report = {
    generatedAt: new Date().toISOString(),
    sourceDirectory: zipRoot,
    packs: [],
    skippedPacks: [],
    unclassified: [],
  }

  const grouped = new Map()
  for (const zipName of readdirSync(zipRoot).filter((name) => extname(name).toLowerCase() === '.zip').sort()) {
    const zipPath = join(zipRoot, zipName)
    for (const entry of listZipEntries(zipPath)) {
      const described = describeAudioEntry(entry, aliases)
      if (!described) {
        report.unclassified.push({ originalZip: zipName, originalFilename: entry })
        continue
      }
      discovered.add(described.packId)
      const group = grouped.get(described.packId) ?? { packId: described.packId, name: described.name, entries: [] }
      group.entries.push({ ...described, zipName, zipPath })
      grouped.set(described.packId, group)
    }
  }

  for (const group of [...grouped.values()].sort((left, right) => left.packId.localeCompare(right.packId, 'en-GB'))) {
    const originalZips = [...new Set(group.entries.map((entry) => entry.zipName))]
    if (selected && !selected.has(group.packId)) {
      report.skippedPacks.push({ packId: group.packId, name: group.name, originalZips, reason: 'not selected' })
      continue
    }

    const packRoot = join(sourceRoot, group.packId)
    const existing = existsSync(packRoot)
      ? readdirSync(packRoot).filter((file) => sourcePattern.test(file)).sort()
      : []
    const availableRoles = new Set(existing.map((file) => file.match(sourcePattern)[1]))
    group.entries.forEach((entry) => availableRoles.add(entry.role))
    const missing = audioRoles.filter((role) => !availableRoles.has(role))
    if (missing.length > 0) {
      report.skippedPacks.push({
        packId: group.packId, name: group.name, originalZips,
        reason: `incomplete; missing ${missing.join(', ')}`,
      })
      continue
    }

    mkdirSync(packRoot, { recursive: true })
    const counters = Object.fromEntries(audioRoles.map((role) => [role, 0]))
    const knownHashes = Object.fromEntries(audioRoles.map((role) => [role, new Map()]))
    for (const filename of existing) {
      const [, role, index] = filename.match(sourcePattern)
      counters[role] = Math.max(counters[role], Number(index))
      knownHashes[role].set(sha256(readFileSync(join(packRoot, filename))), filename)
    }

    const files = []
    for (const source of group.entries) {
      const data = readEntry(source.zipPath, source.entry)
      const hash = sha256(data)
      let finalFilename = knownHashes[source.role].get(hash)
      let status = 'unchanged'
      if (!finalFilename) {
        counters[source.role] += 1
        finalFilename = `${source.role}-${String(counters[source.role]).padStart(2, '0')}.mp3`
        writeFileSync(join(packRoot, finalFilename), data)
        knownHashes[source.role].set(hash, finalFilename)
        status = 'added'
      }
      const destination = join(packRoot, finalFilename)
      files.push({
        packId: group.packId,
        originalZip: source.zipName,
        originalFilename: source.entry,
        finalLocalFilename: finalFilename,
        detectedRole: source.role,
        status,
        sourceSha256: hash,
        sourceBytes: statSync(destination).size,
        ...probe(destination),
      })
    }
    const finalVariants = Object.fromEntries(audioRoles.map((role) => [role, knownHashes[role].size]))
    report.packs.push({
      packId: group.packId,
      name: group.name,
      originalZips,
      variants: finalVariants,
      addedFiles: files.filter((file) => file.status === 'added').length,
      files,
    })
  }

  if (selected) {
    const missingSelected = [...selected].filter((packId) => !discovered.has(packId))
    if (missingSelected.length > 0) throw new Error(`Selected audio packs were not found: ${missingSelected.join(', ')}.`)
  }

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  const added = report.packs.reduce((total, pack) => total + pack.addedFiles, 0)
  process.stdout.write(`Imported ${report.packs.length} packs and added ${added} files.\n`)
  process.stdout.write(`Traceability report: ${reportPath}\n`)
  if (report.skippedPacks.length > 0) {
    process.stdout.write(`Skipped ${report.skippedPacks.length} unselected or incomplete packs. See ${reportPath}.\n`)
  }
  if (report.unclassified.length > 0) {
    process.stderr.write(`${report.unclassified.length} source files could not be classified. See ${reportPath}.\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
