import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Logo } from '../components/AppShell'
import { Leaderboard } from '../components/Leaderboard'
import { LoadingScreen } from '../components/LoadingScreen'
import { QuestionImage } from '../components/QuestionImage'
import { StatusMessage } from '../components/StatusMessage'
import { useCountdown } from '../hooks/useCountdown'
import { repository } from '../services/repository'
import type { GameSession, Quiz, SafeGameState } from '../types/domain'

export function HostGamePage() {
  const sessionId = useParams().sessionId ?? ''
  const [session, setSession] = useState<GameSession | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [safeState, setSafeState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const autoLocking = useRef(false)
  const actionInFlight = useRef(false)
  const navigate = useNavigate()
  const remaining = useCountdown(safeState?.questionClosesAt ?? null)

  const refresh = useCallback(async () => {
    try {
      const bundle = await repository.getHostSession(sessionId)
      if (!bundle) {
        setError('That game session could not be found.')
        return
      }
      setSession(bundle.session)
      setQuiz(bundle.quiz)
      setSafeState(await repository.getSafeGameState(bundle.session.roomCode))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The live game could not be refreshed.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    const unsubscribe = repository.subscribe(sessionId, () => void refresh())
    const poll = window.setInterval(() => void refresh(), 5000)
    return () => {
      unsubscribe()
      window.clearInterval(poll)
    }
  }, [refresh, sessionId])

  const action = useCallback(async (kind: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close') => {
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
    const deadlineReached = safeState?.questionClosesAt
      ? Date.now() >= new Date(safeState.questionClosesAt).getTime()
      : false
    if (safeState?.phase === 'question' && remaining === 0 && deadlineReached && !autoLocking.current) {
      autoLocking.current = true
      void action('lock')
    }
  }, [action, remaining, safeState?.phase, safeState?.questionClosesAt])

  if (loading) return <LoadingScreen message="Preparing the live game…" />
  if (!session || !quiz || !safeState) {
    return <main className="centred-screen"><Logo /><h1>Game unavailable</h1><p>{error}</p><Link className="button button--primary" to="/host">Back to quizzes</Link></main>
  }

  const joinUrl = `${window.location.origin}/join?room=${session.roomCode}`
  const question = safeState.currentQuestion

  async function copyJoinUrl() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('The join link could not be copied. Select it manually instead.')
    }
  }

  return (
    <main className="game-screen host-game">
      <header className="game-bar host-game__bar">
        <Logo />
        <div><span className="muted">{quiz.title}</span><strong>Room {session.roomCode}</strong></div>
        <div className="host-bar-actions">
          <span className={`phase-badge phase-badge--${safeState.phase}`}>{safeState.phase}</span>
          <button className="button button--ghost-light" disabled={working} type="button" onClick={() => {
            if (window.confirm('Close this room for every player?')) void action('close')
          }}>Close room</button>
        </div>
      </header>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      {safeState.phase === 'lobby' && (
        <section className="host-lobby">
          <div className="join-panel">
            <p className="eyebrow">Join at {window.location.host}</p>
            <h1>{session.roomCode}</h1>
            <div className="qr-card"><QRCodeSVG value={joinUrl} size={190} level="M" title="QR code for the Katwed join link" /></div>
            <label htmlFor="join-url">Join link</label>
            <div className="copy-field"><input id="join-url" readOnly value={joinUrl} /><button type="button" onClick={() => void copyJoinUrl()}>{copied ? 'Copied!' : 'Copy'}</button></div>
          </div>
          <div className="lobby-players">
            <div className="section-heading"><div><p className="eyebrow">Lobby</p><h2>{safeState.players.length} {safeState.players.length === 1 ? 'player' : 'players'} joined</h2></div></div>
            <ul className="player-chips" aria-live="polite">
              {safeState.players.map((player) => <li key={player.id}>{player.nickname}<span className={player.connected ? 'online-dot' : 'offline-dot'} aria-label={player.connected ? 'connected' : 'disconnected'} /></li>)}
            </ul>
            {!safeState.players.length && <p className="empty-note">Names will pop up here as players join.</p>}
            <button className="button button--primary button--large" disabled={working || safeState.players.length === 0 || quiz.questions.length === 0} type="button" onClick={() => void action('start')}>
              Start game
            </button>
          </div>
        </section>
      )}

      {safeState.phase === 'question' && question && (
        <section className="host-question">
          <div className="host-question__image">
            <QuestionImage path={question.imagePath} alt="AI-generated merged portrait for the current question." />
          </div>
          <div className="host-question__controls">
            <p className="eyebrow">Question {question.questionNumber} of {question.totalQuestions}</p>
            <div className={`host-timer ${remaining <= 5 ? 'timer--urgent' : ''}`}>{remaining}<small>seconds</small></div>
            <div className="answer-progress">
              <strong>{safeState.submittedCount} / {safeState.players.length}</strong>
              <span>answers submitted</span>
              <progress max={Math.max(1, safeState.players.length)} value={safeState.submittedCount}>{safeState.submittedCount}</progress>
            </div>
            <p>{safeState.players.filter((player) => player.connected).length} players connected</p>
            <button className="button button--primary button--large" disabled={working} type="button" onClick={() => void action('lock')}>Close answers early</button>
          </div>
        </section>
      )}

      {safeState.phase === 'locked' && (
        <section className="game-state-card host-phase-card">
          <div className="big-icon" aria-hidden="true">🔒</div>
          <p className="eyebrow">All choices are sealed</p>
          <h1>Answers locked</h1>
          <p>{safeState.submittedCount} of {safeState.players.length} players submitted. Individual choices remain hidden.</p>
          <button className="button button--primary button--large" disabled={working} type="button" onClick={() => void action('reveal')}>Reveal the pair</button>
        </section>
      )}

      {safeState.phase === 'reveal' && safeState.reveal && (
        <section className="host-reveal">
          <div>
            {question && <QuestionImage path={question.imagePath} alt={`Merged portrait of ${safeState.reveal.correctNames[0]} and ${safeState.reveal.correctNames[1]}.`} />}
          </div>
          <div>
            <p className="eyebrow">The pair revealed</p>
            <h1>{safeState.reveal.correctNames[0]} <span>+</span><br /> {safeState.reveal.correctNames[1]}</h1>
            <p>{safeState.reveal.caption}</p>
            <button className="button button--primary button--large" disabled={working} type="button" onClick={() => void action('leaderboard')}>Show leaderboard</button>
          </div>
        </section>
      )}

      {safeState.phase === 'leaderboard' && (
        <section className="game-state-card host-leaderboard">
          <p className="eyebrow">Scores after question {question?.questionNumber}</p>
          <h1>Leaderboard</h1>
          <Leaderboard entries={safeState.leaderboard} />
          <button className="button button--primary button--large" disabled={working} type="button" onClick={() => void action('next')}>
            {question?.questionNumber === question?.totalQuestions ? 'Finish game' : 'Next question'}
          </button>
        </section>
      )}

      {safeState.phase === 'finished' && (
        <section className="game-state-card host-leaderboard finished-state">
          <p className="eyebrow">The final face has fused</p>
          <h1>Final leaderboard</h1>
          <Leaderboard entries={safeState.leaderboard} />
          <div className="heading-actions">
            <button className="button button--primary" disabled={working} type="button" onClick={() => void action('restart')}>Restart quiz</button>
            <button className="button button--secondary" disabled={working} type="button" onClick={() => {
              if (window.confirm('Close this room for every player?')) void action('close')
            }}>Close room</button>
          </div>
        </section>
      )}
    </main>
  )
}
