import { useEffect } from 'react'
import { Leaderboard } from '../../components/Leaderboard'
import type { LeaderboardReveal } from '../../hooks/useRevealedLeaderboard'
import { compareLeaderboards, ordinalRank } from './leaderboardMovement'
import { StreakBadge } from './StreakBadge'
import type { Player } from '../../types/domain'

export function PlayerLeaderboard({ reveal, currentPlayerId, onSettled, teamName, personalStreak, players }: {
  reveal: LeaderboardReveal
  currentPlayerId: string
  onSettled(id: number): void
  teamName?: string
  personalStreak?: number
  players?: readonly Player[]
}) {
  const movement = compareLeaderboards(reveal.previous, reveal.entries).find((entry) => entry.playerId === currentPlayerId)
  const amount = Math.abs(movement?.places ?? 0)
  const places = `${amount} ${amount === 1 ? 'place' : 'places'}`
  useEffect(() => { onSettled(reveal.id) }, [onSettled, reveal.id])
  return (
    <>
      {movement && movement.places !== 0 && <div className="player-rank-movement" role="status" data-direction={movement.places > 0 ? 'up' : 'down'}>
        <strong><span aria-hidden="true">{movement.places > 0 ? '↑' : '↓'} {places}</span><span className="sr-only">{movement.places > 0 ? 'Up' : 'Down'} {places}</span></strong>
        <span>{teamName ? `${teamName} is now` : 'You’re now'} {ordinalRank(movement.rank)}</span>
      </div>}
      <StreakBadge personal streak={personalStreak} />
      <Leaderboard entries={reveal.entries.map(entry => ({ ...entry, currentCorrectStreak: players?.find(player => player.id === entry.playerId)?.currentCorrectStreak ?? entry.currentCorrectStreak }))} currentPlayerId={currentPlayerId} showStreaks />
    </>
  )
}
