import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const root = resolve('public/audio/packs')
const manifestPath = resolve('src/features/audio/generatedSoundPackManifest.json')
const selectedPackIds = process.env.AUDIO_VERIFY_PACK_IDS
  ? new Set(process.env.AUDIO_VERIFY_PACK_IDS.split(',').map((entry) => entry.trim()).filter(Boolean))
  : null
const verifyLoudness = process.env.AUDIO_VERIFY_LOUDNESS === 'true'

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : extname(entry.name).toLowerCase() === '.mp3' ? [path] : []
  })
}

const allProductionFiles = filesUnder(root)
const productionFiles = selectedPackIds
  ? allProductionFiles.filter((file) => selectedPackIds.has(relative(root, file).split(/[\\/]/u)[0]))
  : allProductionFiles
if (selectedPackIds) {
  const availablePackIds = new Set(allProductionFiles.map((file) => relative(root, file).split(/[\\/]/u)[0]))
  const missing = [...selectedPackIds].filter((packId) => !availablePackIds.has(packId))
  if (missing.length > 0) throw new Error(`Selected production audio packs were not found: ${missing.join(', ')}.`)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const manifestPaths = manifest.flatMap((pack) => Object.values(pack.assets).flat().map((asset) => asset.src))
if (new Set(manifestPaths).size !== manifestPaths.length) throw new Error('The generated sound-pack manifest contains duplicate production paths.')
for (const publicPath of manifestPaths) {
  const file = resolve('public', publicPath.replace(/^\//u, ''))
  if (!existsSync(file) || statSync(file).size <= 0) throw new Error(`Missing or empty manifest audio: ${publicPath}`)
}

const loudnessMeasurements = []
for (const file of productionFiles) {
  const raw = execFileSync(ffprobe, [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  const data = JSON.parse(raw)
  const audio = data.streams?.filter((stream) => stream.codec_type === 'audio') ?? []
  const visual = data.streams?.filter((stream) => stream.codec_type === 'video' || stream.disposition?.attached_pic === 1) ?? []
  if (statSync(file).size <= 0 || audio.length !== 1 || audio[0].codec_name !== 'mp3' ||
    Number(audio[0].sample_rate) !== 48_000 || Number(audio[0].channels) !== 2 || visual.length > 0 ||
    Number(data.format?.duration) <= 0) {
    throw new Error(`Invalid production audio: ${relative(root, file)}`)
  }
  const packId = relative(root, file).split(/[\\/]/u)[0]
  if (packId !== 'katwed' && Object.keys(data.format?.tags ?? {}).length > 0) {
    throw new Error(`Production metadata was not stripped: ${relative(root, file)}`)
  }
  if (verifyLoudness && packId !== 'katwed') {
    const measured = spawnSync(ffmpeg, [
      '-hide_banner', '-nostats', '-i', file,
      '-af', 'loudnorm=I=-18:TP=-1.5:LRA=12:print_format=json', '-f', 'null', '-',
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'ignore', 'pipe'] })
    if (measured.error || measured.status !== 0) {
      throw new Error(`Could not measure production loudness for ${relative(root, file)}: ${measured.error?.message ?? measured.stderr}`)
    }
    const match = measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/u)
    if (!match) throw new Error(`FFmpeg did not return loudness measurements for ${relative(root, file)}.`)
    const values = JSON.parse(match[0])
    const integratedLufs = Number(values.input_i)
    const truePeakDb = Number(values.input_tp)
    if (!Number.isFinite(integratedLufs) || Math.abs(integratedLufs - -18) > 0.5 ||
      !Number.isFinite(truePeakDb) || truePeakDb > -1) {
      throw new Error(`Production loudness is outside tolerance for ${relative(root, file)}: ` +
        `${integratedLufs} LUFS, ${truePeakDb} dBTP.`)
    }
    loudnessMeasurements.push({ integratedLufs, truePeakDb })
  }
}

process.stdout.write(`Verified ${productionFiles.length} production MP3 files with FFprobe.\n`)
if (loudnessMeasurements.length > 0) {
  const integrated = loudnessMeasurements.map((measurement) => measurement.integratedLufs)
  const truePeaks = loudnessMeasurements.map((measurement) => measurement.truePeakDb)
  process.stdout.write(`Measured ${loudnessMeasurements.length} imported MP3 files: ` +
    `${Math.min(...integrated).toFixed(2)} to ${Math.max(...integrated).toFixed(2)} LUFS; ` +
    `maximum true peak ${Math.max(...truePeaks).toFixed(2)} dBTP.\n`)
}
