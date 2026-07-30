import { QRCodeSVG } from 'qrcode.react'
import { Leaderboard } from '../../components/Leaderboard'
import { QuestionMedia } from '../../components/QuestionMedia'
import { useCountdown } from '../../hooks/useCountdown'
import type { RevealPayload, SafeGameState, SafeQuestion } from '../../types/domain'
import { Logo } from '../../components/AppShell'

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

function RevealResult({ reveal, question }: { reveal: RevealPayload; question: SafeQuestion }) {
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
      return <><h2>{reveal.correctValue}</h2><p>{reveal.tolerance > 0 ? `Accepted range: ${reveal.correctValue - reveal.tolerance}–${reveal.correctValue + reveal.tolerance}` : 'Exact value required'}</p></>
    case 'pinpoint':
      return <div className="pinpoint-result">
        {reveal.points.map((point, index) => <span key={index} className="pinpoint-response" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />)}
        <span className="pinpoint-target" style={{
          left: `${reveal.targetX * 100}%`,
          top: `${reveal.targetY * 100}%`,
          width: `${reveal.targetRadius * 200}%`,
          aspectRatio: '1',
        }} />
      </div>
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
  const joinUrl = `${window.location.origin}/join?room=${state.roomCode}`
  return (
    <section className={`presentation-stage ${compact ? 'presentation-stage--compact' : ''}`} aria-live="polite">
      {state.phase === 'lobby' && (
        <div className="presentation-lobby">
          <Logo />
          <h1>{state.quizTitle}</h1>
          <p>Join at {window.location.host}</p>
          <strong className="presentation-room-code">{state.roomCode}</strong>
          <QRCodeSVG value={joinUrl} size={compact ? 90 : 220} level="M" title="QR code for joining this Katwed room" />
          <p>{state.players.length} {state.players.length === 1 ? 'player' : 'players'} joined</p>
          <ul>{state.players.slice(0, compact ? 5 : 16).map((player) => <li key={player.id}>{player.nickname}</li>)}</ul>
        </div>
      )}
      {state.phase === 'question' && question && (
        <div className="presentation-question">
          <div className="presentation-question__header"><span>Question {question.questionNumber} of {question.totalQuestions}</span><strong>{remaining}</strong></div>
          <h1>{question.prompt}</h1>
          {question.supportingText && <p>{question.supportingText}</p>}
          {(question.mediaVisibility === 'presentation' || question.mediaVisibility === 'both') && (
            <QuestionMedia media={question.media} openedAt={state.questionOpenedAt} compact={compact} allowEnlarge={false} />
          )}
          <PresentationChoices question={question} phase={state.phase} />
          <p>{state.submittedCount} of {state.players.length} answers submitted</p>
        </div>
      )}
      {state.phase === 'locked' && (
        <div className="presentation-centre"><div className="big-icon" aria-hidden="true">🔒</div><h1>Answers locked</h1><p>The reveal is coming up.</p></div>
      )}
      {state.phase === 'reveal' && state.reveal && question && (
        <div className="presentation-reveal">
          <p className="eyebrow">Correct answer</p>
          {(question.mediaVisibility === 'presentation' || question.mediaVisibility === 'both') && (
            <QuestionMedia media={question.media} openedAt={state.questionOpenedAt} compact={compact} allowEnlarge={false} />
          )}
          <RevealResult reveal={state.reveal} question={question} />
          {state.reveal.caption && <p>{state.reveal.caption}</p>}
        </div>
      )}
      {state.phase === 'leaderboard' && (
        <div className="presentation-leaderboard"><p className="eyebrow">Current standings</p><h1>Leaderboard</h1><Leaderboard entries={state.leaderboard} /></div>
      )}
      {state.phase === 'finished' && (
        <div className="presentation-leaderboard presentation-finished"><p className="eyebrow">Final standings</p><h1>Final leaderboard</h1><Leaderboard entries={state.leaderboard} /></div>
      )}
    </section>
  )
}
