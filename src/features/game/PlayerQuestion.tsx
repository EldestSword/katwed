import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCountdown } from '../../hooks/useCountdown'
import type {
  AnswerColourTuple,
  AnswerPaletteId,
  BuzzClaimResult,
  BuzzState,
  ChoiceOption,
  PlayerAnswerPayload,
  RosterMember,
  SafeQuestion,
  Player,
  GameTeam,
} from '../../types/domain'
import { StatusMessage } from '../../components/StatusMessage'
import { QuestionMedia } from '../../components/QuestionMedia'
import { WagerControl } from './WagerControl'
import type { WagerPercent } from '../../types/domain'
import { ProgressiveRevealPoints } from './ProgressiveRevealPoints'
import { ImageViewer } from '../../components/ImageViewer'
import { AnswerTile } from '../../components/design-system/AnswerTile'
import { GameTimer } from '../../components/design-system/GameTimer'
import { QuestionProgressBadge } from '../../components/design-system/LiveGamePrimitives'
import { PinpointSurface } from './PinpointSurface'
import { PlayerSliderAnswer } from './PlayerSliderAnswer'
import { PlayerOrderingAnswer } from './PlayerOrderingAnswer'
import { PlayerMatchingAnswer } from './PlayerMatchingAnswer'
import { PlayerConnectionsAnswer } from './PlayerConnectionsAnswer'
import { ConnectionClues } from './ConnectionClues'
import { validMatchingPairs, validPermutation } from '../questions/arrangementQuestions'
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
  buzz?: BuzzState | null
  playerId?: string
  players?: Player[]
  teams?: GameTeam[]
  onBuzz?(): Promise<BuzzClaimResult>
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
  buzz = null,
  playerId = '',
  players = [],
  teams = [],
  onBuzz,
  onSubmit,
}: PlayerQuestionProps) {
  const [wagerPercent, setWagerPercent] = useState<WagerPercent>(initialAnswer?.wagerPercent ?? 0)
  const [answer, setAnswer] = useState<PlayerAnswerPayload | null>(initialAnswer)
  const [mashupSelection, setMashupSelection] = useState<string[]>(
    initialAnswer?.type === 'mashup' ? [...initialAnswer.memberIds] : [],
  )
  const [submitted, setSubmitted] = useState(Boolean(initialAnswer))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [limitMessage, setLimitMessage] = useState('')
  const [wideAnswerLayout, setWideAnswerLayout] = useState(false)
  const [claimingBuzz, setClaimingBuzz] = useState(false)
  const [claimedBuzz, setClaimedBuzz] = useState<BuzzState | null>(buzz)
  const [buzzError, setBuzzError] = useState('')
  const remaining = useCountdown(closesAt)
  const effectiveBuzz = buzz ?? claimedBuzz
  const buzzRemaining = useCountdown(effectiveBuzz?.answerDeadlineAt ?? null)
  const buzzQuestion = question.buzzInEnabled === true
  const playerWonBuzz = buzzQuestion && effectiveBuzz?.winnerPlayerId === playerId
  const buzzWindowClosed = playerWonBuzz && buzzRemaining <= 0
  const timedOut = (closesAt !== null && remaining <= 0) || buzzWindowClosed
  const answerColours = resolveAnswerColours(answerPaletteId, customAnswerColours)
  const requestWideAnswerLayout = useCallback(() => setWideAnswerLayout(true), [])

  useEffect(() => {
    setWagerPercent(initialAnswer?.wagerPercent ?? 0)
    setAnswer(initialAnswer)
    setMashupSelection(initialAnswer?.type === 'mashup' ? [...initialAnswer.memberIds] : [])
    setSubmitted(Boolean(initialAnswer))
    setError('')
    setLimitMessage('')
    setWideAnswerLayout(false)
    setClaimedBuzz(null)
    setBuzzError('')
  }, [initialAnswer, question.id, openedAt])

  useEffect(() => {
    setClaimedBuzz(buzz)
    if (!buzz) setBuzzError('')
    // Safe-state parsing replaces the players array on each authoritative
    // refresh, including a host reset whose Buzz value returns to null.
  }, [buzz, players])

  const canSubmit = useMemo(() => {
    if (question.type === 'mashup') return mashupSelection.length === 2
    if (!answer || answer.type !== question.type) return false
    if (answer.type === 'ordering' && question.type === 'ordering') return validPermutation(answer.itemIds, question.items.map((item) => item.id))
    if (answer.type === 'matching' && question.type === 'matching') return validMatchingPairs(answer.pairs, question.leftItems.map((item) => item.id), question.rightItems.map((item) => item.id))
    if (answer.type === 'multiple-select' && question.type === 'multiple-select') {
      return answer.optionIds.length >= question.minimumSelections && answer.optionIds.length <= question.maximumSelections
    }
    if (answer.type === 'typed-answer' || answer.type === 'connections') {
      return answer.value.length <= MAX_TYPED_ANSWER_LENGTH && isMeaningfulTypedAnswer(answer.value)
    }
    return true
  }, [answer, mashupSelection.length, question])

  async function lockIn() {
    const payload = question.type === 'mashup' && mashupSelection.length === 2
      ? { type: 'mashup' as const, memberIds: [mashupSelection[0], mashupSelection[1]] as const }
      : answer?.type === 'typed-answer' || answer?.type === 'connections'
        ? { ...answer, value: answer.value.trim() }
        : answer
    if (!payload || !canSubmit || submitted || submitting || timedOut) return
    setSubmitting(true)
    setError('')
    try {
      const submission = question.wagerEnabled ? { ...payload, wagerPercent } : payload
      await onSubmit(submission)
      setAnswer(submission)
      setSubmitted(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your answer could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function claimBuzz() {
    if (!onBuzz || claimingBuzz || timedOut || effectiveBuzz) return
    setClaimingBuzz(true)
    setBuzzError('')
    try {
      const result = await onBuzz()
      setClaimedBuzz(result)
      if (!result.won) setBuzzError('Too late — another player buzzed first.')
    } catch (reason) {
      setBuzzError(reason instanceof Error ? reason.message : 'The buzzer could not be reached. Please try again.')
    } finally {
      setClaimingBuzz(false)
    }
  }

  if (submitted && answer) {
    return (
      <section className="player-waiting" aria-live="polite">
        <div className="player-waiting__status"><span className="waiting-tick" aria-hidden="true">✓</span><div><p className="eyebrow">Submitted</p><h2>Answer locked</h2></div></div>
        <PlayerSubmissionSummary answer={answer} question={question} roster={roster} answerPaletteId={answerPaletteId} customAnswerColours={customAnswerColours} />
        {question.type === 'connections' && <ConnectionClues question={question} />}
        {question.progressiveRevealEnabled && question.mediaVisibility !== 'presentation' && <QuestionMedia media={question.media} openedAt={openedAt} progressiveRevealEnabled />}
        <p className="player-waiting__next">Waiting for the reveal…</p>
      </section>
    )
  }

  const showMedia = question.mediaVisibility === 'players' || question.mediaVisibility === 'both'
  const visibleVisualMedia = showMedia && question.media.type !== 'none'
  const buzzWinner = effectiveBuzz ? players.find(player => player.id === effectiveBuzz.winnerPlayerId) : undefined
  const buzzTeam = buzzWinner?.teamId ? teams.find(team => team.id === buzzWinner.teamId) : undefined
  const buzzWinnerLabel = buzzWinner ? `${buzzWinner.nickname}${buzzTeam ? ` · ${buzzTeam.name}` : ''}` : 'Another player'
  if (buzzQuestion && (!playerWonBuzz || buzzWindowClosed)) {
    return (
      <section className="player-question player-question--buzz" aria-labelledby="question-instruction">
        <div className="question-meta">
          {modeLabel ? <span>{modeLabel}</span> : <QuestionProgressBadge questionNumber={question.questionNumber} totalQuestions={question.totalQuestions} compact />}
          {question.doubleScore && <DoubleScoreBadge />}
          {closesAt !== null && <GameTimer seconds={remaining} totalSeconds={question.timeLimitSeconds} />}
        </div>
        <div className="player-question__prompt" data-question-density={questionTextDensity(question.prompt, visibleVisualMedia)}><h1 id="question-instruction">{question.prompt}</h1>{question.supportingText && <p>{question.supportingText}</p>}</div>
        {showMedia && question.type !== 'pinpoint' && <QuestionMedia media={question.media} openedAt={openedAt} progressiveRevealEnabled={question.progressiveRevealEnabled} />}
        {showMedia && question.type === 'pinpoint' && <QuestionMedia media={question.media} openedAt={openedAt} />}
        {question.wagerEnabled && !effectiveBuzz && <WagerControl points={question.points} value={wagerPercent} disabled={claimingBuzz || timedOut} onChange={setWagerPercent} />}
        {!effectiveBuzz ? <div className="buzz-gate" aria-live="polite"><p className="eyebrow">Buzzers open</p><button className="buzz-button" type="button" disabled={claimingBuzz || timedOut} aria-busy={claimingBuzz} onClick={() => void claimBuzz()}>{claimingBuzz ? 'BUZZING…' : 'BUZZ'}</button>{timedOut && <p>Time is up. Waiting for the host.</p>}{buzzError && <StatusMessage tone="error">{buzzError}</StatusMessage>}</div>
          : buzzWindowClosed ? <div className="buzz-result buzz-result--closed" aria-live="polite"><p className="eyebrow">Answer window closed</p><h2>Waiting for the host.</h2></div>
            : <div className="buzz-result" aria-live="polite"><p className="eyebrow">{buzzWinnerLabel} buzzed first</p><h2>Waiting for their answer…</h2>{buzzError && <p>Too late</p>}</div>}
      </section>
    )
  }
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
        <QuestionMedia media={question.media} openedAt={openedAt} progressiveRevealEnabled={question.progressiveRevealEnabled} />
      )}

      <ProgressiveRevealPoints question={question} openedAt={openedAt} />
      {question.wagerEnabled && <WagerControl points={question.points} value={wagerPercent} disabled={submitting || timedOut} onChange={setWagerPercent} />}
      {playerWonBuzz && <div className="buzz-result buzz-result--winner"><p className="eyebrow" role="status">You got the buzz!</p><h2 aria-hidden="true">{buzzRemaining} {buzzRemaining === 1 ? 'second' : 'seconds'} to answer</h2><span className="sr-only">Your answer window is open.</span></div>}
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

      {question.type === 'connections' && <PlayerConnectionsAnswer question={question} value={answer?.type === 'connections' ? answer.value : ''} disabled={submitting || timedOut} onChange={value => setAnswer({ type: 'connections', value })} />}
      {question.type === 'ordering' && <PlayerOrderingAnswer key={question.id} items={question.items} value={answer?.type === 'ordering' ? answer.itemIds : null} disabled={submitting || timedOut} onChange={(itemIds) => setAnswer({ type: 'ordering', itemIds })} />}
      {question.type === 'matching' && <PlayerMatchingAnswer key={question.id} leftItems={question.leftItems} rightItems={question.rightItems} pairs={answer?.type === 'matching' ? answer.pairs : []} disabled={submitting || timedOut} onChange={(pairs) => setAnswer({ type: 'matching', pairs })} />}
      {question.type === 'slider' && (
        <PlayerSliderAnswer key={question.id} question={question}
          value={answer?.type === 'slider' ? answer.value : null}
          disabled={submitting || timedOut}
          onChange={(value) => setAnswer({ type: 'slider', value })} />
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
