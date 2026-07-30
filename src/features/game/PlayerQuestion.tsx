import { useEffect, useState } from 'react'
import { useCountdown } from '../../hooks/useCountdown'
import type { RosterMember, SafeQuestion } from '../../types/domain'
import { StatusMessage } from '../../components/StatusMessage'
import { QuestionImage } from '../../components/QuestionImage'

interface PlayerQuestionProps {
  question: SafeQuestion
  roster: RosterMember[]
  closesAt: string | null
  initialSelection?: readonly [string, string] | null
  onSubmit(selectedIds: readonly [string, string]): Promise<void>
}

export function PlayerQuestion({
  question,
  roster,
  closesAt,
  initialSelection = null,
  onSubmit,
}: PlayerQuestionProps) {
  const [selected, setSelected] = useState<string[]>(() => initialSelection ? [...initialSelection] : [])
  const [submitted, setSubmitted] = useState(Boolean(initialSelection))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [limitMessage, setLimitMessage] = useState('')
  const remaining = useCountdown(closesAt)

  useEffect(() => {
    setSelected(initialSelection ? [...initialSelection] : [])
    setSubmitted(Boolean(initialSelection))
    setError('')
    setLimitMessage('')
  }, [initialSelection, question.id])

  function toggle(memberId: string) {
    if (submitted || submitting || remaining <= 0) return
    setError('')
    setLimitMessage('')
    setSelected((current) => {
      if (current.includes(memberId)) return current.filter((id) => id !== memberId)
      if (current.length === 2) {
        setLimitMessage('Two selected already — deselect one before choosing somebody else.')
        return current
      }
      return [...current, memberId]
    })
  }

  async function lockIn() {
    if (selected.length !== 2 || submitted || remaining <= 0) return
    setSubmitting(true)
    setError('')
    try {
      await onSubmit([selected[0], selected[1]])
      setSubmitted(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your answer could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section className="player-waiting" aria-live="polite">
        <div className="waiting-tick" aria-hidden="true">✓</div>
        <h2>Answer locked in</h2>
        <p>Your choices are safely tucked away. We’ll reveal the pair when the host is ready.</p>
        <div className="locked-pair">
          {selected.map((id) => <span key={id}>{roster.find((member) => member.id === id)?.displayName}</span>)}
        </div>
      </section>
    )
  }

  return (
    <section className="player-question" aria-labelledby="question-instruction">
      <div className="question-meta">
        <span>Question {question.questionNumber} of {question.totalQuestions}</span>
        <strong className={`timer ${remaining <= 5 ? 'timer--urgent' : ''}`} aria-label={`${remaining} seconds remaining`}>{remaining}</strong>
      </div>
      <div className="portrait-frame">
        <QuestionImage path={question.imagePath} alt="AI-generated merged portrait for the current question." />
      </div>
      <div className="selection-heading">
        <div>
          <h2 id="question-instruction">Select exactly 2 people</h2>
          <p>{selected.length} of 2 selected</p>
        </div>
        <span className="selection-count" aria-hidden="true">{selected.length}/2</span>
      </div>
      <div className="roster-grid" role="group" aria-label="Team roster">
        {roster.map((member) => {
          const isSelected = selected.includes(member.id)
          return (
            <button
              key={member.id}
              type="button"
              className={`roster-choice ${isSelected ? 'is-selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => toggle(member.id)}
            >
              <span className="choice-marker" aria-hidden="true">{isSelected ? '✓' : ''}</span>
              <span>{member.displayName}</span>
            </button>
          )
        })}
      </div>
      <div className="selection-status" aria-live="polite">
        {limitMessage && <p>{limitMessage}</p>}
        {remaining <= 0 && <StatusMessage tone="error">Time is up. Waiting for the host to reveal the answer.</StatusMessage>}
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
      </div>
      <button
        className="button button--primary button--wide lock-button"
        type="button"
        disabled={selected.length !== 2 || submitted || submitting || remaining <= 0}
        onClick={() => void lockIn()}
      >
        {submitting ? 'Submitting…' : 'Lock in'}
      </button>
    </section>
  )
}
