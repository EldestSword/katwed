import '../../styles/streaks.css'

export function StreakBadge({ streak = 0, personal = false }: { streak?: number; personal?: boolean }) {
  if (streak < 2) return null
  return personal
    ? <p className="player-streak"><span>Your streak</span><strong>{streak} correct in a row</strong></p>
    : <span className="streak-badge" aria-label={`${streak} correct answers in a row`}>{streak} in a row</span>
}
