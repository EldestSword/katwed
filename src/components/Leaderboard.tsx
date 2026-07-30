import type { LeaderboardEntry } from '../types/domain'

export function Leaderboard({ entries, currentPlayerId }: { entries: LeaderboardEntry[]; currentPlayerId?: string }) {
  if (!entries.length) return <p className="empty-note">No scores yet. A beautifully blank slate.</p>
  return (
    <ol className="leaderboard" aria-label="Leaderboard">
      {entries.map((entry) => (
        <li key={entry.playerId} className={entry.playerId === currentPlayerId ? 'is-current' : ''}>
          <span className="leaderboard__rank">{entry.rank}</span>
          <strong>{entry.nickname}</strong>
          <span>{entry.totalScore} {entry.totalScore === 1 ? 'point' : 'points'}</span>
        </li>
      ))}
    </ol>
  )
}
