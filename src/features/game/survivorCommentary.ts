import type { LeaderboardEntry, Player } from '../../types/domain'
import { survivorAliveCount } from './survivor'

export type SurvivorCommentary = {
  kind: 'last-survivor' | 'total-wipeout' | 'elimination'
  message: string
  playerId?: string
  eliminatedPlayerIds: string[]
}

/** Selects one event only when a client witnessed alive players cross to zero. */
export function selectSurvivorCommentary(
  before: ReadonlyMap<string, number> | null,
  players: readonly Player[],
  standings: readonly LeaderboardEntry[],
): SurvivorCommentary | null {
  if (!before) return null
  const eliminated = players.filter((player) => (before.get(player.id) ?? 0) > 0 && (player.survivorLivesRemaining ?? 0) === 0)
  if (!eliminated.length) return null
  const aliveCount = survivorAliveCount(players)
  if (aliveCount === 1) {
    const survivor = standings.find((entry) => (entry.survivorLivesRemaining ?? 0) > 0)
    if (survivor) return { kind: 'last-survivor', playerId: survivor.playerId,
      eliminatedPlayerIds: eliminated.map((player) => player.id), message: `${survivor.nickname} is the last player standing!` }
  }
  if (aliveCount === 0) return { kind: 'total-wipeout', eliminatedPlayerIds: eliminated.map((player) => player.id),
    message: 'Total wipeout! Nobody survived that one.' }
  if (eliminated.length === 1) return { kind: 'elimination', playerId: eliminated[0].id,
    eliminatedPlayerIds: [eliminated[0].id], message: `${eliminated[0].nickname} is out!` }
  return { kind: 'elimination', eliminatedPlayerIds: eliminated.map((player) => player.id),
    message: `${eliminated.length} players eliminated!` }
}
