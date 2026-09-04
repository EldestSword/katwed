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
import { HostCorrectAnswer } from '../features/game/HostCorrectAnswer'
import { HostConnectionsControls } from '../features/game/HostConnectionsControls'
import { createRefreshScheduler, type RefreshScheduler } from '../services/refreshScheduler'
import { liveViewPollInterval } from '../features/game/liveRefreshPolicy'
import { TeamLobby } from '../features/teams/TeamLobby'
import { isTeamGame } from '../features/teams/teams'

type HostAction = 'start' | 'start-round' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close' | 'clue' | 'reset-buzz'

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
  const quizRef = useRef<Quiz | null>(null)
  const schedulerRef = useRef<RefreshScheduler | null>(null)
  const navigate = useNavigate()
  const remaining = useCountdown(state?.questionClosesAt ?? null)
  const buzzRemaining = useCountdown(state?.buzz?.answerDeadlineAt ?? null)
  const configuredPrelude = state?.questionPreludeKind ?? (state?.currentQuestion?.doubleScore ? 'double-score' : null)
  const activePrelude = useQuestionPrelude(configuredPrelude, state?.questionOpenedAt ?? null)

  const refresh = useCallback(() => (
    schedulerRef.current?.request({ immediate: true }) ?? Promise.resolve()
  ), [])

  useEffect(() => {
    const scheduler = createRefreshScheduler(async ({ isCurrent }) => {
      try {
        const bundle = quizRef.current
          ? null
          : await repository.getHostSession(sessionId)
        const nextSession = bundle?.session ?? await repository.getHostLiveSession(sessionId)
        const nextQuiz = bundle?.quiz ?? quizRef.current
        if (!nextSession || !nextQuiz) throw new Error('That game session could not be found.')
        const nextState = await repository.getSafeGameState(nextSession.roomCode)
        if (!isCurrent()) return
        quizRef.current = nextQuiz
        setSession(nextSession)
        setQuiz(nextQuiz)
        setState(nextState)
        setError('')
      } catch (reason) {
        if (isCurrent()) setError(reason instanceof Error ? reason.message : 'The controller could not be refreshed.')
      } finally {
        if (isCurrent()) setLoading(false)
      }
    })
    schedulerRef.current = scheduler
    const unsubscribe = repository.subscribe(sessionId, () => void scheduler.request())
    void scheduler.request({ immediate: true })
    return () => {
      unsubscribe()
      scheduler.dispose()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      quizRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    const poll = window.setInterval(
      () => void schedulerRef.current?.request(),
      liveViewPollInterval('controller', state?.phase),
    )
    return () => window.clearInterval(poll)
  }, [state?.phase])

  const action = useCallback(async (kind: HostAction) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setWorking(true)
    setError('')
    try {
      if (kind === 'clue') await repository.revealConnectionClue(sessionId)
      else if (kind === 'reset-buzz') await repository.resetBuzz(sessionId)
      else await repository.changePhase(sessionId, kind)
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
      eligibleResponderCount: state.currentQuestion?.buzzInEnabled ? (state.buzz ? 1 : 0) : undefined,
    }) && autoLockAttempt.current !== questionId) {
      if (activePrelude) return
      autoLockAttempt.current = questionId
      void action('lock')
    }
  }, [action, activePrelude, remaining, state?.buzz, state?.currentQuestion?.buzzInEnabled, state?.currentQuestion?.id, state?.phase, state?.players.length, state?.questionClosesAt, state?.quizType, state?.sessionSettings?.autoLockWhenAllAnswered, state?.submittedCount])

  if (loading) return <LoadingScreen message="Preparing the game controller…" />
  if (!session || !quiz || !state) {
    return <main className="centred-screen"><Logo /><h1>Game unavailable</h1><p>{error}</p><Link className="button button--primary" to="/host">Back to quizzes</Link></main>
  }

  const question = state.currentQuestion
  const sessionQuestions = orderedSessionQuestions(quiz.questions, session.questionOrder)
  const currentIndex = question ? question.questionNumber - 1 : session.currentQuestionIndex
  const upcoming = sessionQuestions[currentIndex + (state.phase === 'round-intro' ? 0 : 1)]
  const nextRound = Boolean(upcoming && upcoming.roundId !== state.currentRound?.id)
  const currentQuestionDefinition = question
    ? sessionQuestions.find((candidate) => candidate.id === question.id) ?? null
    : null
  const isFinalQuestion = question?.questionNumber === question?.totalQuestions
  const headToHead = state.quizType === 'head-to-head'
  const run = (kind: HostAction) => void action(kind)
  const teamMode = isTeamGame(state)
  const unassigned = teamMode && state.players.some((player) => !player.teamId)
  const buzzWinner = state.buzz ? state.players.find(player => player.id === state.buzz?.winnerPlayerId) : undefined
  const buzzTeam = buzzWinner?.teamId ? state.teams?.find(team => team.id === buzzWinner.teamId) : undefined
  const buzzWinnerAnswered = Boolean(state.buzz && session.hostResponses.some(response => response.questionId === question?.id && response.playerId === state.buzz?.winnerPlayerId))
  const teamAction = async (playerId?: string, teamId?: string) => {
    if (actionInFlight.current) return
    actionInFlight.current = true; setWorking(true); setError('')
    try {
      if (playerId && teamId) await repository.assignPlayerTeam(sessionId, playerId, teamId)
      else await repository.balanceTeams(sessionId)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Teams could not be updated.') }
    finally { actionInFlight.current = false; setWorking(false) }
  }

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
          <div className="controller-panel__heading"><div><p className="eyebrow">Current state</p><h1>{state.phase === 'lobby' ? 'Waiting for players' : state.phase === 'round-intro' ? state.currentRound?.title : state.phase === 'finished' ? 'Quiz complete' : question ? `Question ${question.questionNumber}` : 'Game controller'}</h1></div>{question && <span>{question.questionNumber} / {question.totalQuestions}</span>}</div>
          {state.phase === 'round-intro' && state.currentRound && <p>{state.currentRound.subtitle}<br />Round {state.currentRound.roundNumber} of {state.currentRound.totalRounds} · {state.currentRound.questionCount} {state.currentRound.questionCount === 1 ? 'question' : 'questions'}</p>}
          <dl className="controller-stats">
            <div><dt>Time</dt><dd>{activePrelude === 'double-score' ? 'Double Score' : activePrelude === 'question-type' ? 'Intro' : headToHead ? 'Untimed' : state.phase === 'question' ? `${remaining}s` : '—'}</dd></div>
            <div><dt>Answered</dt><dd>{state.submittedCount} / {question?.buzzInEnabled ? (state.buzz ? 1 : 0) : state.players.length}</dd></div>
            <div><dt>Connected</dt><dd>{state.players.filter((player) => player.connected).length} / {state.players.length}</dd></div>
          </dl>
          <div className="controller-actions" role="group" aria-label="Game controls">
            {!headToHead && state.phase === 'question' && question?.buzzInEnabled && <section className="controller-buzz"><p className="eyebrow" role="status">{state.buzz ? `${buzzWinner?.nickname ?? 'A player'}${buzzTeam ? ` · ${buzzTeam.name}` : ''} buzzed first` : 'Buzzers open'}</p><strong aria-hidden="true">{state.buzz ? (buzzRemaining > 0 ? `Answer window: ${buzzRemaining} seconds` : 'Answer window closed') : 'No winner yet'}</strong><span className="sr-only">{state.buzz ? (buzzRemaining > 0 ? 'Answer window open.' : 'Answer window closed.') : 'No winner yet.'}</span>{state.buzz && !buzzWinnerAnswered && <button className="button button--secondary" disabled={working} type="button" onClick={() => run('reset-buzz')}>Reset buzz</button>}</section>}
            {!headToHead && state.phase === 'question' && question?.type === 'connections' && currentQuestionDefinition?.type === 'connections' && <HostConnectionsControls question={question} definition={currentQuestionDefinition} disabled={working || Boolean(activePrelude) || remaining <= 0} onReveal={() => run('clue')} />}
            {headToHead && <StatusMessage>Head-to-Head progression is controlled by the two competitors. This controller is read-only apart from closing the room.</StatusMessage>}
            {!headToHead && state.phase === 'lobby' && <button className="button button--primary" disabled={working || !state.players.length || unassigned} type="button" onClick={() => run('start')}>Start game</button>}
            {state.phase === 'lobby' && unassigned && <p>Assign every player to a team before starting.</p>}
            {!headToHead && state.phase === 'round-intro' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('start-round')}>Start round</button>}
            {!headToHead && state.phase === 'question' && <button className="button button--primary" disabled={working || Boolean(activePrelude)} type="button" onClick={() => run('lock')}>Close answers now</button>}
            {!headToHead && state.phase === 'locked' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('reveal')}>Reveal answer</button>}
            {!headToHead && state.phase === 'reveal' && !isFinalQuestion && <button className="button button--primary" disabled={working} type="button" onClick={() => run('leaderboard')}>Show leaderboard</button>}
            {!headToHead && state.phase === 'reveal' && isFinalQuestion && <button className="button button--primary" disabled={working} type="button" onClick={() => run('finish')}>Reveal final results</button>}
            {!headToHead && state.phase === 'leaderboard' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('next')}>{nextRound ? 'Next round' : 'Next question'}</button>}
            {!headToHead && ['question', 'locked'].includes(state.phase) && <button className="button button--secondary" disabled={working || Boolean(activePrelude)} type="button" onClick={() => run('finish')}>Finish game</button>}
            {!headToHead && state.phase === 'finished' && <button className="button button--primary" disabled={working} type="button" onClick={() => run('restart')}>Restart quiz</button>}
            <button className="button button--ghost" disabled={working} type="button" onClick={() => {
              if (window.confirm('Close this room for every player?')) run('close')
            }}>Close room</button>
          </div>
          {currentQuestionDefinition && ['question', 'locked', 'reveal'].includes(state.phase) && (
            <HostCorrectAnswer question={currentQuestionDefinition} roster={quiz.roster} />
          )}
          {teamMode && state.phase === 'lobby' && <section aria-label="Manage teams"><h2>Teams</h2><button type="button" className="button button--secondary" disabled={working || !state.players.length} onClick={() => void teamAction()}>Balance teams</button><TeamLobby teams={state.teams ?? []} players={state.players} disabled={working} onAssign={(playerId, teamId) => void teamAction(playerId, teamId)} /></section>}
          {!headToHead && currentQuestionDefinition && state.phase !== 'lobby' && (
            <HostResponseMonitor
              players={session.players}
              teams={teamMode ? state.teams : undefined}
              responses={session.hostResponses}
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
          <HostAudioControls soundPackId={state.soundPackId ?? session.settings.soundPackId} />
          {(headToHead || state.phase === 'lobby') && <section className="controller-monitor">
            <div className="controller-section-heading"><h2>Players</h2><span>{state.players.length}</span></div>
            <ul className="controller-players">{state.players.map((player) => <li key={player.id}>{player.nickname}<span>{player.connected ? 'Connected' : 'Disconnected'}</span></li>)}</ul>
          </section>}
          <section className="controller-up-next">
            <p className="eyebrow">Up next</p>
            <h2>{upcoming ? `Question ${currentIndex + (state.phase === 'round-intro' ? 1 : 2)}` : 'Final results'}</h2>
            <p>{upcoming ? upcoming.prompt : 'The final scoreboard and podium.'}</p>
            {upcoming && <small>{questionTypeRegistry[upcoming.type].name}{upcoming.media.type !== 'none' ? ` · Media: ${upcoming.media.type}` : ''}</small>}
          </section>
        </aside>
      </div>
    </main>
  )
}
