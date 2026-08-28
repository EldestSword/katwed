import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const root = resolve('public/audio/packs')

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : extname(entry.name).toLowerCase() === '.mp3' ? [path] : []
  })
}

const productionFiles = filesUnder(root)
for (const file of productionFiles) {
  const raw = execFileSync(ffprobe, [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  const data = JSON.parse(raw)
  const audio = data.streams?.filter((stream) => stream.codec_type === 'audio') ?? []
  const visual = data.streams?.filter((stream) => stream.codec_type === 'video' || stream.disposition?.attached_pic === 1) ?? []
  if (audio.length !== 1 || audio[0].codec_name !== 'mp3' || Number(audio[0].sample_rate) !== 48_000 ||
    Number(audio[0].channels) !== 2 || visual.length > 0 || Number(data.format?.duration) <= 0) {
    throw new Error(`Invalid production audio: ${relative(root, file)}`)
  }
  const packId = relative(root, file).split(/[\\/]/u)[0]
  if (packId !== 'katwed' && Object.keys(data.format?.tags ?? {}).length > 0) {
    throw new Error(`Production metadata was not stripped: ${relative(root, file)}`)
  }
}

process.stdout.write(`Verified ${productionFiles.length} production MP3 files with FFprobe.\n`)
