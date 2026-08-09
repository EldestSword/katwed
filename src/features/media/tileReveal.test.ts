import { describe, expect, it } from 'vitest'
import { TILE_REVEAL_COUNT, createTileRevealOrder, createTileRevealRanks } from './tileReveal'

describe('deterministic tile reveal', () => {
  it('returns every tile exactly once in a stable shuffled order', () => {
    const first = createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z')
    const second = createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z')
    expect(first).toEqual(second)
    expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: TILE_REVEAL_COUNT }, (_, index) => index))
    expect(first).not.toEqual(Array.from({ length: TILE_REVEAL_COUNT }, (_, index) => index))
  })

  it('changes when the authoritative open time changes', () => {
    expect(createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z'))
      .not.toEqual(createTileRevealOrder('/image.webp', '2026-08-08T10:00:01.000Z'))
  })

  it('maps each DOM tile to its unique reveal rank', () => {
    const ranks = createTileRevealRanks('/image.webp', '2026-08-08T10:00:00.000Z')
    expect([...ranks].sort((a, b) => a - b)).toEqual(Array.from({ length: TILE_REVEAL_COUNT }, (_, index) => index))
  })

  it.each([6, 8, 12, 16])('creates a complete deterministic %d by %d permutation', (size) => {
    const count = size * size
    const first = createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z', count)
    const second = createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z', count)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(count)
    expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, index) => index))
  })

  it('uses a different deterministic sequence for different grid sizes', () => {
    expect(createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z', 36))
      .not.toEqual(createTileRevealOrder('/image.webp', '2026-08-08T10:00:00.000Z', 64).slice(0, 36))
  })
})
