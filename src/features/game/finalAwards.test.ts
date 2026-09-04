import { describe, expect, it } from 'vitest'
import type { LeaderboardEntry } from '../../types/domain'
import { calculateFinalAwards } from './finalAwards'

const entry = (playerId: string, correctAnswerCount: number, totalCorrectResponseMs = 0, rank = 1): LeaderboardEntry =>
  ({ playerId, nickname: playerId, rank, correctAnswerCount, totalCorrectResponseMs, totalScore: 1000 })
const award = (rows: LeaderboardEntry[], kind: string, baseline: ReadonlyMap<string, number> | null = null) =>
  calculateFinalAwards(rows, baseline).find((result) => result.kind === kind)

describe('Most Correct', () => {
  it('rewards the highest positive correct count independently of score and rank', () => {
    expect(award([entry('Carol', 17, 0, 2), entry('Roger', 16)], 'most-correct')).toEqual({
      kind: 'most-correct', winners: [{ playerId: 'Carol', nickname: 'Carol' }], correctAnswerCount: 17,
    })
  })
  it('keeps every tied winner in authoritative row order', () => {
    expect(award([entry('Jaki', 17), entry('Carol', 17), entry('Roger', 16)], 'most-correct')?.winners.map((p) => p.nickname)).toEqual(['Jaki', 'Carol'])
  })
  it('omits zero correct and an empty board', () => {
    expect(calculateFinalAwards([entry('Carol', 0)])).toEqual([])
    expect(calculateFinalAwards([])).toEqual([])
  })
})

describe('Quickest Thinker', () => {
  it('uses the correct-answer average, not the smallest total response time', () => {
    expect(award([entry('Carol', 4, 12000), entry('Roger', 3, 10000)], 'quickest-thinker')).toEqual({
      kind: 'quickest-thinker', winners: [{ playerId: 'Carol', nickname: 'Carol' }], averageResponseMs: 3000,
    })
  })
  it('requires three correct answers and excludes a single extremely fast answer', () => {
    expect(award([entry('Fast', 1, 1), entry('Two', 2, 2), entry('Roger', 3, 9600)], 'quickest-thinker')?.winners[0].nickname).toBe('Roger')
    expect(award([entry('Fast', 1, 1), entry('Two', 2, 2)], 'quickest-thinker')).toBeUndefined()
  })
  it('retains exact average ties with different correct counts', () => {
    expect(award([entry('Roger', 3, 9600), entry('Carol', 6, 19200)], 'quickest-thinker')?.winners).toHaveLength(2)
  })
  it('does not manufacture ties when unequal averages round to the same display', () => {
    expect(award([entry('Roger', 3, 9601), entry('Carol', 3, 9600)], 'quickest-thinker')?.winners.map((p) => p.nickname)).toEqual(['Carol'])
  })
  it('ignores missing or invalid timing metrics', () => {
    expect(award([entry('Unknown', 3, NaN), entry('Negative', 3, -1)], 'quickest-thinker')).toBeUndefined()
  })
})

describe('Biggest Climber', () => {
  it('compares the first known rank with the final authoritative rank', () => {
    expect(award([entry('Jaki', 0, 0, 2)], 'biggest-climber', new Map([['Jaki', 8]]))).toEqual({
      kind: 'biggest-climber', places: 6, winners: [{ playerId: 'Jaki', nickname: 'Jaki', firstRank: 8, finalRank: 2 }],
    })
  })
  it.each([1, 2])('excludes a drop or unchanged rank (first rank %i)', (rank) => {
    expect(award([entry('Jaki', 0, 0, 2)], 'biggest-climber', new Map([['Jaki', rank]]))).toBeUndefined()
  })
  it('omits missing baselines and players absent from the original board', () => {
    expect(award([entry('Jaki', 0)], 'biggest-climber')).toBeUndefined()
    expect(award([entry('Jaki', 0)], 'biggest-climber', new Map([['Carol', 8]]))).toBeUndefined()
  })
  it('shares the largest positive climb without conflating different before/after ranks', () => {
    expect(award([entry('Jaki', 0, 0, 2), entry('Carol', 0, 0, 3), entry('Roger', 0, 0, 4)], 'biggest-climber',
      new Map([['Jaki', 8], ['Carol', 9], ['Roger', 5]]))).toMatchObject({ places: 6, winners: [
      { nickname: 'Jaki', firstRank: 8, finalRank: 2 }, { nickname: 'Carol', firstRank: 9, finalRank: 3 },
    ] })
  })
})

it('returns at most three awards in fixed order without mutating inputs', () => {
  const rows = [entry('Carol', 4, 12800), entry('Jaki', 3, 6000, 2)]
  const before = structuredClone(rows)
  rows.forEach(Object.freeze); Object.freeze(rows)
  const baseline = new Map([['Carol', 2], ['Jaki', 8]])
  const result = calculateFinalAwards(rows, baseline)
  expect(result.map((item) => item.kind)).toEqual(['most-correct', 'quickest-thinker', 'biggest-climber'])
  expect(calculateFinalAwards(rows, baseline)).toEqual(result)
  expect(rows).toEqual(before)
  expect([...baseline]).toEqual([['Carol', 2], ['Jaki', 8]])
})
