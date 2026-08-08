import { QRCodeSVG } from 'qrcode.react'
import { Leaderboard } from '../../components/Leaderboard'
import { QuestionMedia } from '../../components/QuestionMedia'
import { useCountdown } from '../../hooks/useCountdown'
import type { RevealPayload, SafeGameState, SafeQuestion } from '../../types/domain'
import { Logo } from '../../components/AppShell'
import { PinpointSurface } from './PinpointSurface'
import { formatSliderValue } from './revealFormatting'
import { quizBackgroundSurfaceProps } from '../themes/quizBackgroundSurface'
import { HeadToHeadResults } from '../head-to-head/HeadToHeadResults'

function choicesVisible(question: SafeQuestion, phase: SafeGameState['phase']): boolean {
  return question.presentationChoiceVisibility === 'show' ||
    (question.presentationChoiceVisibility === 'after-lock' && phase !== 'question')
}

function PresentationChoices({ question, phase }: { question: SafeQuestion; phase: SafeGameState['phase'] }) {
  if (!choicesVisible(question, phase)) return null
  if (question.type === 'single-choice' || question.type === 'multiple-select') {
    return <div className="presentation-options">{question.options.map((option) => <div key={option.id}>{option.label}</div>)}</div>
  }
  if (question.type === 'true-false') {
    return <div className="presentation-options"><div>True</div><div>False</div></div>
  }
  return null
}

function RevealResult({
  reveal,
  question,
  compact,
}: {
  reveal: RevealPayload
  question: SafeQuestion
  compact: boolean
}) {
  switch (reveal.type) {
    case 'single-choice': {
      const option = question.type === 'single-choice'
        ? question.options.find((candidate) => candidate.id === reveal.correctOptionId)
        : null
      return <><h2>{option?.label ?? 'Correct option'}</h2><div className="result-bars">{question.type === 'single-choice' && question.options.map((candidate) =>
        <div key={candidate.id}><span>{candidate.label}</span><strong>{reveal.optionCounts[candidate.id] ?? 0}</strong></div>)}</div></>
    }
    case 'multiple-select':
      return <><h2>{question.type === 'multiple-select'
        ? question.options.filter((option) => reveal.correctOptionIds.includes(option.id)).map((option) => option.label).join(' + ')
        : 'Correct set'}</h2></>
    case 'true-false':
      return <><h2>{reveal.correctValue ? 'True' : 'False'}</h2><p>{reveal.counts.true} True · {reveal.counts.false} False</p></>
    case 'slider':
      return question.type === 'slider'
        ? <><h2>{formatSliderValue(reveal.correctValue, question)}</h2><p>{reveal.tolerance > 0
          ? `Accepted range: ${formatSliderValue(reveal.correctValue - reveal.tolerance, question)}–${formatSliderValue(reveal.correctValue + reveal.tolerance, question)}`
          : 'Exact value required'}</p></>
        : <h2>{reveal.correctValue}</h2>
    case 'pinpoint': {
      if (question.type !== 'pinpoint') return null
      return (
        <div className="presentation-pinpoint-reveal">
          <h2>The correct target area is highlighted on the image.</h2>
          <PinpointSurface
            path={question.media.path}
            alt={question.media.altText}
            mode="presentation-reveal"
            markers={reveal.points.map((point) => ({ ...point, kind: 'response' as const, label: 'Player answer' }))}
            target={{ x: reveal.targetX, y: reveal.targetY, radius: reveal.targetRadius }}
            allowEnlarge={!compact}
          />
          <div className="pinpoint-legend" aria-label="Pinpoint answer legend">
            <span><i className="pinpoint-key pinpoint-key--response" />Player answers</span>
            <span><i className="pinpoint-key pinpoint-key--target" />Correct area</span>
          </div>
          <p className="sr-only">The correct target location has been displayed.</p>
        </div>
      )
    }
    case 'typed-answer':
      return <h2>{reveal.correctAnswer}</h2>
    case 'mashup':
      return <h2>{reveal.correctNames[0]} <span>+</span> {reveal.correctNames[1]}</h2>
  }
}

export function PresentationStage({
  state,
  compact = false,
}: {
  state: SafeGameState
  compact?: boolean
}) {
  const remaining = useCountdown(state.questionClosesAt)
  const question = state.currentQuestion
  const headToHead = state.quizType === 'head-to-head'
  const competitors = state.headToHeadCompetitors ?? []
  const joinUrl = `${window.location.origin}/join?room=${state.roomCode}`
  return (
    <section
      className={`presentation-stage quiz-themed-surface ${compact ? 'presentation-stage--compact' : ''}`}
      data-quiz-theme={state.themeId}
      {...quizBackgroundSurfaceProps(state.backgroundId, state.themeId)}
      aria-live="polite"
    >
      {state.phase === 'lobby' && (
        <div className="presentation-lobby">
          <Logo />
          <h1>{state.quizTitle}</h1>
          <p>Join at {window.location.host}</p>
          <strong className="presentation-room-code">{state.roomCode}</strong>
          <div className="presentation-qr-panel">
            <QRCodeSVG
              value={joinUrl}
              size={compact ? 90 : 220}
              level="M"
              bgColor="#ffffff"
              fgColor="#111827"
              title="QR code for joining this Katwed room"
            />
          </div>
          {headToHead ? <div className="head-to-head-scoreboard">{competitors.map((competitor) => <div key={competitor.competitorId}><strong>{competitor.displayName}</strong><span>{competitor.claimed ? (competitor.connected ? 'Ready' : 'Joined') : 'Waiting to join'}</span></div>)}</div> : <>
            <p>{state.players.length} {state.players.length === 1 ? 'player' : 'players'} joined</p>
            <ul>{state.players.slice(0, compact ? 5 : 16).map((player) => <li key={player.id}>{player.nickname}</li>)}</ul>
          </>}
        </div>
      )}
      {state.phase === 'question' && question && (
        <div className="presentation-question">
          <div className="presentation-question__header"><span>Question {question.questionNumber} of {question.totalQuestions}</span>{headToHead ? <strong>Untimed</strong> : <strong>{remaining}</strong>}</div>
          {headToHead && <p className="head-to-head-presentation-assignment">For <strong>{competitors.find((competitor) => competitor.competitorId === question.assignedCompetitorId)?.displayName}</strong> · 1 point</p>}
          <h1>{question.prompt}</h1>
          {question.supportingText && <p>{question.supportingText}</p>}
          {(question.mediaVisibility === 'presentation' || question.mediaVisibility === 'both') && (
            <QuestionMedia media={question.media} openedAt={state.questionOpenedAt} compact={compact} allowEnlarge={false} />
          )}
          <PresentationChoices question={question} phase={state.phase} />
          <p>{state.submittedCount} of {state.players.length} {headToHead ? 'responses resolved' : 'answers submitted'}</p>
        </div>
      )}
      {state.phase === 'locked' && (
        <div className="presentation-centre"><div className="big-icon" aria-hidden="true">🔒</div><h1>Answers locked</h1><p>The reveal is coming up.</p></div>
      )}
      {state.phase === 'reveal' && state.reveal && question && (
        <div className="presentation-reveal">
          <p className="eyebrow">Correct answer</p>
          {question.type !== 'pinpoint' && (question.mediaVisibility === 'presentation' || question.mediaVisibility === 'both') && (
            <QuestionMedia media={question.media} openedAt={state.questionOpenedAt} compact={compact} allowEnlarge={false} />
          )}
          <RevealResult reveal={state.reveal} question={question} compact={compact} />
          {state.reveal.caption && <p>{state.reveal.caption}</p>}
          {headToHead && <><HeadToHeadResults competitors={competitors} results={state.headToHeadResults ?? []} /><div className="head-to-head-scoreboard">{competitors.map((competitor) => <div key={competitor.competitorId}><strong>{competitor.displayName}</strong><span>{competitor.totalScore}</span></div>)}</div></>}
        </div>
      )}
      {state.phase === 'leaderboard' && (
        <div className="presentation-leaderboard"><p className="eyebrow">Current standings</p><h1>Leaderboard</h1><Leaderboard entries={state.leaderboard} variant="presentation" /></div>
      )}
      {state.phase === 'finished' && (headToHead ? (
        <div className="presentation-leaderboard presentation-finished"><p className="eyebrow">Head-to-Head complete</p><h1>{competitors[0]?.totalScore === competitors[1]?.totalScore ? 'It’s a draw!' : `${[...competitors].sort((a, b) => b.totalScore - a.totalScore)[0]?.displayName} wins!`}</h1><div className="head-to-head-scoreboard">{competitors.map((competitor) => <div key={competitor.competitorId}><strong>{competitor.displayName}</strong><span>{competitor.totalScore}</span></div>)}</div></div>
      ) : (
        <div className="presentation-leaderboard presentation-finished"><p className="eyebrow">Final standings</p><h1>Final leaderboard</h1><Leaderboard entries={state.leaderboard} variant="presentation" /></div>
      ))}
    </section>
  )
}
