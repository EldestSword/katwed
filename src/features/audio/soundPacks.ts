import generatedPacks from './generatedSoundPackManifest.json'
import type { SoundPackId } from '../../types/domain'

export type GameAudioCue =
  | 'lobby'
  | 'question'
  | 'urgent'
  | 'doubleScore'
  | 'lock'
  | 'reveal'
  | 'leaderboard'
  | 'final'

export interface AudioAssetVariant {
  src: string
  durationMs: number
}

export interface SoundPackDefinition {
  id: SoundPackId
  name: string
  description: string
  assets: Readonly<Record<GameAudioCue, readonly AudioAssetVariant[]>> | null
}

export const DEFAULT_SOUND_PACK_ID: SoundPackId = 'katwed'
export const DEFAULT_DOUBLE_SCORE_DURATION_MS = 5_000
export const MIN_DOUBLE_SCORE_DURATION_MS = 500
export const MAX_DOUBLE_SCORE_DURATION_MS = 30_000

const katwedCore: SoundPackDefinition = {
  id: 'katwed',
  name: 'Katwed!',
  description: 'The original Katwed game-show music and stings.',
  assets: {
    lobby: [{ src: '/audio/packs/katwed/lobby.mp3', durationMs: 12_360 }],
    question: [{ src: '/audio/packs/katwed/question.mp3', durationMs: 58_640 }],
    urgent: [{ src: '/audio/packs/katwed/urgent.mp3', durationMs: 17_120 }],
    doubleScore: [{ src: '/audio/packs/katwed/double-score.mp3', durationMs: DEFAULT_DOUBLE_SCORE_DURATION_MS }],
    lock: [{ src: '/audio/packs/katwed/lock.mp3', durationMs: 4_240 }],
    reveal: [{ src: '/audio/packs/katwed/reveal.mp3', durationMs: 6_360 }],
    leaderboard: [{ src: '/audio/packs/katwed/leaderboard.mp3', durationMs: 13_880 }],
    final: [{ src: '/audio/packs/katwed/final.mp3', durationMs: 27_800 }],
  },
}

const none: SoundPackDefinition = {
  id: 'none',
  name: 'None',
  description: 'Keep the shared Presentation silent.',
  assets: null,
}

function isAssetVariant(value: unknown): value is AudioAssetVariant {
  return typeof value === 'object' && value !== null &&
    typeof (value as AudioAssetVariant).src === 'string' &&
    typeof (value as AudioAssetVariant).durationMs === 'number' &&
    Number.isInteger((value as AudioAssetVariant).durationMs) &&
    (value as AudioAssetVariant).durationMs > 0
}

function isGeneratedPack(value: unknown): value is SoundPackDefinition {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<SoundPackDefinition>
  if (typeof candidate.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate.id) ||
    typeof candidate.name !== 'string' || typeof candidate.description !== 'string' || !candidate.assets) return false
  return (Object.keys(katwedCore.assets!) as GameAudioCue[]).every((cue) => (
    Array.isArray(candidate.assets?.[cue]) && candidate.assets[cue].length > 0 && candidate.assets[cue].every(isAssetVariant)
  ))
}

const productionPacks = generatedPacks.filter(isGeneratedPack)
export const soundPacks: readonly SoundPackDefinition[] = [katwedCore, ...productionPacks, none]
export const SOUND_PACK_IDS: readonly SoundPackId[] = soundPacks.map((pack) => pack.id)
const packsById = new Map(soundPacks.map((pack) => [pack.id, pack]))

export function isSoundPackId(value: unknown): value is SoundPackId {
  return typeof value === 'string' && packsById.has(value)
}

export function normaliseSoundPackId(value: unknown): SoundPackId {
  return isSoundPackId(value) ? value : DEFAULT_SOUND_PACK_ID
}

export function getSoundPack(id: unknown): SoundPackDefinition {
  return packsById.get(normaliseSoundPackId(id)) ?? katwedCore
}

export function normaliseDoubleScoreDurationMs(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) &&
    value >= MIN_DOUBLE_SCORE_DURATION_MS && value <= MAX_DOUBLE_SCORE_DURATION_MS
    ? value
    : DEFAULT_DOUBLE_SCORE_DURATION_MS
}

export function doubleScoreVariantDurations(pack: SoundPackDefinition): number[] {
  if (!pack.assets) return [DEFAULT_DOUBLE_SCORE_DURATION_MS]
  const durations = pack.assets.doubleScore.map((variant) => normaliseDoubleScoreDurationMs(variant.durationMs))
  return durations.length > 0 ? durations : [DEFAULT_DOUBLE_SCORE_DURATION_MS]
}
