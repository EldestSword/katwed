import { useEffect, useMemo, useState } from 'react'
import { useCountdown } from '../../hooks/useCountdown'
import type {
  ChoiceOption,
  PlayerAnswerPayload,
  RosterMember,
  SafeQuestion,
} from '../../types/domain'
import { StatusMessage } from '../../components/StatusMessage'
import { QuestionMedia } from '../../components/QuestionMedia'
import { QuestionImage } from '../../components/QuestionImage'
import { ImageViewer } from '../../components/ImageViewer'
import { PinpointSurface } from './PinpointSurface'

interface PlayerQuestionProps {
  question: SafeQuestion
  roster: RosterMember[]
  closesAt: string | null
  openedAt?: string | null
  initialAnswer?: PlayerAnswerPayload | null
  modeLabel?: string
  onSubmit(payload: PlayerAnswerPayload): Promise<void>
}

function stableOptions(options: ChoiceOption[], randomise: boolean, seed: string): ChoiceOption[] {
  if (!randomise) return options
  return [...options].sort((left, right) => {
    const score = (value: string) => [...`${seed}${value}`].reduce((total, character) =>
      ((total * 31) + character.charCodeAt(0)) | 0, 0)
    return score(left.id) - score(right.id)
  })
}

function ChoiceCard({
  option,
  selected,
  onSelect,
}: {
  option: ChoiceOption
  selected: boolean
  onSelect(): void
}) {
  const [enlarged, setEnlarged] = useState(false)
  return (
    <button className={`answer-choice ${selected ? 'is-selected' : ''}`} type="button" aria-pressed={selected} onClick={onSelect}>
      {option.imagePath && <QuestionImage path={option.imagePath} alt={option.imageAlt || option.label || 'Answer option image'} />}
      <span>{option.label}</span>
      {option.imagePath && (
        <span className="enlarge-button" role="button" tabIndex={0} onClick={(event) => {
          event.stopPropagation()
          setEnlarged(true)
        }} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            setEnlarged(true)
          }
        }}>Enlarge</span>
      )}
      {enlarged && option.imagePath && <ImageViewer path={option.imagePath} alt={option.imageAlt || option.label} onClose={() => setEnlarged(false)} />}
    </button>
  )
}

function answerSummary(answer: PlayerAnswerPayload, question: SafeQuestion, roster: RosterMember[]): string {
  switch (answer.type) {
    case 'single-choice':
      return question.type === 'single-choice'
        ? question.options.find((option) => option.id === answer.optionId)?.label ?? 'Selected option'
        : 'Selected option'
    case 'multiple-select':
      return question.type === 'multiple-select'
        ? answer.optionIds.map((id) => question.options.find((option) => option.id === id)?.label ?? id).join(', ')
        : 'Selected options'
    case 'true-false': return answer.value ? 'True' : 'False'
    case 'slider': return String(answer.value)
    case 'pinpoint': return 'Location selected'
    case 'mashup':
      return answer.memberIds.map((id) => roster.find((member) => member.id === id)?.displayName ?? id).join(' + ')
  }
}

export function PlayerQuestion({
  question,
  roster,
  closesAt,
  openedAt = null,
  initialAnswer = null,
  modeLabel,
  onSubmit,
}: PlayerQuestionProps) {
  const [answer, setAnswer] = useState<PlayerAnswerPayload | null>(initialAnswer)
  const [mashupSelection, setMashupSelection] = useState<string[]>(
    initialAnswer?.type === 'mashup' ? [...initialAnswer.memberIds] : [],
  )
  const [submitted, setSubmitted] = useState(Boolean(initialAnswer))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [limitMessage, setLimitMessage] = useState('')
  const remaining = useCountdown(closesAt)
  const timedOut = closesAt !== null && remaining <= 0

  useEffect(() => {
    setAnswer(initialAnswer)
    setMashupSelection(initialAnswer?.type === 'mashup' ? [...initialAnswer.memberIds] : [])
    setSubmitted(Boolean(initialAnswer))
    setError('')
    setLimitMessage('')
  }, [initialAnswer, question.id])

  const canSubmit = useMemo(() => {
    if (question.type === 'mashup') return mashupSelection.length === 2
    if (!answer || answer.type !== question.type) return false
    if (answer.type === 'multiple-select' && question.type === 'multiple-select') {
      return answer.optionIds.length >= question.minimumSelections && answer.optionIds.length <= question.maximumSelections
    }
    return true
  }, [answer, mashupSelection.length, question])

  async function lockIn() {
    const payload = question.type === 'mashup' && mashupSelection.length === 2
      ? { type: 'mashup' as const, memberIds: [mashupSelection[0], mashupSelection[1]] as const }
      : answer
    if (!payload || !canSubmit || submitted || timedOut) return
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(payload)
      setAnswer(payload)
      setSubmitted(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your answer could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted && answer) {
    return (
      <section className="player-waiting" aria-live="polite">
        <div className="waiting-tick" aria-hidden="true">✓</div>
        <h2>Answer locked in</h2>
        <p>Your answer is safely tucked away. The result will appear after the reveal.</p>
        <strong>{answerSummary(answer, question, roster)}</strong>
      </section>
    )
  }

  const showMedia = question.mediaVisibility === 'players' || question.mediaVisibility === 'both'
  return (
    <section className="player-question" aria-labelledby="question-instruction">
      <div className="question-meta">
        <span>{modeLabel ?? `Question ${question.questionNumber} of ${question.totalQuestions}`}</span>
        {closesAt !== null && <strong className={`timer ${remaining <= 5 ? 'timer--urgent' : ''}`} aria-label={`${remaining} seconds remaining`}>{remaining}</strong>}
      </div>
      <div className="player-question__prompt">
        <h1 id="question-instruction">{question.prompt}</h1>
        {question.supportingText && <p>{question.supportingText}</p>}
      </div>
      {showMedia && question.type !== 'pinpoint' && (
        <QuestionMedia media={question.media} openedAt={openedAt} />
      )}

      {question.type === 'single-choice' && (
        <div className="answer-grid" role="group" aria-label="Choose one answer">
          {stableOptions(question.options, question.randomiseOptions, question.id).map((option) => (
            <ChoiceCard
              key={option.id}
              option={option}
              selected={answer?.type === 'single-choice' && answer.optionId === option.id}
              onSelect={() => setAnswer({ type: 'single-choice', optionId: option.id })}
            />
          ))}
        </div>
      )}

      {question.type === 'multiple-select' && (
        <>
          <p className="selection-guidance">Select {question.minimumSelections === question.maximumSelections
            ? question.minimumSelections
            : `${question.minimumSelections}–${question.maximumSelections}`} options.</p>
          <div className="answer-grid" role="group" aria-label="Choose all applicable answers">
            {stableOptions(question.options, question.randomiseOptions, question.id).map((option) => {
              const selected = answer?.type === 'multiple-select' ? answer.optionIds : []
              return (
                <ChoiceCard key={option.id} option={option} selected={selected.includes(option.id)} onSelect={() => {
                  setLimitMessage('')
                  if (selected.includes(option.id)) {
                    setAnswer({ type: 'multiple-select', optionIds: selected.filter((id) => id !== option.id) })
                  } else if (selected.length >= question.maximumSelections) {
                    setLimitMessage(`You can select up to ${question.maximumSelections} options.`)
                  } else {
                    setAnswer({ type: 'multiple-select', optionIds: [...selected, option.id] })
                  }
                }} />
              )
            })}
          </div>
        </>
      )}

      {question.type === 'true-false' && (
        <div className="boolean-grid" role="group" aria-label="True or false">
          {[true, false].map((value) => (
            <button key={String(value)} type="button" className={`boolean-choice ${answer?.type === 'true-false' && answer.value === value ? 'is-selected' : ''}`}
              aria-pressed={answer?.type === 'true-false' && answer.value === value}
              onClick={() => setAnswer({ type: 'true-false', value })}>{value ? 'True' : 'False'}</button>
          ))}
        </div>
      )}

      {question.type === 'slider' && (
        <div className="slider-answer">
          <output aria-live="polite">{question.prefix}{answer?.type === 'slider' ? answer.value : question.minimum}{question.suffix} {question.unitLabel}</output>
          <div className="slider-answer__interaction">
            <input type="range" min={question.minimum} max={question.maximum} step={question.step}
              value={answer?.type === 'slider' ? answer.value : question.minimum}
              aria-label={question.unitLabel || 'Answer value'}
              onChange={(event) => setAnswer({ type: 'slider', value: Number(event.target.value) })} />
          </div>
          <div className="slider-answer__limits"><span>{question.minimum}</span><span>{question.maximum}</span></div>
        </div>
      )}

      {question.type === 'pinpoint' && (
        <div className="pinpoint-answer">
          <PinpointSurface
            path={question.media.path}
            alt={question.media.altText}
            mode="answer"
            markers={answer?.type === 'pinpoint'
              ? [{ x: answer.x, y: answer.y, kind: 'player', label: 'Your pin' }]
              : []}
            onSelect={(point) => setAnswer({ type: 'pinpoint', ...point })}
          />
          <details>
            <summary>Keyboard location controls</summary>
            <label>Horizontal <input type="range" min="0" max="1" step="0.01" value={answer?.type === 'pinpoint' ? answer.x : 0.5}
              onChange={(event) => setAnswer({ type: 'pinpoint', x: Number(event.target.value), y: answer?.type === 'pinpoint' ? answer.y : 0.5 })} /></label>
            <label>Vertical <input type="range" min="0" max="1" step="0.01" value={answer?.type === 'pinpoint' ? answer.y : 0.5}
              onChange={(event) => setAnswer({ type: 'pinpoint', x: answer?.type === 'pinpoint' ? answer.x : 0.5, y: Number(event.target.value) })} /></label>
          </details>
        </div>
      )}

      {question.type === 'mashup' && (
        <>
          <div className="selection-heading"><h2>Select exactly 2 people</h2></div>
          <div className="roster-grid" role="group" aria-label="People bank">
            {roster.map((member) => {
              const selected = mashupSelection
              const isSelected = selected.includes(member.id)
              return (
                <button key={member.id} type="button" className={`roster-choice ${isSelected ? 'is-selected' : ''}`} aria-pressed={isSelected}
                  onClick={() => {
                    setLimitMessage('')
                    if (isSelected) {
                      setMashupSelection(selected.filter((id) => id !== member.id))
                    } else if (selected.length === 2) {
                      setLimitMessage('Two selected already — deselect one before choosing somebody else.')
                    } else {
                      setMashupSelection([...selected, member.id])
                    }
                  }}>
                  <span className="choice-marker" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                  <span>{member.displayName}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="selection-status" aria-live="polite">
        {limitMessage && <p>{limitMessage}</p>}
        {timedOut && <StatusMessage tone="error">Time is up. Waiting for the reveal.</StatusMessage>}
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
      </div>
      <button className="button button--primary button--wide lock-button" type="button"
        disabled={!canSubmit || submitted || submitting || timedOut}
        onClick={() => void lockIn()}>{submitting ? 'Submitting…' : 'Lock in'}</button>
    </section>
  )
}
