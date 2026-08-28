import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const sourceRoot = resolve('audio-source')
const reportPath = join(sourceRoot, 'import-report.json')
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const roles = ['lobby', 'question', 'urgent', 'double-score', 'lock', 'reveal', 'leaderboard', 'final']

const rolePatterns = [
  ['double-score', /\b(?:double|doubel)\s+score/i],
  ['leaderboard', /\b(?:leaderboard|standings)/i],
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

function classify(filename) {
  for (const [role, pattern] of rolePatterns) {
    if (pattern.test(filename)) return role
  }
  return null
}

function packNameCandidate(filename) {
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

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
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

function writeEntry(zipPath, entry, destination) {
  const data = execFileSync('tar', ['-xOf', zipPath, entry], { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024 })
  writeFileSync(destination, data)
}

const report = {
  generatedAt: new Date().toISOString(),
  packs: [],
  unclassified: [],
}

for (const zipName of readdirSync(sourceRoot).filter((name) => extname(name).toLowerCase() === '.zip').sort()) {
  const zipPath = join(sourceRoot, zipName)
  const entries = listZipEntries(zipPath)
  const candidates = entries.map((entry) => packNameCandidate(basename(entry, extname(entry)))).filter(Boolean)
  const frequencies = new Map()
  candidates.forEach((candidate) => frequencies.set(candidate, (frequencies.get(candidate) ?? 0) + 1))
  const packName = [...frequencies].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
  if (!packName) throw new Error(`Could not derive a pack name from ${zipName}.`)
  const packId = slugify(packName)
  if (!packId) throw new Error(`Could not derive a safe pack ID from ${packName}.`)
  const packRoot = join(sourceRoot, packId)
  mkdirSync(packRoot, { recursive: true })
  for (const existing of readdirSync(packRoot)) {
    if (/^(?:lobby|question|urgent|double-score|lock|reveal|leaderboard|final)-\d{2}\.mp3$/u.test(existing)) {
      rmSync(join(packRoot, existing))
    }
  }

  const counters = Object.fromEntries(roles.map((role) => [role, 0]))
  const files = []
  for (const entry of entries) {
    const role = classify(basename(entry))
    if (!role) {
      report.unclassified.push({ originalZip: zipName, originalFilename: entry })
      continue
    }
    counters[role] += 1
    const finalFilename = `${role}-${String(counters[role]).padStart(2, '0')}.mp3`
    const destination = join(packRoot, finalFilename)
    writeEntry(zipPath, entry, destination)
    files.push({
      packId,
      originalZip: zipName,
      originalFilename: entry,
      finalLocalFilename: finalFilename,
      detectedRole: role,
      sourceBytes: statSync(destination).size,
      ...probe(destination),
    })
  }
  report.packs.push({ packId, name: packName, originalZip: zipName, variants: counters, files })
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`Imported ${report.packs.length} packs and ${report.packs.reduce((total, pack) => total + pack.files.length, 0)} files.\n`)
process.stdout.write(`Traceability report: ${reportPath}\n`)
if (report.unclassified.length > 0) {
  process.stderr.write(`${report.unclassified.length} source files could not be classified. See ${reportPath}.\n`)
  process.exitCode = 1
}
