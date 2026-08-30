import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import sizeReport from '../../../docs/audio-pack-size-report.json'
import {
  DEFAULT_SOUND_PACK_ID,
  getSoundPack,
  normaliseDoubleScoreDurationMs,
  normaliseSoundPackId,
  soundPacks,
} from './soundPacks'

describe('sound-pack registry', () => {
  it('registers Core, every prepared local pack and the deliberate silent option', () => {
    expect(soundPacks.map(({ id }) => id)).toEqual([
      'katwed', '90s-rave', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s',
      'arcade', 'bluegrass', 'blues', 'chiptune', 'christmas', 'disco', 'french',
      'grand-orchestra', 'greek', 'halloween', 'hard-rock', 'hip-hop', 'italian', 'jazz',
      'medieval', 'midnight', 'mint', 'paper', 'pirate', 'pop', 'retro-game-show',
      'rocksteady', 'sci-fi', 'ska', 'soul', 'spy-noir', 'sunset', 'synthwave', 'western', 'none',
    ])
    expect(getSoundPack('none').assets).toBeNull()
  })

  it('keeps every production pack complete, unique and backed by committed files', () => {
    for (const pack of soundPacks.filter((candidate) => candidate.id !== 'none')) {
      expect(pack.assets).not.toBeNull()
      const filenames = new Set<string>()
      for (const variants of Object.values(pack.assets!)) {
        expect(variants.length).toBeGreaterThan(0)
        for (const variant of variants) {
          expect(filenames.has(variant.src)).toBe(false)
          filenames.add(variant.src)
          expect(existsSync(resolve('public', variant.src.slice(1)))).toBe(true)
        }
      }
      for (const variant of pack.assets!.doubleScore) {
        expect(variant.durationMs).toBeGreaterThanOrEqual(500)
        expect(variant.durationMs).toBeLessThanOrEqual(30_000)
      }
    }
  })

  it('uses the prepared Double Score durations recorded by the production report', () => {
    for (const reported of sizeReport.packs) {
      expect(getSoundPack(reported.id).assets?.doubleScore.map((variant) => variant.durationMs))
        .toEqual(reported.doubleScoreDurationsMs)
    }
  })

  it('defaults missing and unknown values safely to Katwed', () => {
    expect(DEFAULT_SOUND_PACK_ID).toBe('katwed')
    expect(normaliseSoundPackId(undefined)).toBe('katwed')
    expect(normaliseSoundPackId('future')).toBe('katwed')
    expect(normaliseSoundPackId('hard-rock')).toBe('hard-rock')
  })

  it('bounds invalid Double Score metadata to the safe five-second fallback', () => {
    expect(normaliseDoubleScoreDurationMs(9000)).toBe(9000)
    expect(normaliseDoubleScoreDurationMs(499)).toBe(5000)
    expect(normaliseDoubleScoreDurationMs(30_001)).toBe(5000)
    expect(normaliseDoubleScoreDurationMs(Number.NaN)).toBe(5000)
  })
})
