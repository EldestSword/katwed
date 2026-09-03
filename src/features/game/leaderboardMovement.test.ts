import { describe, expect, it } from 'vitest'
import { board, currentBoard, previousBoard } from '../../test/leaderboardFixtures'
import { compareLeaderboards, ordinalRank, selectLeaderboardCommentary } from './leaderboardMovement'

describe('leaderboard movement and commentary', () => {
  it('detects climbs and drops by stable identity, not array position or score', () => {
    expect(compareLeaderboards(previousBoard, currentBoard)).toEqual([
      { playerId: 'jaki', nickname: 'Jaki', previousRank: 3, rank: 1, places: 2 },
      { playerId: 'roger', nickname: 'Roger', previousRank: 1, rank: 2, places: -1 },
      { playerId: 'carol', nickname: 'Carol', previousRank: 2, rank: 3, places: -1 },
      { playerId: 'ross', nickname: 'Ross', previousRank: 4, rank: 4, places: 0 },
    ])
  })

  it('detects a new leader', () => {
    expect(selectLeaderboardCommentary(previousBoard, currentBoard)).toEqual({ kind: 'new-leader', playerId: 'jaki', message: 'Jaki takes the lead!' })
  })

  it('detects entering the top three before considering a major climb', () => {
    const before = board(['Leader', 'Second', 'Third', 'Fourth', 'Ross'])
    const after = board(['Leader', 'Ross', 'Second', 'Third', 'Fourth'])
    expect(selectLeaderboardCommentary(before, after)).toEqual({ kind: 'top-three', playerId: 'ross', message: 'Ross breaks into the top three!' })
  })

  it('announces a major climb outside the top three', () => {
    const before = board(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Carol'])
    const after = board(['A', 'B', 'C', 'Carol', 'D', 'E', 'F', 'G', 'H'])
    expect(selectLeaderboardCommentary(before, after)).toEqual({ kind: 'major-climb', playerId: 'carol', message: 'Carol climbs 5 places!' })
  })

  it('selects only the highest-priority moment when several events are proven', () => {
    const before = board(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    const after = board(['C', 'H', 'A', 'G', 'B', 'D', 'E', 'F'])
    expect(selectLeaderboardCommentary(before, after)).toEqual({ kind: 'new-leader', playerId: 'c', message: 'C takes the lead!' })
  })

  it('chooses the biggest equal-priority climb deterministically', () => {
    const before = board(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
    const after = board(['A', 'B', 'C', 'H', 'I', 'D', 'E', 'F', 'G'])
    expect(selectLeaderboardCommentary(before, after)?.playerId).toBe('h')
  })

  it('proves both sides of a direct overtake near the top', () => {
    const before = board(['Leader', 'Jaki', 'Roger', 'Carol'])
    const after = board(['Leader', 'Roger', 'Jaki', 'Carol'])
    const moment = selectLeaderboardCommentary(before, after)
    expect(moment).toEqual({ kind: 'overtake', playerId: 'roger', overtakenPlayerId: 'jaki', message: 'Roger moves ahead of Jaki!' })
    expect(before.find((entry) => entry.playerId === 'roger')!.rank).toBeGreaterThan(before.find((entry) => entry.playerId === 'jaki')!.rank)
    expect(after.find((entry) => entry.playerId === 'roger')!.rank).toBeLessThan(after.find((entry) => entry.playerId === 'jaki')!.rank)
  })

  it('does not claim an overtake of a missing player', () => {
    expect(selectLeaderboardCommentary(board(['Leader', 'Missing', 'Roger']), board(['Leader', 'Roger']))).toBeNull()
  })

  it('ignores a trivial lower-table swap', () => {
    const names = Array.from({ length: 20 }, (_, index) => `Player ${index + 1}`)
    const after = [...names]
    ;[after[16], after[17]] = [after[17], after[16]]
    expect(selectLeaderboardCommentary(board(names), board(after))).toBeNull()
  })

  it.each([null, []])('never invents movement without previous revealed standings: %s', (previous) => {
    expect(compareLeaderboards(previous, currentBoard)).toEqual([])
    expect(selectLeaderboardCommentary(previous, currentBoard)).toBeNull()
  })

  it('handles new and missing identities without invented ranks', () => {
    const after = board(['Newcomer', 'Roger', 'Jaki'])
    const movements = compareLeaderboards(previousBoard, after)
    expect(movements.map((entry) => entry.playerId)).toEqual(['roger', 'jaki'])
    expect(selectLeaderboardCommentary(previousBoard, after)).toBeNull()
    expect(compareLeaderboards(previousBoard, [])).toEqual([])
  })

  it('keeps unchanged standings quiet, even when scores increase', () => {
    expect(compareLeaderboards(previousBoard, previousBoard).every((entry) => entry.places === 0)).toBe(true)
    expect(selectLeaderboardCommentary(previousBoard, previousBoard.map((entry) => ({ ...entry, totalScore: entry.totalScore + 100 })))).toBeNull()
  })

  it('respects the supplied deterministic tie ranks without re-sorting by score or nickname', () => {
    const before = board(['Zoe', 'Amy'], [100, 100])
    const after = board(['Amy', 'Zoe'], [100, 100])
    expect(compareLeaderboards(before, after)[0].places).toBe(1)
    expect(selectLeaderboardCommentary(before, after)?.playerId).toBe('amy')
  })

  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [112, '112th']])('formats ordinal rank %s', (rank, expected) => {
    expect(ordinalRank(rank as number)).toBe(expected)
  })
})
