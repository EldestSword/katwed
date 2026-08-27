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

export interface SoundPackDefinition {
  id: SoundPackId
  name: string
  description: string
  assets: Readonly<Record<GameAudioCue, string>> | null
}

export const DEFAULT_SOUND_PACK_ID: SoundPackId = 'katwed'
export const SOUND_PACK_IDS = ['katwed', 'none'] as const satisfies readonly SoundPackId[]

export const soundPacks: readonly SoundPackDefinition[] = [
  {
    id: 'katwed',
    name: 'Katwed!',
    description: 'The original Katwed game-show music and stings.',
    assets: {
      lobby: '/audio/packs/katwed/lobby.mp3',
      question: '/audio/packs/katwed/question.mp3',
      urgent: '/audio/packs/katwed/urgent.mp3',
      doubleScore: '/audio/packs/katwed/double-score.mp3',
      lock: '/audio/packs/katwed/lock.mp3',
      reveal: '/audio/packs/katwed/reveal.mp3',
      leaderboard: '/audio/packs/katwed/leaderboard.mp3',
      final: '/audio/packs/katwed/final.mp3',
    },
  },
  {
    id: 'none',
    name: 'None',
    description: 'Keep the shared Presentation silent.',
    assets: null,
  },
]

const packsById = new Map(soundPacks.map((pack) => [pack.id, pack]))

export function isSoundPackId(value: unknown): value is SoundPackId {
  return typeof value === 'string' && SOUND_PACK_IDS.includes(value as SoundPackId)
}

export function normaliseSoundPackId(value: unknown): SoundPackId {
  return isSoundPackId(value) ? value : DEFAULT_SOUND_PACK_ID
}

export function getSoundPack(id: unknown): SoundPackDefinition {
  return packsById.get(normaliseSoundPackId(id)) ?? soundPacks[0]
}
