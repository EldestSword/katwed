import type { LeaderboardEntry } from '../../types/domain'

export interface RankMovement {
  playerId: string
  nickname: string
  previousRank: number
  rank: number
  places: number
}

/** Event data stays separate from its copy so future commentary sources can extend this union. */
export type LeaderboardCommentary =
  | { kind: 'new-leader' | 'top-three' | 'major-climb'; playerId: string; message: string }
  | { kind: 'overtake'; playerId: string; overtakenPlayerId: string; message: string }

export function compareLeaderboards(previous: readonly LeaderboardEntry[] | null, current: readonly LeaderboardEntry[]): RankMovement[] {
  if (!previous?.length) return []
  const before = new Map(previous.map((entry) => [entry.playerId, entry]))
  return current.flatMap((entry) => {
    const old = before.get(entry.playerId)
    return old ? [{ playerId: entry.playerId, nickname: entry.nickname, previousRank: old.rank, rank: entry.rank, places: old.rank - entry.rank }] : []
  })
}

export function selectLeaderboardCommentary(previous: readonly LeaderboardEntry[] | null, current: readonly LeaderboardEntry[]): LeaderboardCommentary | null {
  const movements = compareLeaderboards(previous, current)
  const climbers = movements.filter((movement) => movement.places > 0)
    .sort((a, b) => b.places - a.places || a.rank - b.rank || a.playerId.localeCompare(b.playerId, 'en-GB'))
  const leader = climbers.find((movement) => movement.rank === 1)
  if (leader && previous?.some((entry) => entry.rank === 1 && entry.playerId !== leader.playerId)) {
    return { kind: 'new-leader', playerId: leader.playerId, message: `${leader.nickname} takes the lead!` }
  }
  const podium = climbers.find((movement) => movement.previousRank > 3 && movement.rank <= 3)
  if (podium) return { kind: 'top-three', playerId: podium.playerId, message: `${podium.nickname} breaks into the top three!` }
  const major = climbers.find((movement) => movement.places >= 3)
  if (major) return { kind: 'major-climb', playerId: major.playerId, message: `${major.nickname} climbs ${major.places} places!` }
  for (const climber of climbers.filter((movement) => movement.rank <= 5)) {
    const overtaken = movements.filter((other) => other.previousRank < climber.previousRank && other.rank > climber.rank && other.rank <= 5)
      .sort((a, b) => a.rank - b.rank || a.playerId.localeCompare(b.playerId, 'en-GB'))[0]
    if (overtaken) return { kind: 'overtake', playerId: climber.playerId, overtakenPlayerId: overtaken.playerId, message: `${climber.nickname} moves ahead of ${overtaken.nickname}!` }
  }
  return null
}

export function ordinalRank(rank: number): string {
  const lastTwo = rank % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th'
  return `${rank}${suffix}`
}
