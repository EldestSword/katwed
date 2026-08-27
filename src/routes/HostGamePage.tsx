import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { PresentationStage } from '../features/game/PresentationStage'
import { useCountdown } from '../hooks/useCountdown'
import { repository } from '../services/repository'
import type { GameSession, Quiz, SafeGameState } from '../types/domain'
import { questionTypeRegistry } from '../features/questions/registry'
import { useQuestionPrelude } from '../hooks/useQuestionPrelude'
import { shouldAutoLockStandardQuestion } from '../features/game/autoLock'
import { GameBadge } from '../components/design-system/GameBadge'
import { HostAudioControls } from '../components/HostAudioControls'
import { orderedSessionQuestions } from '../features/game/launchSettings'
import { HostResponseMonitor } from '../features/game/HostResponseMonitor'

type HostAction = 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close'

export function HostGamePage() {
  const sessionId = useParams().sessionId ?? ''
  const [session, setSession] = useState<GameSession | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [state, setState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [reviewingAnswerId, setReviewingAnswerId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const actionInFlight = useRef(false)
  const autoLockAttempt = useRef<string | null>(null)
  const navigate = useNavigate()
  const remaining = useCountdown(state?.questionClosesAt ?? null)
  const configuredPrelude = state?.questionPreludeKind ?? (state?.currentQuestion?.doubleScore ? 'double-score' : null)
  const activePrelude = useQuestionPrelude(configuredPrelude, state?.questionOpenedAt ?? null)

  const refresh = useCallback(async () => {
    try {
      const bundle = await repository.getHostSession(sessionId)
      if (!bundle) throw new Error('That game session could not be found.')
      setSession(bundle.session)
      setQuiz(bundle.quiz)
      setState(await repository.getSafeGameState(bundle.session.roomCode))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The controller could not be refreshed.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    const unsubscribe = repository.subscribe(sessionId, () => void refresh())
    const poll = window.setInterval(() => void refresh(), 5000)
    return () => { unsubscribe(); window.clearInterval(poll) }
  }, [refresh, sessionId])

  const action = useCallback(async (kind: HostAction) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setWorking(true)
    setError('')
    try {
      await repository.changePhase(sessionId, kind)
      await refresh()
      if (kind === 'close') await navigate('/host')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The host action failed.')
    } finally {
      actionInFlight.current = false
      setWorking(false)
    }
  }, [navigate, refresh, sessionId])

  const setTypedAnswerOverride = useCallback(async (answerId: string, correctOverride: true | null) => {
    if (reviewingAnswerId) return
    setReviewingAnswerId(answerId)
    setError('')
    try {
      await repository.setTypedAnswerOverride(sessionId, answerId, correctOverride)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That Typed Answer result could not be updated.')
    } finally {
      setReviewingAnswerId(null)
    }
  }, [refresh, reviewingAnswerId, sessionId])

  useEffect(() => {
    const deadlineReached = state?.questionClosesAt
      ? Date.now() >= new Date(state.questionClosesAt).getTime()
      : false
    const questionId = state?.currentQuestion?.id ?? null
    if (state?.phase !== 'question' || !questionId) {
      autoLockAttempt.current = null
      return
    }
    if (shouldAutoLockStandardQuestion({
      quizType: state.quizType,
      phase: state.phase,
      submittedCount: state.submittedCount,
      joinedPlayerCount: state.players.length,
      deadlineReached: remaining === 0 && deadlineReached,
      autoLockWhenAllAnswered: state.sessionSettings?.autoLockWhenAllAnswered ?? true,
    }) && autoLockAttempt.current !== questionId) {
      if (activePrelude) return
      autoLockAttempt.current = questionId
      void action('lock')
    }
  }, [action, activePrelude, remaining, state?.currentQuestion?.id, state?.phase, state?.players.length, state?.questionClosesAt, state?.quizType, state?.sessionSettings?.autoLockWhenAllAnswered, state?.submittedCount])

  if (loading) return <LoadingScreen message="Preparing the game controller…" />
  if (!session || !quiz || !state) {
    return <main className="centred-screen"><Logo /><h1>Game unavailable</h1><p>{error}</p><Link className="button button--primary" to="/host">Back to quizzes</Link></main>
  }

  const question = state.currentQuestion
  const sessionQuestions = orderedSessionQuestions(quiz.questions, session.questionOrder)
  const currentIndex = question ? question.questionNumber - 1 : session.currentQuestionIndex
  const upcoming = sessionQuestions[currentIndex + 1]
  const currentQuestionDefinition = question
    ? sessionQuestions.find((candidate) => candidate.id === question.id) ?? null
    : null
  const isFinalQuestion = question?.questionNumber === question?.totalQuestions
  const headToHead = state.quizType === 'head-to-head'
  const run = (kind: HostAction) => void action(kind)

  return (
    <main className="controller-page">
      <header className="controller-bar">
        <Logo />
        <div><span>{quiz.title}</span><strong>Room <b>{session.roomCode}</b></strong></div>
        <GameBadge tone={state.phase === 'reveal' || state.phase === 'finished' ? 'success' : state.phase === 'locked' ? 'warning' : 'info'} className={`phase-badge phase-badge--${state.phase}`}>{state.phase}</GameBadge>
        <button className="button button--primary" type="button" onClick={() =>
          window.open(`/host/game/${session.id}/present`, 'katwed-presentation', 'noopener')
        }>Open presentation window</button>
      </header>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="controller-grid">
        <section className="controller-preview-wrap" aria-label="Presentation preview">
          <header><span>Presentation preview</span><small>Live output</small></header>
          <div className="controller-preview"><PresentationStage state={state} compact /></div>
        </section>
        <aside className="controller-panel">
          <div className="controller-panel__heading"><div><p className="eyebrow">Current state</p><h1>{state.phase === 'lobby' ? 'Waiting for players' : state.phase === 'finished' ? 'Quiz complete' : question ? `Question ${question.questionNumber}` : 'Game controller'}</h1></div>{question && <span>{question.questionNumber} / {question.totalQuestions}</span>}</div>
          <dl className="controller-stats">
            <div><dt>Time</dt><dd>{activePrelude === 'double-score' ? 'Double Score' : activePrelude === 'question-type' ? 'Intro' : headToHead ? 'Untimed' : state.phase === 'question' ? `${remaining}s` : '—'}</dd></div>
            <div><dt>Answered</dt><dd>{state.submittedCount} / {state.players.length}</dd></div>
            <div><dt>Connected</dt><dd>{state.players.filter((player) => player.connected).length} / {state.players.length}</dd></div>
          </dl>
          {!headToHead && currentQuestionDefinition && state.phase !== 'lobby' && (
            <HostResponseMonitor
              players={session.players}
              answers={session.answers}
              question={currentQuestionDefinition}
              roster={quiz.roster}
              settings={session.settings}
              phase={state.phase}
              preludeActive={Boolean(activePrelude)}
              reviewingAnswerId={reviewingAnswerId}
              onOverride={(answerId, correctOverride) => void setTypedAnswerOverride(answerId, correctOverride)}
            />
          )}
          <div className="controller-actions">
            {headToHead && <StatusMessage>Head-to-Head progression is controlled by the two competitors. This controller is read-only apart from closing the room.</StatusMessage>}
            {!headToHead && state.phase === 'lobby' && <button className="button button--primary" disabled={working || !state.players.length} type="button" onClick={() => run('start')}>Start game</button>}
            {!headToHead && state.phase === 'question' && <button className="button button--primary" disabled={working || Boolean(activePrelude)} type="button" onClick={() => run('lock')}>Close answers now</button>}
            {!headToHead && state.phase === 'locked' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('reveal')}>Reveal answer</button>}
            {!headToHead && state.phase === 'reveal' && !isFinalQuestion && <button className="button button--primary" disabled={working} type="button" onClick={() => run('leaderboard')}>Show leaderboard</button>}
            {!headToHead && state.phase === 'reveal' && isFinalQuestion && <button className="button button--primary" disabled={working} type="button" onClick={() => run('finish')}>Reveal final results</button>}
            {!headToHead && state.phase === 'leaderboard' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('next')}>Next question</button>}
            {!headToHead && ['question', 'locked'].includes(state.phase) && <button className="button button--secondary" disabled={working || Boolean(activePrelude)} type="button" onClick={() => run('finish')}>Finish game</button>}
            {!headToHead && state.phase === 'finished' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('restart')}>Restart quiz</button>}
            <button className="button button--ghost" disabled={working} type="button" onClick={() => {
              if (window.confirm('Close this room for every player?')) run('close')
            }}>Close room</button>
          </div>
          <HostAudioControls soundPackId={state.soundPackId ?? session.settings.soundPackId} />
          {(headToHead || state.phase === 'lobby') && <section className="controller-monitor">
            <div className="controller-section-heading"><h2>Players</h2><span>{state.players.length}</span></div>
            <ul className="controller-players">{state.players.map((player) => <li key={player.id}>{player.nickname}<span>{player.connected ? 'Connected' : 'Disconnected'}</span></li>)}</ul>
          </section>}
          <section className="controller-up-next">
            <p className="eyebrow">Up next</p>
            <h2>{upcoming ? `Question ${currentIndex + 2}` : 'Final results'}</h2>
            <p>{upcoming ? upcoming.prompt : 'The final scoreboard and podium.'}</p>
            {upcoming && <small>{questionTypeRegistry[upcoming.type].name}{upcoming.media.type !== 'none' ? ` · Media: ${upcoming.media.type}` : ''}</small>}
          </section>
        </aside>
      </div>
    </main>
  )
}
