import type { Player, PlayerAnswer } from '../../types/domain'

export interface CorrectStreaks {
  currentCorrectStreak: number
  longestCorrectStreak: number
}

/** Missing legacy statistics mean zero; malformed authoritative values are rejected. */
export function normaliseStreaks(value: { currentCorrectStreak?: unknown; longestCorrectStreak?: unknown }): CorrectStreaks {
  const current = value.currentCorrectStreak === undefined ? 0 : value.currentCorrectStreak
  const longest = value.longestCorrectStreak === undefined ? 0 : value.longestCorrectStreak
  if (typeof current !== 'number' || typeof longest !== 'number' || !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(longest) || current < 0 || longest < current) throw new Error('Invalid correct-answer streak statistics.')
  return { currentCorrectStreak: current, longestCorrectStreak: longest }
}

/** History is already bounded to completed questions. Missing/partial answers break a run. */
export function calculateCorrectStreaks(history: readonly (boolean | null | undefined)[]): CorrectStreaks {
  let currentCorrectStreak = 0, longestCorrectStreak = 0
  for (const correct of history) {
    currentCorrectStreak = correct === true ? currentCorrectStreak + 1 : 0
    longestCorrectStreak = Math.max(longestCorrectStreak, currentCorrectStreak)
  }
  return { currentCorrectStreak, longestCorrectStreak }
}

/** A single indexed pass over answers; never infer correctness from awarded points. */
export function recomputePlayerStreaks(players: readonly Player[], answers: readonly PlayerAnswer[], completedQuestionIds: readonly string[], neutralQuestionIds: ReadonlySet<string> = new Set()): Player[] {
  const byPlayer = new Map<string, Map<string, boolean>>()
  for (const answer of answers) {
    if (!byPlayer.has(answer.playerId)) byPlayer.set(answer.playerId, new Map())
    byPlayer.get(answer.playerId)!.set(answer.questionId, answer.correct)
  }
  const eligibleQuestionIds = completedQuestionIds.filter(id => !neutralQuestionIds.has(id))
  return players.map(player => ({ ...player, ...calculateCorrectStreaks(eligibleQuestionIds.map(id => byPlayer.get(player.id)?.get(id))) }))
}
