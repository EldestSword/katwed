import { expect, it } from 'vitest'
import type { Player } from '../../types/domain'
import { survivorStandings } from './survivor'
import { selectSurvivorCommentary } from './survivorCommentary'
import { selectLiveCommentary } from './streakCommentary'

const player = (nickname: string, lives: number): Player => ({
  id: nickname.toLowerCase(), sessionId: 'session', nickname, connected: true, joinedAt: '',
  totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
  survivorLivesRemaining: lives, survivorEliminatedAtQuestion: lives ? null : 2,
})

it('prioritises last survivor and total wipeout over ordinary elimination copy', () => {
  const last = [player('Carol', 1), player('Roger', 0)]
  expect(selectSurvivorCommentary(new Map([['carol', 1], ['roger', 1]]), last, survivorStandings(last)))
    .toMatchObject({ kind: 'last-survivor', playerId: 'carol', eliminatedPlayerIds: ['roger'] })
  const wipeout = [player('Carol', 0), player('Roger', 0)]
  expect(selectSurvivorCommentary(new Map([['carol', 1], ['roger', 1]]), wipeout, survivorStandings(wipeout)))
    .toMatchObject({ kind: 'total-wipeout', eliminatedPlayerIds: ['carol', 'roger'] })
})

it('announces only witnessed eliminations and stays quiet for Buzz-neutral or refreshed states', () => {
  const players = [player('Carol', 2), player('Roger', 1), player('Jaki', 1)]
  expect(selectSurvivorCommentary(null, players, survivorStandings(players))).toBeNull()
  expect(selectSurvivorCommentary(new Map([['carol', 2], ['roger', 1]]), players, survivorStandings(players))).toBeNull()
  players[1] = player('Roger', 0)
  expect(selectSurvivorCommentary(new Map([['carol', 2], ['roger', 1]]), players, survivorStandings(players)))
    .toMatchObject({ kind: 'elimination', playerId: 'roger' })
})

it('wins the shared one-callout priority over lead movement and Streak milestones', () => {
  const players = [player('Carol', 1), player('Roger', 0)]
  const survivor = selectSurvivorCommentary(new Map([['carol', 1], ['roger', 1]]), players, survivorStandings(players))!
  expect(selectLiveCommentary(
    [{ playerId: 'roger', nickname: 'Roger', rank: 1, totalScore: 100, correctAnswerCount: 1, totalCorrectResponseMs: 1000 }],
    survivorStandings(players),
    { kind: 'streak', playerId: 'carol', streak: 10, message: 'Ten!' }, survivor, true,
  )).toBe(survivor)
})
