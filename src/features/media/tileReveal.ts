export const TILE_REVEAL_COUNT = 24

function hashSeed(value: string): number {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createTileRevealOrder(mediaPath: string, openedAt: string | null): number[] {
  const order = Array.from({ length: TILE_REVEAL_COUNT }, (_, index) => index)
  const random = seededRandom(hashSeed(`${mediaPath}\u0000${openedAt ?? ''}`))
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[order[index], order[swapIndex]] = [order[swapIndex], order[index]]
  }
  return order
}

export function createTileRevealRanks(mediaPath: string, openedAt: string | null): number[] {
  const ranks = Array<number>(TILE_REVEAL_COUNT)
  createTileRevealOrder(mediaPath, openedAt).forEach((tileIndex, rank) => {
    ranks[tileIndex] = rank
  })
  return ranks
}
