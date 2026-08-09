import type { ReactNode } from 'react'

export function RevealAnswerCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`reveal-answer-card ${className}`.trim()} role="group" aria-label="Correct answer">
      {children}
    </div>
  )
}
