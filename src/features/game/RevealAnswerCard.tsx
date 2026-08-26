import type { CSSProperties, ReactNode } from 'react'

export function RevealAnswerCard({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`reveal-answer-card ${className}`.trim()} role="group" aria-label="Correct answer" style={style}>
      {children}
    </div>
  )
}
