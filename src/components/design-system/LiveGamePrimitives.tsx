import type { CSSProperties, ReactNode } from 'react'
import { AnswerTile } from './AnswerTile'
import { GameBadge } from './GameBadge'

export function QuestionProgressBadge({
  questionNumber,
  totalQuestions,
  compact = false,
}: {
  questionNumber: number
  totalQuestions: number
  compact?: boolean
}) {
  const label = `Question ${questionNumber} of ${totalQuestions}`
  return (
    <GameBadge className="question-progress-badge" tone="info">
      <span aria-hidden="true">{compact ? `${questionNumber} / ${totalQuestions}` : label}</span>
      <span className="sr-only">{label}</span>
    </GameBadge>
  )
}

export function SubmissionStatus({
  submitted,
  total,
  label = 'answered',
}: {
  submitted: number
  total: number
  label?: string
}) {
  const progress = total > 0 ? Math.min(1, submitted / total) : 0
  return (
    <div
      className={`submission-status ${total > 0 && submitted >= total ? 'is-complete' : ''}`}
      role="status"
      aria-label={`${submitted} of ${total} ${label}`}
      style={{ '--submission-progress': progress } as CSSProperties}
    >
      <span className="submission-status__track" aria-hidden="true"><i /></span>
      <strong>{submitted} / {total}</strong>
      <span>{label}</span>
    </div>
  )
}

export function LobbyPlayerTile({ children, connected = true }: { children: ReactNode; connected?: boolean }) {
  return (
    <li className={`lobby-player-tile motion-rise ${connected ? 'is-connected' : 'is-disconnected'}`}>
      <span className="lobby-player-tile__signal" aria-hidden="true" />
      <span>{children}</span>
      <span className="sr-only">{connected ? 'Connected' : 'Disconnected'}</span>
    </li>
  )
}

export function RevealAnswerTile({
  label,
  position,
  style,
  correct,
  responseCount,
  optionId,
}: {
  label: ReactNode
  position: number
  style: CSSProperties
  correct: boolean
  responseCount?: number
  optionId?: string
}) {
  const responseLabel = responseCount === 1 ? '1 response' : `${responseCount ?? 0} responses`
  return (
    <article
      className={`reveal-answer-tile ${correct ? 'is-correct' : 'is-receded'}`}
      aria-label={`${typeof label === 'string' ? label : `Answer ${position + 1}`}: ${correct ? 'correct answer' : 'not a correct answer'}${responseCount === undefined ? '' : `, ${responseLabel}`}`}
      data-option-id={optionId}
    >
      <AnswerTile
        className="answer-colour-tile"
        label={label}
        optionId={optionId}
        position={position}
        state={correct ? 'correct' : 'incorrect'}
        style={style}
      />
      <div className="reveal-answer-tile__meta">
        <strong>{correct ? '✓ Correct' : 'Not in the answer'}</strong>
        {responseCount !== undefined && <span>{responseLabel}</span>}
      </div>
    </article>
  )
}
