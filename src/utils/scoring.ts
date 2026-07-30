import type { LeaderboardEntry, Player } from '../types/domain'

export type PairScore =
  | { valid: true; correct: boolean; points: 0 | 1 }
  | { valid: false; correct: false; points: 0; reason: 'selection-count' | 'duplicate-selection' }

export function scoreExactPair(
  selectedIds: readonly string[],
  correctIds: readonly string[],
): PairScore {
  if (selectedIds.length !== 2 || correctIds.length !== 2) {
    return { valid: false, correct: false, points: 0, reason: 'selection-count' }
  }

  if (new Set(selectedIds).size !== 2 || new Set(correctIds).size !== 2) {
    return { valid: false, correct: false, points: 0, reason: 'duplicate-selection' }
  }

  const selected = new Set(selectedIds)
  const correct = selected.has(correctIds[0]) && selected.has(correctIds[1])
  return { valid: true, correct, points: correct ? 1 : 0 }
}

export function sortLeaderboard(players: readonly Player[]): LeaderboardEntry[] {
  const sorted = [...players].sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.correctAnswerCount - a.correctAnswerCount ||
      a.totalCorrectResponseMs - b.totalCorrectResponseMs ||
      a.nickname.localeCompare(b.nickname, 'en-GB', { sensitivity: 'base' }),
  )

  return sorted.map((player, index) => ({
    playerId: player.id,
    nickname: player.nickname,
    totalScore: player.totalScore,
    correctAnswerCount: player.correctAnswerCount,
    totalCorrectResponseMs: player.totalCorrectResponseMs,
    rank: index + 1,
  }))
}
