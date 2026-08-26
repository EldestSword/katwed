import type { LeaderboardEntry } from '../types/domain'

export function Leaderboard({
  entries,
  currentPlayerId,
  variant = 'player',
}: {
  entries: LeaderboardEntry[]
  currentPlayerId?: string
  variant?: 'player' | 'presentation'
}) {
  if (!entries.length) return <p className="empty-note">No scores yet. A beautifully blank slate.</p>
  return (
    <ol className={`leaderboard leaderboard--${variant}`} aria-label="Leaderboard" data-variant={variant}>
      {entries.map((entry) => (
        <li key={entry.playerId} data-rank={entry.rank} className={`leaderboard__entry ${entry.rank <= 3 ? 'is-top-rank' : ''} ${entry.playerId === currentPlayerId ? 'is-current' : ''}`.trim()}>
          <span className="leaderboard__rank">{entry.rank}</span>
          <strong className="leaderboard__name">{entry.nickname}</strong>
          <span className="leaderboard__points">{entry.totalScore.toLocaleString()} {entry.totalScore === 1 ? 'point' : 'points'}</span>
        </li>
      ))}
    </ol>
  )
}
