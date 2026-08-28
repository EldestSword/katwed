import { beforeEach, describe, expect, it } from 'vitest'
import type { SoundPackDefinition } from './soundPacks'
import { AudioVariantSelectionStore, shuffledVariantIndices } from './audioVariantSelection'

const variants = (count: number) => Array.from({ length: count }, (_, index) => ({
  src: `/question-${index + 1}.mp3`, durationMs: 1000,
}))

function pack(count: number): SoundPackDefinition {
  const question = variants(count)
  return {
    id: 'test-pack', name: 'Test', description: 'Test variants',
    assets: {
      lobby: question, question, urgent: question, doubleScore: question,
      lock: question, reveal: question, leaderboard: question, final: question,
    },
  }
}

describe('audio variant shuffle bags', () => {
  beforeEach(() => localStorage.clear())

  it('uses every variant once and avoids an immediate repeat across bag boundaries', () => {
    const randomValues = [0.9, 0.1, 0.8, 0.7, 0.2, 0.6]
    let cursor = 0
    const store = new AudioVariantSelectionStore(localStorage, () => randomValues[cursor++ % randomValues.length])
    const selected = Array.from({ length: 6 }, (_, index) => (
      store.select('session', pack(3), 'question', `q${index}`)!.src
    ))
    expect(new Set(selected.slice(0, 3)).size).toBe(3)
    expect(new Set(selected.slice(3, 6)).size).toBe(3)
    expect(selected.slice(3, 6)).not.toEqual(selected.slice(0, 3))
    expect(selected[2]).not.toBe(selected[3])
  })

  it('returns the same selection for duplicate events without consuming the bag', () => {
    const store = new AudioVariantSelectionStore(localStorage, () => 0)
    const audioPack = pack(3)
    const first = store.select('session', audioPack, 'question', 'question-one')
    expect(store.select('session', audioPack, 'question', 'question-one')).toEqual(first)
    const second = store.select('session', audioPack, 'question', 'question-two')
    expect(second).not.toEqual(first)
  })

  it('supports one and two variants', () => {
    const store = new AudioVariantSelectionStore(localStorage, () => 0)
    expect(store.select('one', pack(1), 'lobby', 'lobby')?.src).toBe('/question-1.mp3')
    const two = [
      store.select('two', pack(2), 'lock', 'lock-1')?.src,
      store.select('two', pack(2), 'lock', 'lock-2')?.src,
    ]
    expect(new Set(two).size).toBe(2)
  })

  it('uses an authoritative Double Score index without consuming a client-side bag item', () => {
    const store = new AudioVariantSelectionStore(localStorage, () => 0)
    const audioPack = pack(3)
    expect(store.select('session', audioPack, 'doubleScore', 'double-1', 2)?.src).toBe('/question-3.mp3')
    expect(store.select('session', audioPack, 'doubleScore', 'double-1', 0)?.src).toBe('/question-3.mp3')
  })

  it('reshuffles deterministic index bags while respecting the previous index', () => {
    expect(shuffledVariantIndices(1, 0, () => 0)).toEqual([0])
    expect(shuffledVariantIndices(2, 0, () => 0)[0]).toBe(1)
  })
})
