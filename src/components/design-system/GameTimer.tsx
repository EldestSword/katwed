import type { CSSProperties } from 'react'

export function GameTimer({
  seconds,
  totalSeconds = 30,
  compact = false,
  urgentAt = 5,
  className = '',
}: {
  seconds: number
  totalSeconds?: number
  compact?: boolean
  urgentAt?: number
  className?: string
}) {
  const safeSeconds = Math.max(0, Math.ceil(seconds))
  const progress = Math.max(0, Math.min(1, safeSeconds / Math.max(1, totalSeconds)))
  const urgent = safeSeconds <= urgentAt
  const label = safeSeconds === 1 ? '1 second remaining' : `${safeSeconds} seconds remaining`
  return (
    <span
      className={`game-timer ${compact ? 'game-timer--compact' : ''} ${urgent ? 'game-timer--urgent' : ''} ${safeSeconds === 0 ? 'game-timer--zero' : ''} ${className}`.trim()}
      role="timer"
      aria-label={label}
      style={{ '--timer-progress': progress } as CSSProperties}
    >
      <span aria-hidden="true">{safeSeconds}</span>
    </span>
  )
}
