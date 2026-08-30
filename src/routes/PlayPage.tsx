import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Leaderboard } from '../components/Leaderboard'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { PlayerQuestion } from '../features/game/PlayerQuestion'
import { useSafeGameState } from '../hooks/useSafeGameState'
import { repository } from '../services/repository'
import { clearPlayerSession, loadPlayerSession, loadSubmittedAnswer, saveSubmittedAnswer } from '../services/playerSession'
import type { HeadToHeadGameCompetitor, PlayerSession } from '../types/domain'
import { Logo } from '../components/AppShell'
import { QuestionMedia } from '../components/QuestionMedia'
import { PlayerAnswerReveal } from '../features/game/PlayerAnswerReveal'
import { quizThemeSurfaceProps } from '../features/themes/quizThemeSurface'
import { HeadToHeadResults } from '../features/head-to-head/HeadToHeadResults'
import { DoubleScoreIntro } from '../features/game/DoubleScoreIntro'
import { useQuestionPrelude } from '../hooks/useQuestionPrelude'
import { PlayerSubmissionSummary } from '../features/game/PlayerSubmissionSummary'
import { FinalResults, HeadToHeadFinal } from '../features/game/FinalResults'
import { QuestionTypeIntro } from '../features/game/QuestionTypeIntro'
import { questionTypeRegistry } from '../features/questions/registry'

export function PlayPage() {
  const roomCode = (useParams().roomCode ?? '').replace(/\D/g, '')
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(() => loadPlayerSession(roomCode))
  const [reconnecting, setReconnecting] = useState(Boolean(playerSession))
  const [reconnectError, setReconnectError] = useState('')
  const [working, setWorking] = useState(false)
  const [localResolution, setLocalResolution] = useState<{ questionId: string; status: 'answered' | 'skipped' } | null>(null)
  const { state, loading, error, refresh } = useSafeGameState(roomCode)

  useEffect(() => {
    const saved = loadPlayerSession(roomCode)
    if (!saved) { setReconnecting(false); return }
    void repository.reconnectPlayer(saved).then((result) => {
      if (!result) {
        clearPlayerSession(roomCode)
        setPlayerSession(null)
        setReconnectError('Your saved player session has expired.')
      } else setPlayerSession({ ...saved, competitorId: result.player.competitorId ?? null })
    }).catch(() => setReconnectError('Connection lost. We’ll keep trying when the game updates.'))
      .finally(() => setReconnecting(false))
  }, [roomCode])

  const currentPlayer = useMemo(
    () => state?.players.find((player) => player.id === playerSession?.playerId),
    [playerSession?.playerId, state?.players],
  )
  const currentPlayerId = currentPlayer?.id
  const configuredPrelude = state?.questionPreludeKind ?? (state?.currentQuestion?.doubleScore ? 'double-score' : null)
  const activePrelude = useQuestionPrelude(configuredPrelude, state?.questionOpenedAt ?? null)

  useEffect(() => {
    if (!playerSession || !currentPlayerId) return
    const updatePresence = (connected: boolean): void => {
      void repository.setPlayerPresence(playerSession, connected).catch(() => undefined)
    }
    updatePresence(true)
    const heartbeat = window.setInterval(() => updatePresence(true), 15_000)
    const disconnect = (): void => updatePresence(false)
    window.addEventListener('pagehide', disconnect)
    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('pagehide', disconnect)
      disconnect()
    }
  }, [currentPlayerId, playerSession])

  if (loading || reconnecting) return <LoadingScreen message="Rejoining the room…" />
  if (!state || state.status === 'closed') {
    const roomClosed = state?.status === 'closed'
    return <main className="centred-screen recovery-screen"><Logo /><p className="eyebrow">Game unavailable</p><h1>{roomClosed ? 'This room has closed' : 'Room not found'}</h1><p>{roomClosed ? 'The host has ended this game. Ask them for a new room code to play again.' : 'Check the six-digit code and try again.'}</p><Link className="button button--primary" to="/join">Try another code</Link></main>
  }
  if (!playerSession || !currentPlayer) {
    return <main className="centred-screen recovery-screen"><Logo /><p className="eyebrow">Player identity needed</p><h1>Join this room first</h1><p>{reconnectError || 'Enter your nickname so Katwed knows who is playing.'}</p><Link className="button button--primary" to={`/join?room=${roomCode}`}>Join room {roomCode}</Link></main>
  }

  const question = state.currentQuestion
  const headToHead = state.quizType === 'head-to-head'
  const competitors = state.headToHeadCompetitors ?? []
  const currentCompetitor = competitors.find((competitor) => competitor.competitorId === currentPlayer.competitorId)
  const assigned = headToHead && question?.assignedCompetitorId === currentPlayer.competitorId
  const serverResolution = state.headToHeadResolutions?.find((candidate) => candidate.playerId === currentPlayer.id)
  const resolution = serverResolution ?? (question && localResolution?.questionId === question.id
    ? { playerId: currentPlayer.id, competitorId: currentPlayer.competitorId ?? '', status: localResolution.status }
    : undefined)
  const submittedAnswer = question ? loadSubmittedAnswer(playerSession.playerId, question.id, state.questionOpenedAt) : null

  const runPlayerAction = (operation: () => Promise<void>, fallback: string, onSuccess?: () => void) => {
    setWorking(true)
    setReconnectError('')
    void operation().then(() => { onSuccess?.(); return refresh() }).catch((reason: unknown) => {
      setReconnectError(reason instanceof Error ? reason.message : fallback)
    }).finally(() => setWorking(false))
  }

  return (
    <main className="game-screen player-game quiz-themed-surface" {...quizThemeSurfaceProps(state.themeId, state.backgroundId)}>
      <header className="game-bar"><Logo /><div><span className="muted">Room</span><strong>{roomCode}</strong></div><div><span className="muted">Playing as</span><strong>{currentPlayer.nickname}</strong></div></header>
      {(error || reconnectError) && <StatusMessage tone="error">{error || reconnectError}</StatusMessage>}

      {state.phase === 'lobby' && (headToHead ? (
        <section className="game-state-card lobby-state head-to-head-lobby" aria-live="polite">
          <p className="eyebrow">Head to Head</p><h1>{state.quizTitle}</h1>
          <HeadToHeadScoreboard competitors={competitors} lobby />
          <p>You are playing as <strong>{currentCompetitor?.displayName ?? currentPlayer.nickname}</strong>.</p>
          <button className="button button--primary" disabled={working || competitors.some((competitor) => !competitor.claimed)} type="button" onClick={() => runPlayerAction(
            () => repository.startHeadToHead(roomCode, currentPlayer.id, playerSession.reconnectToken), 'The game could not start.',
          )}>{working ? 'Starting…' : 'Start game'}</button>
          {competitors.some((competitor) => !competitor.claimed) && <p>Both competitors must join before starting.</p>}
        </section>
      ) : (
        <section className="game-state-card lobby-state" aria-live="polite"><div className="bobble" aria-hidden="true">?</div><p className="eyebrow">{state.quizTitle}</p><h1>You’re in, {currentPlayer.nickname}!</h1><p>Waiting for the host to start.</p><strong>{state.players.length} {state.players.length === 1 ? 'player' : 'players'} in the lobby</strong></section>
      ))}

      {state.phase === 'question' && question && activePrelude === 'double-score' && <DoubleScoreIntro questionTypeLabel={state.sessionSettings?.questionTypeIntrosEnabled ? questionTypeRegistry[question.type].introLabel : undefined} />}
      {state.phase === 'question' && question && activePrelude === 'question-type' && <QuestionTypeIntro type={question.type} />}
      {state.phase === 'question' && question && !activePrelude && (resolution && !submittedAnswer ? (
        <section className="player-waiting" aria-live="polite"><div className="player-waiting__status"><span className="waiting-tick" aria-hidden="true">✓</span><div><p className="eyebrow">Head-to-Head</p><h2>{resolution.status === 'skipped' ? 'Question skipped' : 'Answer locked'}</h2></div></div><p className="player-waiting__next">Waiting for the other competitor…</p></section>
      ) : (
        <>
          {headToHead && <section className={`head-to-head-assignment ${assigned ? 'is-assigned' : 'is-play-along'}`}>
            <p className="eyebrow">{assigned ? 'Your question' : `${competitors.find((competitor) => competitor.competitorId === question.assignedCompetitorId)?.displayName ?? 'Opponent'}’s question`}</p>
            <strong>{assigned ? '1 point for a correct answer' : 'Play along — correct answers score 0 points'}</strong>
          </section>}
          <PlayerQuestion question={question} roster={state.roster} closesAt={headToHead ? null : state.questionClosesAt}
            answerPaletteId={state.answerPaletteId} customAnswerColours={state.customAnswerColours}
            openedAt={state.questionOpenedAt} initialAnswer={submittedAnswer}
            modeLabel={headToHead ? `Question ${question.questionNumber} of ${question.totalQuestions} · Untimed` : undefined}
            onSubmit={async (payload) => {
              await repository.submitAnswer(roomCode, playerSession.playerId, playerSession.reconnectToken, payload)
              saveSubmittedAnswer(playerSession.playerId, question.id, state.questionOpenedAt, payload)
              setLocalResolution({ questionId: question.id, status: 'answered' })
              await refresh()
            }} />
          {headToHead && !assigned && !resolution && !submittedAnswer && <button className="button button--ghost button--wide head-to-head-skip" disabled={working} type="button" onClick={() => runPlayerAction(
            () => repository.skipHeadToHead(roomCode, currentPlayer.id, playerSession.reconnectToken, question.id), 'The question could not be skipped.',
            () => setLocalResolution({ questionId: question.id, status: 'skipped' }),
          )}>{working ? 'Skipping…' : 'Skip play-along'}</button>}
        </>
      ))}

      {state.phase === 'locked' && <section className="game-state-card player-locked-state" aria-live="polite"><div className="player-waiting__status"><span className="waiting-tick" aria-hidden="true">✓</span><div><p className="eyebrow">Submitted</p><h1>Answer locked</h1></div></div>{question && submittedAnswer && <PlayerSubmissionSummary answer={submittedAnswer} question={question} roster={state.roster} answerPaletteId={state.answerPaletteId} customAnswerColours={state.customAnswerColours} />}<p className="player-waiting__next">Waiting for the reveal…</p></section>}
      {state.phase === 'reveal' && state.reveal && question && (
        <section className="reveal-state" aria-live="polite"><p className="eyebrow">Correct answer</p>
          <PlayerAnswerReveal reveal={state.reveal} question={question} submittedAnswer={submittedAnswer} playerId={currentPlayer.id}
            roster={state.roster} answerPaletteId={state.answerPaletteId} customAnswerColours={state.customAnswerColours} />
          {question.type !== 'pinpoint' && question.mediaVisibility !== 'presentation' && <QuestionMedia media={question.media} openedAt={state.questionOpenedAt} />}
          {state.reveal.caption && <p>{state.reveal.caption}</p>}
          {headToHead ? <>
            <HeadToHeadResults competitors={competitors} results={state.headToHeadResults ?? []} />
            <HeadToHeadScoreboard competitors={competitors} />
            <button className="button button--primary button--wide" disabled={working} type="button" onClick={() => runPlayerAction(
              () => repository.continueHeadToHead(roomCode, currentPlayer.id, playerSession.reconnectToken, question.id), 'The game could not continue.',
            )}>{question.questionNumber === question.totalQuestions ? 'Show final result' : 'Continue'}</button>
          </> : question.questionNumber === question.totalQuestions && <p className="final-results-wait">Waiting for the host to reveal the final results.</p>}
        </section>
      )}
      {state.phase === 'leaderboard' && <section className="game-state-card"><p className="eyebrow">How everybody stands</p><h1>Leaderboard</h1><Leaderboard entries={state.leaderboard} currentPlayerId={currentPlayer.id} /><p>Waiting for the next question…</p></section>}
      {state.phase === 'finished' && <section className="game-state-card finished-state">{headToHead ? <HeadToHeadFinal competitors={competitors} variant="player" /> : <FinalResults entries={state.leaderboard} currentPlayerId={currentPlayer.id} variant="player" />}<Link className="button button--secondary" to="/">Leave game</Link></section>}
    </main>
  )
}

function HeadToHeadScoreboard({ competitors, lobby = false }: { competitors: HeadToHeadGameCompetitor[]; lobby?: boolean }) {
  return <div className="head-to-head-scoreboard">{(competitors ?? []).map((competitor) => <div key={competitor.competitorId}><strong>{competitor.displayName}</strong><span>{lobby ? (competitor.claimed ? (competitor.connected ? 'Ready' : 'Joined') : 'Waiting to join') : competitor.totalScore}</span></div>)}</div>
}
