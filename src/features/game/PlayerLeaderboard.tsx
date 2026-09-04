import { useEffect } from 'react'
import { Leaderboard } from '../../components/Leaderboard'
import type { LeaderboardReveal } from '../../hooks/useRevealedLeaderboard'
import { compareLeaderboards, ordinalRank } from './leaderboardMovement'
import { StreakBadge } from './StreakBadge'
import type { Player } from '../../types/domain'
import { survivorStatusLabel } from './survivor'

export function PlayerLeaderboard({ reveal, currentPlayerId, onSettled, teamName, personalStreak, players, survivor = false, newlyEliminated: newlyEliminatedProp }: {
  reveal: LeaderboardReveal
  currentPlayerId: string
  onSettled(id: number): void
  teamName?: string
  personalStreak?: number
  players?: readonly Player[]
  survivor?: boolean
  newlyEliminated?: boolean
}) {
  const movement = compareLeaderboards(reveal.previous, reveal.entries).find((entry) => entry.playerId === currentPlayerId)
  const amount = Math.abs(movement?.places ?? 0)
  const places = `${amount} ${amount === 1 ? 'place' : 'places'}`
  const currentEntry = reveal.entries.find((entry) => entry.playerId === currentPlayerId)
  const eliminated = Boolean(survivor && currentEntry && (currentEntry.survivorLivesRemaining ?? 0) === 0)
  const newlyEliminatedFromBoard = Boolean(eliminated &&
    (reveal.previous?.find((entry) => entry.playerId === currentPlayerId)?.survivorLivesRemaining ?? 0) > 0)
  const newlyEliminated = newlyEliminatedProp ?? newlyEliminatedFromBoard
  useEffect(() => { onSettled(reveal.id) }, [onSettled, reveal.id])
  return (
    <>
      {survivor && currentEntry && <div className={`player-survivor-result ${(currentEntry.survivorLivesRemaining ?? 0) <= 0 ? 'is-out' : ''}`} role="status">
        <strong>{newlyEliminated ? 'YOU’RE OUT' : eliminated ? 'OUT' : survivorStatusLabel(currentEntry)}</strong>
        <span>{newlyEliminated ? 'You can keep watching.' : eliminated ? 'Still spectating.' : `You’re ${ordinalRank(currentEntry.rank)}`}</span>
      </div>}
      {!eliminated && movement && movement.places !== 0 && <div className="player-rank-movement" role="status" data-direction={movement.places > 0 ? 'up' : 'down'}>
        <strong><span aria-hidden="true">{movement.places > 0 ? '↑' : '↓'} {places}</span><span className="sr-only">{movement.places > 0 ? 'Up' : 'Down'} {places}</span></strong>
        <span>{teamName ? `${teamName} is now` : 'You’re now'} {ordinalRank(movement.rank)}</span>
      </div>}
      <StreakBadge personal streak={personalStreak} />
      <Leaderboard entries={reveal.entries.map(entry => ({ ...entry, currentCorrectStreak: players?.find(player => player.id === entry.playerId)?.currentCorrectStreak ?? entry.currentCorrectStreak }))} currentPlayerId={currentPlayerId} showStreaks />
    </>
  )
}
