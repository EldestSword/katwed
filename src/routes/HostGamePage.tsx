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
import { useDoubleScoreIntro } from '../hooks/useDoubleScoreIntro'

type HostAction = 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close'

export function HostGamePage() {
  const sessionId = useParams().sessionId ?? ''
  const [session, setSession] = useState<GameSession | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [state, setState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const actionInFlight = useRef(false)
  const autoLocking = useRef(false)
  const navigate = useNavigate()
  const remaining = useCountdown(state?.questionClosesAt ?? null)
  const doubleScoreIntro = useDoubleScoreIntro(state?.quizType, state?.currentQuestion ?? null, state?.questionOpenedAt ?? null)

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
      if (kind === 'lock') autoLocking.current = false
    }
  }, [navigate, refresh, sessionId])

  useEffect(() => {
    const deadlineReached = state?.questionClosesAt
      ? Date.now() >= new Date(state.questionClosesAt).getTime()
      : false
    if (state?.phase === 'question' && remaining === 0 && deadlineReached && !autoLocking.current) {
      autoLocking.current = true
      void action('lock')
    }
  }, [action, remaining, state?.phase, state?.questionClosesAt])

  if (loading) return <LoadingScreen message="Preparing the game controller…" />
  if (!session || !quiz || !state) {
    return <main className="centred-screen"><Logo /><h1>Game unavailable</h1><p>{error}</p><Link className="button button--primary" to="/host">Back to quizzes</Link></main>
  }

  const question = state.currentQuestion
  const currentIndex = question ? question.questionNumber - 1 : session.currentQuestionIndex
  const upcoming = quiz.questions[currentIndex + 1]
  const isFinalQuestion = question?.questionNumber === question?.totalQuestions
  const headToHead = state.quizType === 'head-to-head'
  const run = (kind: HostAction) => void action(kind)

  return (
    <main className="controller-page">
      <header className="controller-bar">
        <Logo />
        <div><span>{quiz.title}</span><strong>Room {session.roomCode}</strong></div>
        <span className={`phase-badge phase-badge--${state.phase}`}>{state.phase}</span>
        <button className="button button--primary" type="button" onClick={() =>
          window.open(`/host/game/${session.id}/present`, 'katwed-presentation', 'noopener')
        }>Open presentation window</button>
      </header>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <div className="controller-grid">
        <section className="controller-preview" aria-label="Presentation preview">
          <PresentationStage state={state} compact />
        </section>
        <aside className="controller-panel">
          <h1>Game controller</h1>
          <dl className="controller-stats">
            <div><dt>Phase</dt><dd>{state.phase}</dd></div>
            <div><dt>Question</dt><dd>{question ? `${question.questionNumber} / ${question.totalQuestions}` : 'Not started'}</dd></div>
            <div><dt>Type</dt><dd>{question ? questionTypeRegistry[question.type].name : '—'}</dd></div>
            <div><dt>Time</dt><dd>{headToHead ? 'Untimed' : doubleScoreIntro ? 'Double Score intro' : state.phase === 'question' ? `${remaining}s` : '—'}</dd></div>
            <div><dt>Connected</dt><dd>{state.players.filter((player) => player.connected).length} / {state.players.length}</dd></div>
            <div><dt>Submitted</dt><dd>{state.submittedCount} / {state.players.length}</dd></div>
          </dl>
          <div className="controller-actions">
            {headToHead && <StatusMessage>Head-to-Head progression is controlled by the two competitors. This controller is read-only apart from closing the room.</StatusMessage>}
            {!headToHead && state.phase === 'lobby' && <button className="button button--primary" disabled={working || !state.players.length} type="button" onClick={() => run('start')}>Start game</button>}
            {!headToHead && state.phase === 'question' && <button className="button button--primary" disabled={working || doubleScoreIntro} type="button" onClick={() => run('lock')}>Close answers early</button>}
            {!headToHead && state.phase === 'locked' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('reveal')}>Reveal answer</button>}
            {!headToHead && state.phase === 'reveal' && !isFinalQuestion && <button className="button button--primary" disabled={working} type="button" onClick={() => run('leaderboard')}>Show leaderboard</button>}
            {!headToHead && state.phase === 'reveal' && isFinalQuestion && <button className="button button--primary" disabled={working} type="button" onClick={() => run('finish')}>Reveal final results</button>}
            {!headToHead && state.phase === 'leaderboard' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('next')}>Next question</button>}
            {!headToHead && ['question', 'locked'].includes(state.phase) && <button className="button button--secondary" disabled={working || doubleScoreIntro} type="button" onClick={() => run('finish')}>Finish game</button>}
            {!headToHead && state.phase === 'finished' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('restart')}>Restart quiz</button>}
            <button className="button button--ghost" disabled={working} type="button" onClick={() => {
              if (window.confirm('Close this room for every player?')) run('close')
            }}>Close room</button>
          </div>
          <section>
            <h2>Players</h2>
            <ul className="controller-players">{state.players.map((player) => <li key={player.id}>{player.nickname}<span>{player.connected ? 'Connected' : 'Disconnected'}</span></li>)}</ul>
          </section>
          <section>
            <h2>Up next</h2>
            <p>{upcoming ? `${questionTypeRegistry[upcoming.type].name}: ${upcoming.prompt}` : 'Final leaderboard'}</p>
            {upcoming && upcoming.media.type !== 'none' && <small>Media: {upcoming.media.type}</small>}
          </section>
        </aside>
      </div>
    </main>
  )
}
