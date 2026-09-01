import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCountdown } from '../../hooks/useCountdown'
import type {
  AnswerColourTuple,
  AnswerPaletteId,
  ChoiceOption,
  PlayerAnswerPayload,
  RosterMember,
  SafeQuestion,
} from '../../types/domain'
import { StatusMessage } from '../../components/StatusMessage'
import { QuestionMedia } from '../../components/QuestionMedia'
import { ImageViewer } from '../../components/ImageViewer'
import { AnswerTile } from '../../components/design-system/AnswerTile'
import { GameTimer } from '../../components/design-system/GameTimer'
import { QuestionProgressBadge } from '../../components/design-system/LiveGamePrimitives'
import { PinpointSurface } from './PinpointSurface'
import { PlayerSubmissionSummary } from './PlayerSubmissionSummary'
import { MAX_TYPED_ANSWER_LENGTH, isMeaningfulTypedAnswer } from '../typed-answer/typedAnswer'
import { DoubleScoreBadge } from './DoubleScoreIntro'
import { orderedQuestionOptions } from '../questions/optionOrdering'
import {
  CLASSIC_ANSWER_COLOURS,
  answerColourStyle,
  resolveAnswerColours,
} from '../answer-palettes/answerPalettes'
import { answerTextDensity, hasExtraLongAnswer, questionTextDensity } from './liveQuestionTypography'

interface PlayerQuestionProps {
  question: SafeQuestion
  roster: RosterMember[]
  closesAt: string | null
  openedAt?: string | null
  initialAnswer?: PlayerAnswerPayload | null
  modeLabel?: string
  answerPaletteId?: AnswerPaletteId
  customAnswerColours?: AnswerColourTuple
  onSubmit(payload: PlayerAnswerPayload): Promise<void>
}

function ChoiceCard({
  option,
  selected,
  position,
  colours,
  onSelect,
  onNeedsWideLayout,
}: {
  option: ChoiceOption
  selected: boolean
  position: number
  colours: readonly string[]
  onSelect(): void
  onNeedsWideLayout(): void
}) {
  const [enlarged, setEnlarged] = useState(false)
  return (
    <>
      <AnswerTile
        className="answer-choice answer-colour-tile"
        optionId={option.id}
        position={position}
        label={option.label}
        accessibleLabel={option.label}
        image={option.imagePath ? { path: option.imagePath, alt: option.imageAlt || option.label || 'Answer option image' } : undefined}
        selected={selected}
        style={answerColourStyle(colours, position)}
        textDensity={answerTextDensity(option.label)}
        fitSingleWords
        onLabelNeedsMoreWidth={onNeedsWideLayout}
        onSelect={onSelect}
        onEnlarge={option.imagePath ? () => setEnlarged(true) : undefined}
      />
      {enlarged && option.imagePath && <ImageViewer path={option.imagePath} alt={option.imageAlt || option.label} onClose={() => setEnlarged(false)} />}
    </>
  )
}

export function PlayerQuestion({
  question,
  roster,
  closesAt,
  openedAt = null,
  initialAnswer = null,
  modeLabel,
  answerPaletteId = 'classic',
  customAnswerColours = CLASSIC_ANSWER_COLOURS,
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
  const [wideAnswerLayout, setWideAnswerLayout] = useState(false)
  const remaining = useCountdown(closesAt)
  const timedOut = closesAt !== null && remaining <= 0
  const answerColours = resolveAnswerColours(answerPaletteId, customAnswerColours)
  const requestWideAnswerLayout = useCallback(() => setWideAnswerLayout(true), [])

  useEffect(() => {
    setAnswer(initialAnswer)
    setMashupSelection(initialAnswer?.type === 'mashup' ? [...initialAnswer.memberIds] : [])
    setSubmitted(Boolean(initialAnswer))
    setError('')
    setLimitMessage('')
    setWideAnswerLayout(false)
  }, [initialAnswer, question.id])

  const canSubmit = useMemo(() => {
    if (question.type === 'mashup') return mashupSelection.length === 2
    if (!answer || answer.type !== question.type) return false
    if (answer.type === 'multiple-select' && question.type === 'multiple-select') {
      return answer.optionIds.length >= question.minimumSelections && answer.optionIds.length <= question.maximumSelections
    }
    if (answer.type === 'typed-answer') {
      return answer.value.length <= MAX_TYPED_ANSWER_LENGTH && isMeaningfulTypedAnswer(answer.value)
    }
    return true
  }, [answer, mashupSelection.length, question])

  async function lockIn() {
    const payload = question.type === 'mashup' && mashupSelection.length === 2
      ? { type: 'mashup' as const, memberIds: [mashupSelection[0], mashupSelection[1]] as const }
      : answer?.type === 'typed-answer'
        ? { ...answer, value: answer.value.trim() }
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
        <div className="player-waiting__status"><span className="waiting-tick" aria-hidden="true">✓</span><div><p className="eyebrow">Submitted</p><h2>Answer locked</h2></div></div>
        <PlayerSubmissionSummary answer={answer} question={question} roster={roster} answerPaletteId={answerPaletteId} customAnswerColours={customAnswerColours} />
        <p className="player-waiting__next">Waiting for the reveal…</p>
      </section>
    )
  }

  const showMedia = question.mediaVisibility === 'players' || question.mediaVisibility === 'both'
  const visibleVisualMedia = showMedia && question.media.type !== 'none'
  return (
    <section className="player-question" aria-labelledby="question-instruction">
      <div className="question-meta">
        {modeLabel ? <span>{modeLabel}</span> : <QuestionProgressBadge questionNumber={question.questionNumber} totalQuestions={question.totalQuestions} compact />}
        {question.doubleScore && <DoubleScoreBadge />}
        {closesAt !== null && <GameTimer seconds={remaining} totalSeconds={question.timeLimitSeconds} />}
      </div>
      <div className="player-question__prompt" data-question-density={questionTextDensity(question.prompt, visibleVisualMedia)}>
        <h1 id="question-instruction">{question.prompt}</h1>
        {question.supportingText && <p>{question.supportingText}</p>}
      </div>
      {showMedia && question.type !== 'pinpoint' && (
        <QuestionMedia media={question.media} openedAt={openedAt} />
      )}

      {question.type === 'single-choice' && (
        <div className="answer-grid" data-option-count={question.options.length} data-has-extra-long-answer={hasExtraLongAnswer(question.options.map((option) => option.label)) || undefined} data-answer-fit-wide={wideAnswerLayout || undefined} role="group" aria-label="Choose one answer">
          {orderedQuestionOptions(question).map((option, position) => (
            <ChoiceCard
              key={option.id}
              option={option}
              selected={answer?.type === 'single-choice' && answer.optionId === option.id}
              position={position}
              colours={answerColours}
              onNeedsWideLayout={requestWideAnswerLayout}
              onSelect={() => setAnswer({ type: 'single-choice', optionId: option.id })}
            />
          ))}
        </div>
      )}

      {question.type === 'multiple-select' && (
        <>
          <div className="selection-guidance">
            <span>Select {question.minimumSelections === question.maximumSelections ? question.minimumSelections : `${question.minimumSelections}–${question.maximumSelections}`} options</span>
            <strong>{answer?.type === 'multiple-select' ? answer.optionIds.length : 0} / {question.maximumSelections} selected</strong>
          </div>
          <div className="answer-grid" data-option-count={question.options.length} data-has-extra-long-answer={hasExtraLongAnswer(question.options.map((option) => option.label)) || undefined} data-answer-fit-wide={wideAnswerLayout || undefined} role="group" aria-label="Choose all applicable answers">
            {orderedQuestionOptions(question).map((option, position) => {
              const selected = answer?.type === 'multiple-select' ? answer.optionIds : []
              return (
                <ChoiceCard key={option.id} option={option} selected={selected.includes(option.id)} position={position} colours={answerColours} onNeedsWideLayout={requestWideAnswerLayout} onSelect={() => {
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
          {[true, false].map((value, position) => <AnswerTile
            key={String(value)}
            className="boolean-choice answer-colour-tile"
            position={position}
            label={value ? 'True' : 'False'}
            accessibleLabel={value ? 'True' : 'False'}
            selected={answer?.type === 'true-false' && answer.value === value}
            style={answerColourStyle(answerColours, position)}
            onSelect={() => setAnswer({ type: 'true-false', value })}
          />)}
        </div>
      )}

      {question.type === 'slider' && (
        <div className="slider-answer">
          <p className="eyebrow">Your value</p>
          <output aria-live="polite">{question.prefix}{answer?.type === 'slider' ? answer.value : question.minimum}{question.suffix}{question.unitLabel ? ` ${question.unitLabel}` : ''}</output>
          <div className="slider-answer__interaction">
            <input type="range" min={question.minimum} max={question.maximum} step={question.step}
              value={answer?.type === 'slider' ? answer.value : question.minimum}
              aria-label={question.unitLabel || 'Answer value'}
              onChange={(event) => setAnswer({ type: 'slider', value: Number(event.target.value) })} />
          </div>
          <div className="slider-answer__limits"><span><small>Minimum</small>{question.prefix}{question.minimum}{question.suffix}</span><span><small>Maximum</small>{question.prefix}{question.maximum}{question.suffix}</span></div>
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

      {question.type === 'typed-answer' && (
        <label className="typed-answer-input">
          <span>Type your answer</span>
          <input
            type="text"
            maxLength={MAX_TYPED_ANSWER_LENGTH}
            value={answer?.type === 'typed-answer' ? answer.value : ''}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(event) => setAnswer({ type: 'typed-answer', value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void lockIn()
              }
            }}
          />
        </label>
      )}

      {question.type === 'mashup' && (
        <>
          <div className="selection-heading"><div><p className="eyebrow">Exact pair required</p><h2>Select exactly 2 people</h2></div><strong className="selection-count">{mashupSelection.length} / 2</strong></div>
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
      <button className="button button--primary button--wide button--large lock-button" type="button" aria-busy={submitting}
        disabled={!canSubmit || submitted || submitting || timedOut}
        onClick={() => void lockIn()}>{submitting ? 'Submitting…' : 'Lock in'}</button>
    </section>
  )
}
