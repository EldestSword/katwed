import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const sourceRoot = resolve('audio-source')
const outputRoot = resolve('public/audio/packs')
const manifestPath = resolve('src/features/audio/generatedSoundPackManifest.json')
const reportPath = resolve('docs/audio-pack-size-report.json')
const importReportPath = join(sourceRoot, 'import-report.json')
const cues = ['lobby', 'question', 'urgent', 'double-score', 'lock', 'reveal', 'leaderboard', 'final']
const loopCues = new Set(['lobby', 'question'])
const sourcePattern = /^(lobby|question|urgent|double-score|lock|reveal|leaderboard|final)-(\d{2})\.mp3$/u
const selectedPackIds = process.env.AUDIO_PREPARE_PACK_IDS
  ? new Set(process.env.AUDIO_PREPARE_PACK_IDS.split(',').map((entry) => entry.trim()).filter(Boolean))
  : null

function run(command, args, subject) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = error?.stderr?.toString?.() || error?.message || String(error)
    throw new Error(`${subject}:\n${detail}`)
  }
}

function probe(filePath) {
  const raw = run(ffprobe, [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'format=duration,bit_rate:stream=codec_name,sample_rate,channels,bit_rate',
    '-of', 'json', filePath,
  ], `Could not inspect ${filePath}`)
  const data = JSON.parse(raw)
  const stream = data.streams?.[0] ?? {}
  return {
    durationSeconds: Number(data.format?.duration ?? 0),
    bitrate: Number(stream.bit_rate ?? data.format?.bit_rate ?? 0),
    sampleRate: Number(stream.sample_rate ?? 0),
    channels: Number(stream.channels ?? 0),
    codec: String(stream.codec_name ?? ''),
  }
}

function seconds(value) {
  return Number(value.toFixed(3))
}

function detectConservativeTrim(filePath, duration) {
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-nostats', '-i', filePath,
    '-af', 'silencedetect=noise=-55dB:d=0.45', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'ignore', 'pipe'] })
  if (result.error || result.status !== 0) throw new Error(`Could not analyse silence in ${filePath}: ${result.error?.message ?? result.stderr}`)
  const stderr = result.stderr ?? ''
  const events = []
  let pendingStart = null
  for (const line of stderr.split(/\r?\n/u)) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/u)
    if (start) pendingStart = Number(start[1])
    const end = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/u)
    if (end && pendingStart !== null) {
      events.push({ start: pendingStart, end: Number(end[1]), duration: Number(end[2]) })
      pendingStart = null
    }
  }
  if (pendingStart !== null) events.push({ start: pendingStart, end: duration, duration: duration - pendingStart })
  const leading = events.find((event) => event.start <= 0.02 && event.duration >= 0.45 && event.end <= Math.min(1, duration * 0.08))
  const trailing = [...events].reverse().find((event) => (
    event.duration >= 0.45 && event.end >= duration - 0.08 && event.start >= Math.max(0, duration - 2)
  ))
  const start = leading ? Math.max(0, leading.end - 0.02) : 0
  const end = trailing ? Math.min(duration, trailing.start + 0.08) : duration
  return end - start >= 0.5 ? { start: seconds(start), end: seconds(end) } : { start: 0, end: seconds(duration) }
}

function loopFilter(duration) {
  const crossfade = Math.min(0.6, Math.max(0.1, duration / 10))
  const middleEnd = seconds(duration - crossfade)
  return [
    '[0:a]asplit=3[tail-source][head-source][middle-source]',
    `[tail-source]atrim=start=${middleEnd}:end=${seconds(duration)},asetpts=PTS-STARTPTS[tail]`,
    `[head-source]atrim=start=0:end=${seconds(crossfade)},asetpts=PTS-STARTPTS[head]`,
    `[tail][head]acrossfade=d=${seconds(crossfade)}:c1=tri:c2=tri[seam]`,
    `[middle-source]atrim=start=${seconds(crossfade)}:end=${middleEnd},asetpts=PTS-STARTPTS[middle]`,
    '[seam][middle]concat=n=2:v=0:a=1[prepared]',
  ].join(';')
}

function oneShotFilter(trim) {
  const duration = trim.end - trim.start
  const fadeOut = Math.min(0.12, duration / 5)
  const fadeStart = seconds(Math.max(0, duration - fadeOut))
  return `[0:a]atrim=start=${trim.start}:end=${trim.end},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=0.015,afade=t=out:st=${fadeStart}:d=${seconds(fadeOut)}[prepared]`
}

function loudnessAnalysis(filePath, filter) {
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-nostats', '-i', filePath,
    '-filter_complex', `${filter};[prepared]loudnorm=I=-18:TP=-1.5:LRA=12:print_format=json[normalised]`,
    '-map', '[normalised]', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'ignore', 'pipe'] })
  if (result.error || result.status !== 0) throw new Error(`Could not analyse loudness in ${filePath}: ${result.error?.message ?? result.stderr}`)
  const stderr = result.stderr ?? ''
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/u)
  if (!match) throw new Error(`FFmpeg did not return loudness measurements for ${filePath}.`)
  return JSON.parse(match[0])
}

function normaliseFilter(filter, measured) {
  const loudness = [
    'loudnorm=I=-18:TP=-1.5:LRA=12',
    `measured_I=${measured.input_i}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_TP=${measured.input_tp}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
  ].join(':')
  return `${filter};[prepared]${loudness}[normalised]`
}

function displayName(packId) {
  return packId.split('-').map((part) => (/^\d{4}s$/u.test(part) ? part : `${part[0].toUpperCase()}${part.slice(1)}`)).join(' ')
}

const importedNames = new Map()
if (existsSync(importReportPath)) {
  const report = JSON.parse(readFileSync(importReportPath, 'utf8'))
  for (const pack of report.packs ?? []) importedNames.set(pack.packId, pack.name)
}

const availablePackSources = readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'katwed-core')
  .map((entry) => ({
    id: entry.name,
    files: readdirSync(join(sourceRoot, entry.name)).filter((file) => sourcePattern.test(file)).sort(),
  }))
  .filter((pack) => pack.files.length > 0)
  .sort((left, right) => left.id.localeCompare(right.id, 'en-GB', { numeric: true }))

if (selectedPackIds) {
  const availableIds = new Set(availablePackSources.map((pack) => pack.id))
  const missing = [...selectedPackIds].filter((packId) => !availableIds.has(packId))
  if (missing.length > 0) throw new Error(`Selected audio source packs were not found: ${missing.join(', ')}.`)
}

const packSources = selectedPackIds
  ? availablePackSources.filter((pack) => selectedPackIds.has(pack.id))
  : availablePackSources
const existingManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : []
const existingReport = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { packs: [] }
const preparedManifest = []
const preparedReports = []
const report = {
  settings: {
    loudnessTargetLufs: -18, truePeakDb: -1.5, loudnessRange: 12,
    codec: 'libmp3lame', vbrQuality: 4, sampleRate: 48000, channels: 2, metadataStripped: true,
  },
  packs: [],
}

for (const pack of packSources) {
  const roleFiles = Object.fromEntries(cues.map((cue) => [cue, []]))
  for (const file of pack.files) roleFiles[file.match(sourcePattern)[1]].push(file)
  const missing = cues.filter((cue) => roleFiles[cue].length === 0)
  if (missing.length > 0) throw new Error(`${pack.id} is incomplete; missing ${missing.join(', ')}.`)

  const packOutput = join(outputRoot, pack.id)
  mkdirSync(packOutput, { recursive: true })
  for (const existing of readdirSync(packOutput)) {
    if (extname(existing).toLowerCase() === '.mp3') rmSync(join(packOutput, existing))
  }

  const assets = Object.fromEntries(cues.map((cue) => [cue === 'double-score' ? 'doubleScore' : cue, []]))
  const packReport = {
    id: pack.id,
    name: importedNames.get(pack.id) ?? displayName(pack.id),
    variants: Object.fromEntries(cues.map((cue) => [cue, roleFiles[cue].length])),
    sourceBytes: 0, productionBytes: 0, reductionPercent: 0,
    doubleScoreDurationsMs: [], unusualHandling: [],
  }

  for (const cue of cues) {
    for (const filename of roleFiles[cue]) {
      const source = join(sourceRoot, pack.id, filename)
      const output = join(packOutput, filename)
      const temporary = `${output}.tmp.mp3`
      const sourceInfo = probe(source)
      if (sourceInfo.codec !== 'mp3') throw new Error(`${source} is not MP3 source audio.`)
      const trim = loopCues.has(cue)
        ? { start: 0, end: seconds(sourceInfo.durationSeconds) }
        : detectConservativeTrim(source, sourceInfo.durationSeconds)
      if (trim.start > 0 || trim.end < sourceInfo.durationSeconds - 0.05) {
        packReport.unusualHandling.push({ file: filename, trimmedStartSeconds: trim.start, trimmedEndSeconds: trim.end })
      }
      const filter = loopCues.has(cue) ? loopFilter(sourceInfo.durationSeconds) : oneShotFilter(trim)
      const measured = loudnessAnalysis(source, filter)
      run(ffmpeg, [
        '-hide_banner', '-nostats', '-y', '-i', source,
        '-filter_complex', normaliseFilter(filter, measured), '-map', '[normalised]',
        '-map_metadata', '-1', '-map_chapters', '-1', '-vn',
        '-ar', '48000', '-ac', '2', '-codec:a', 'libmp3lame', '-q:a', '4',
        '-id3v2_version', '0', '-write_id3v1', '0', temporary,
      ], `Could not prepare ${pack.id}/${filename}`)
      renameSync(temporary, output)
      const productionInfo = probe(output)
      const variant = { src: `/audio/packs/${pack.id}/${filename}`, durationMs: Math.round(productionInfo.durationSeconds * 1000) }
      const assetCue = cue === 'double-score' ? 'doubleScore' : cue
      assets[assetCue].push(variant)
      packReport.sourceBytes += statSync(source).size
      packReport.productionBytes += statSync(output).size
      if (cue === 'double-score') {
        if (variant.durationMs < 500 || variant.durationMs > 30000) {
          throw new Error(`${pack.id}/${filename} has invalid prepared Double Score duration ${variant.durationMs}ms.`)
        }
        packReport.doubleScoreDurationsMs.push(variant.durationMs)
      }
      process.stdout.write(`Prepared ${pack.id}/${filename}\n`)
    }
  }

  packReport.reductionPercent = Number(((1 - packReport.productionBytes / packReport.sourceBytes) * 100).toFixed(1))
  preparedReports.push(packReport)
  preparedManifest.push({
    id: pack.id,
    name: packReport.name,
    description: `A varied ${packReport.name} game-show soundtrack with multiple music and sting variants.`,
    assets,
  })
}

const preparedIds = new Set(preparedManifest.map((pack) => pack.id))
const manifest = [...existingManifest.filter((pack) => !preparedIds.has(pack.id)), ...preparedManifest]
  .sort((left, right) => left.id.localeCompare(right.id, 'en-GB', { numeric: true }))
report.packs = [...(existingReport.packs ?? []).filter((pack) => !preparedIds.has(pack.id)), ...preparedReports]
  .sort((left, right) => left.id.localeCompare(right.id, 'en-GB', { numeric: true }))
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
const sourceBytes = report.packs.reduce((total, pack) => total + pack.sourceBytes, 0)
const productionBytes = report.packs.reduce((total, pack) => total + pack.productionBytes, 0)
process.stdout.write(`Prepared ${preparedManifest.length} selected packs; manifest contains ${manifest.length} imported packs. ` +
  `Source ${sourceBytes} bytes; production ${productionBytes} bytes.\n`)
process.stdout.write(`Manifest: ${manifestPath}\nReport: ${reportPath}\n`)
