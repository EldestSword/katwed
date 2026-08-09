export const TILE_REVEAL_COUNT = 24
export const LEGACY_TILE_COLUMNS = 6
export const LEGACY_TILE_ROWS = 4

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

export function createTileRevealOrder(
  mediaPath: string,
  openedAt: string | null,
  tileCount: number = TILE_REVEAL_COUNT,
): number[] {
  const order = Array.from({ length: tileCount }, (_, index) => index)
  const countSeed = tileCount === TILE_REVEAL_COUNT ? '' : `\u0000${tileCount}`
  const random = seededRandom(hashSeed(`${mediaPath}\u0000${openedAt ?? ''}${countSeed}`))
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[order[index], order[swapIndex]] = [order[swapIndex], order[index]]
  }
  return order
}

export function createTileRevealRanks(
  mediaPath: string,
  openedAt: string | null,
  tileCount: number = TILE_REVEAL_COUNT,
): number[] {
  const ranks = Array<number>(tileCount)
  createTileRevealOrder(mediaPath, openedAt, tileCount).forEach((tileIndex, rank) => {
    ranks[tileIndex] = rank
  })
  return ranks
}
