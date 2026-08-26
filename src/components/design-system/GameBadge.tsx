import type { ReactNode } from 'react'

export type GameBadgeTone = 'info' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

export function GameBadge({
  children,
  tone = 'info',
  large = false,
  className = '',
}: {
  children: ReactNode
  tone?: GameBadgeTone
  large?: boolean
  className?: string
}) {
  return <span className={`game-badge game-badge--${tone} ${large ? 'game-badge--large' : ''} ${className}`.trim()}>{children}</span>
}
