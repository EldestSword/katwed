import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Leaderboard } from '../components/Leaderboard'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusMessage } from '../components/StatusMessage'
import { PlayerQuestion } from '../features/game/PlayerQuestion'
import { useSafeGameState } from '../hooks/useSafeGameState'
import { repository } from '../services/repository'
import {
  clearPlayerSession,
  loadPlayerSession,
  loadSubmittedAnswer,
  saveSubmittedAnswer,
} from '../services/playerSession'
import type { PlayerSession, RevealPayload } from '../types/domain'
import { Logo } from '../components/AppShell'
import { QuestionMedia } from '../components/QuestionMedia'

function revealText(reveal: RevealPayload): string {
  switch (reveal.type) {
    case 'single-choice': return 'The correct option is on the shared presentation.'
    case 'multiple-select': return 'The complete correct set is on the shared presentation.'
    case 'true-false': return reveal.correctValue ? 'True' : 'False'
    case 'slider': return reveal.tolerance ? `${reveal.correctValue} (±${reveal.tolerance})` : String(reveal.correctValue)
    case 'pinpoint': return 'The target area is now revealed.'
    case 'mashup': return `${reveal.correctNames[0]} + ${reveal.correctNames[1]}`
  }
}

export function PlayPage() {
  const roomCode = (useParams().roomCode ?? '').replace(/\D/g, '')
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(() => loadPlayerSession(roomCode))
  const [reconnecting, setReconnecting] = useState(Boolean(playerSession))
  const [reconnectError, setReconnectError] = useState('')
  const { state, loading, error } = useSafeGameState(roomCode)

  useEffect(() => {
    const saved = loadPlayerSession(roomCode)
    if (!saved) { setReconnecting(false); return }
    void repository.reconnectPlayer(saved).then((result) => {
      if (!result) {
        clearPlayerSession(roomCode)
        setPlayerSession(null)
        setReconnectError('Your saved player session has expired.')
      } else setPlayerSession(saved)
    }).catch(() => setReconnectError('Connection lost. We’ll keep trying when the game updates.'))
      .finally(() => setReconnecting(false))
  }, [roomCode])

  const currentPlayer = useMemo(
    () => state?.players.find((player) => player.id === playerSession?.playerId),
    [playerSession?.playerId, state?.players],
  )
  const currentPlayerId = currentPlayer?.id

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
    return <main className="centred-screen"><Logo /><h1>{state?.status === 'closed' ? 'This room has closed' : 'Room not found'}</h1><p>The code may be wrong or the game may have expired.</p><Link className="button button--primary" to="/join">Try another code</Link></main>
  }
  if (!playerSession || !currentPlayer) {
    return <main className="centred-screen"><Logo /><h1>Join this room first</h1><p>{reconnectError || 'We need your nickname before you can play.'}</p><Link className="button button--primary" to={`/join?room=${roomCode}`}>Join room {roomCode}</Link></main>
  }

  const question = state.currentQuestion
  const submittedAnswer = question
    ? loadSubmittedAnswer(playerSession.playerId, question.id, state.questionOpenedAt)
    : null

  return (
    <main className="game-screen player-game">
      <header className="game-bar"><Logo /><div><span className="muted">Room</span><strong>{roomCode}</strong></div><div><span className="muted">Playing as</span><strong>{currentPlayer.nickname}</strong></div></header>
      {error && <StatusMessage tone="error">Connection lost: {error}</StatusMessage>}
      {state.phase === 'lobby' && (
        <section className="game-state-card lobby-state" aria-live="polite"><div className="bobble" aria-hidden="true">?</div><p className="eyebrow">{state.quizTitle}</p><h1>You’re in, {currentPlayer.nickname}!</h1><p>Waiting for the host to start.</p><strong>{state.players.length} {state.players.length === 1 ? 'player' : 'players'} in the lobby</strong></section>
      )}
      {state.phase === 'question' && question && (
        <PlayerQuestion question={question} roster={state.roster} closesAt={state.questionClosesAt}
          openedAt={state.questionOpenedAt} initialAnswer={submittedAnswer}
          onSubmit={async (payload) => {
            await repository.submitAnswer(roomCode, playerSession.playerId, playerSession.reconnectToken, payload)
            saveSubmittedAnswer(playerSession.playerId, question.id, state.questionOpenedAt, payload)
          }} />
      )}
      {state.phase === 'locked' && <section className="game-state-card" aria-live="polite"><div className="big-icon" aria-hidden="true">🔒</div><h1>Answers locked</h1><p>The host is about to reveal the answer.</p></section>}
      {state.phase === 'reveal' && state.reveal && (
        <section className="reveal-state" aria-live="polite"><p className="eyebrow">Correct answer</p><h1>{revealText(state.reveal)}</h1>
          {question && question.mediaVisibility !== 'presentation' && <QuestionMedia media={question.media} openedAt={state.questionOpenedAt} />}
          {state.reveal.caption && <p>{state.reveal.caption}</p>}<p className="score-pill">Your score: {currentPlayer.totalScore}</p></section>
      )}
      {state.phase === 'leaderboard' && <section className="game-state-card"><p className="eyebrow">How everybody stands</p><h1>Leaderboard</h1><Leaderboard entries={state.leaderboard} currentPlayerId={currentPlayer.id} /><p>Waiting for the next question…</p></section>}
      {state.phase === 'finished' && <section className="game-state-card finished-state"><p className="eyebrow">Quiz complete</p><h1>Final scores</h1><Leaderboard entries={state.leaderboard} currentPlayerId={currentPlayer.id} /><Link className="button button--secondary" to="/">Leave game</Link></section>}
    </main>
  )
}
