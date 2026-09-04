import { useEffect } from 'react'
import { Leaderboard } from '../../components/Leaderboard'
import type { LeaderboardReveal } from '../../hooks/useRevealedLeaderboard'
import { compareLeaderboards, ordinalRank } from './leaderboardMovement'

export function PlayerLeaderboard({ reveal, currentPlayerId, onSettled, teamName }: {
  reveal: LeaderboardReveal
  currentPlayerId: string
  onSettled(id: number): void
  teamName?: string
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
      <Leaderboard entries={reveal.entries} currentPlayerId={currentPlayerId} />
    </>
  )
}
