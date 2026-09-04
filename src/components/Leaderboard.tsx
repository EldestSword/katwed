import type { Ref } from 'react'
import type { LeaderboardEntry } from '../types/domain'
import { StreakBadge } from '../features/game/StreakBadge'

export function LeaderboardRow({ entry, currentPlayerId, visual, movement, emphasised, rowRef, showStreak = false }: {
  entry: LeaderboardEntry
  currentPlayerId?: string
  visual?: { score: number; rank: number; layoutRank: number }
  movement?: number
  emphasised?: boolean
  rowRef?: Ref<HTMLLIElement>
  showStreak?: boolean
}) {
  const rank = visual?.rank ?? entry.rank
  const score = visual?.score ?? entry.totalScore
  const points = `${score.toLocaleString('en-GB')} ${score === 1 ? 'point' : 'points'}`
  return (
    <li ref={rowRef} data-player-id={entry.playerId} data-rank={entry.rank}
      className={`leaderboard__entry ${(visual?.layoutRank ?? entry.rank) <= 3 ? 'is-top-rank' : ''} ${entry.playerId === currentPlayerId ? 'is-current' : ''} ${emphasised ? 'is-moving-highlight' : ''}`.trim()}>
      <span className="leaderboard__rank">{visual ? <><span aria-hidden="true">{rank}</span><span className="sr-only">{entry.rank}</span></> : rank}</span>
      <strong className="leaderboard__name">{entry.nickname}{showStreak && <StreakBadge streak={entry.currentCorrectStreak} />}</strong>
      <span className="leaderboard__points">
        {visual ? <><span aria-hidden="true">{points}</span><span className="sr-only">{entry.totalScore.toLocaleString('en-GB')} {entry.totalScore === 1 ? 'point' : 'points'}</span></> : points}
        {Boolean(movement) && <span className="leaderboard__movement" data-direction={movement! > 0 ? 'up' : 'down'}>
          <span aria-hidden="true">{movement! > 0 ? '↑' : '↓'} {Math.abs(movement!)}</span>
          <span className="sr-only">{movement! > 0 ? 'Up' : 'Down'} {Math.abs(movement!)} {Math.abs(movement!) === 1 ? 'place' : 'places'}</span>
        </span>}
      </span>
    </li>
  )
}

export function Leaderboard({
  entries,
  currentPlayerId,
  variant = 'player',
  showStreaks = false,
}: {
  entries: LeaderboardEntry[]
  currentPlayerId?: string
  variant?: 'player' | 'presentation'
  showStreaks?: boolean
}) {
  if (!entries.length) return <p className="empty-note">No scores yet. A beautifully blank slate.</p>
  return (
    <ol className={`leaderboard leaderboard--${variant}`} aria-label="Leaderboard" data-variant={variant}>
      {entries.map((entry) => <LeaderboardRow entry={entry} currentPlayerId={currentPlayerId} showStreak={showStreaks} key={entry.playerId} />)}
    </ol>
  )
}
