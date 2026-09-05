import type { LeaderboardEntry, Player } from '../../types/domain'
import { selectLeaderboardCommentary, type LeaderboardCommentary } from './leaderboardMovement'
import type { SurvivorCommentary } from './survivorCommentary'

export type StreakCommentary = { kind: 'streak'; playerId: string; streak: number; message: string }
export const isStreakMilestone = (streak: number): boolean => Number.isInteger(streak) && (streak === 3 || streak >= 5 && streak % 5 === 0)

export function selectStreakMilestone(before: ReadonlyMap<string, number> | null, players: readonly Player[], ranks: readonly LeaderboardEntry[] = []): StreakCommentary | null {
  if (!before) return null
  const rank = new Map(ranks.map(entry => [entry.playerId, entry.rank]))
  const eligible = players.filter(player => isStreakMilestone(player.currentCorrectStreak ?? 0) &&
    before.has(player.id) && player.currentCorrectStreak === before.get(player.id)! + 1)
    .sort((a, b) => b.currentCorrectStreak! - a.currentCorrectStreak! ||
      (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) ||
      a.nickname.localeCompare(b.nickname, 'en-GB') || a.id.localeCompare(b.id, 'en-GB'))
  const player = eligible[0]
  if (!player) return null
  const streak = player.currentCorrectStreak!
  return { kind: 'streak', playerId: player.id, streak,
    message: streak >= 10 ? `${player.nickname} has hit ${streak} correct in a row!` : `${player.nickname} is on a ${streak}-answer streak!` }
}

/** Keep existing movement detection intact; merge the two sources into one game-show beat. */
export function selectLiveCommentary(previous: readonly LeaderboardEntry[] | null, current: readonly LeaderboardEntry[], streak: StreakCommentary | null,
  survivor: SurvivorCommentary | null = null, survivorMode = false): LeaderboardCommentary | StreakCommentary | SurvivorCommentary | null {
  if (survivor) return survivor
  const movement = selectLeaderboardCommentary(previous, current)
  if (survivorMode && streak?.streak && streak.streak >= 5) return streak
  if (!streak || movement?.kind === 'new-leader' || movement?.kind === 'top-three') return movement
  if (streak.streak >= 5 || movement?.kind !== 'major-climb') return streak
  return movement
}
