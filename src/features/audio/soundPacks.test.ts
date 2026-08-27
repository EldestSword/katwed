import { describe, expect, it } from 'vitest'
import { DEFAULT_SOUND_PACK_ID, getSoundPack, normaliseSoundPackId, soundPacks } from './soundPacks'

describe('sound-pack registry', () => {
  it('offers only the Katwed Core pack and None', () => {
    expect(soundPacks.map(({ id, name }) => [id, name])).toEqual([
      ['katwed', 'Katwed!'],
      ['none', 'None'],
    ])
    expect(getSoundPack('katwed').assets).toEqual({
      lobby: '/audio/packs/katwed/lobby.mp3',
      question: '/audio/packs/katwed/question.mp3',
      urgent: '/audio/packs/katwed/urgent.mp3',
      doubleScore: '/audio/packs/katwed/double-score.mp3',
      lock: '/audio/packs/katwed/lock.mp3',
      reveal: '/audio/packs/katwed/reveal.mp3',
      leaderboard: '/audio/packs/katwed/leaderboard.mp3',
      final: '/audio/packs/katwed/final.mp3',
    })
    expect(getSoundPack('none').assets).toBeNull()
  })

  it('defaults missing and future values safely to Katwed', () => {
    expect(DEFAULT_SOUND_PACK_ID).toBe('katwed')
    expect(normaliseSoundPackId(undefined)).toBe('katwed')
    expect(normaliseSoundPackId('future')).toBe('katwed')
  })
})
