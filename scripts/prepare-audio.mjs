import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const sourceRoot = resolve('audio-source/katwed-core')
const outputRoot = resolve('public/audio/packs/katwed')

const assets = [
  {
    output: 'lobby.mp3',
    source: 'Katwed! Core - Lobby 01.wav',
    filter: loopFilter(13.56, 0.6),
  },
  {
    output: 'question.mp3',
    source: 'Katwed! Core - Question 01.wav',
    filter: loopFilter(59.84, 0.6),
  },
  {
    output: 'urgent.mp3',
    source: 'Urgency1.wav',
    filter: oneShotFilter(17.12, 0.12),
  },
  {
    output: 'double-score.mp3',
    source: 'Very Short Premium Game-show Double Score Sonic Sting. One Musical Impact Onl....wav',
    filter: oneShotFilter(1.75, 0.25),
  },
  {
    output: 'lock.mp3',
    source: 'Very Short Premium Quiz-show Lock Sting. One Clean Decisive Electronic Punctu... (1).wav',
    filter: oneShotFilter(4.24, 0.16),
  },
  {
    output: 'reveal.mp3',
    source: 'Very Short Premium Quiz-show Answer Reveal Sting. Around 2–3 Seconds Of Actua....wav',
    filter: oneShotFilter(6.36, 0.16),
  },
  {
    output: 'leaderboard.mp3',
    source: 'Seamless Premium Leaderboard Music Loop For A Modern British Tv Quiz Show. Br....wav',
    filter: oneShotFilter(13.88, 0.2),
  },
  {
    output: 'final.mp3',
    source: 'Final Standings (2).wav',
    filter: oneShotFilter(27.8, 0.3),
  },
]

function seconds(value) {
  return Number(value.toFixed(3))
}

function loopFilter(duration, crossfade) {
  const middleEnd = seconds(duration - crossfade)
  return [
    `[0:a]asplit=3[tail-source][head-source][middle-source]`,
    `[tail-source]atrim=start=${middleEnd}:end=${duration},asetpts=PTS-STARTPTS[tail]`,
    `[head-source]atrim=start=0:end=${crossfade},asetpts=PTS-STARTPTS[head]`,
    `[tail][head]acrossfade=d=${crossfade}:c1=tri:c2=tri[seam]`,
    `[middle-source]atrim=start=${crossfade}:end=${middleEnd},asetpts=PTS-STARTPTS[middle]`,
    `[seam][middle]concat=n=2:v=0:a=1[prepared]`,
  ].join(';')
}

function oneShotFilter(duration, fadeOut) {
  return `[0:a]atrim=start=0:end=${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.015,afade=t=out:st=${seconds(duration - fadeOut)}:d=${fadeOut}[prepared]`
}

function run(args, subject) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
  if (result.error) throw new Error(`${subject}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${subject}:\n${result.stderr}`)
  return result.stderr
}

function loudnessAnalysis(asset) {
  const stderr = run([
    '-hide_banner', '-nostats', '-i', resolve(sourceRoot, asset.source),
    '-filter_complex', `${asset.filter};[prepared]loudnorm=I=-18:TP=-1.5:LRA=12:print_format=json[normalised]`,
    '-map', '[normalised]', '-f', 'null', '-',
  ], `Could not analyse ${asset.source}`)
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/)
  if (!match) throw new Error(`ffmpeg did not return loudness measurements for ${asset.source}.`)
  return JSON.parse(match[0])
}

function normaliseFilter(asset, measured) {
  const loudness = [
    'loudnorm=I=-18:TP=-1.5:LRA=12',
    `measured_I=${measured.input_i}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_TP=${measured.input_tp}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
  ].join(':')
  return `${asset.filter};[prepared]${loudness}[normalised]`
}

mkdirSync(outputRoot, { recursive: true })
for (const asset of assets) {
  const measured = loudnessAnalysis(asset)
  run([
    '-hide_banner', '-nostats', '-y', '-i', resolve(sourceRoot, asset.source),
    '-filter_complex', normaliseFilter(asset, measured), '-map', '[normalised]',
    '-ar', '48000', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '160k',
    resolve(outputRoot, asset.output),
  ], `Could not prepare ${asset.output}`)
  process.stdout.write(`Prepared ${asset.output}\n`)
}
