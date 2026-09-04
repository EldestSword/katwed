import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { StatusMessage } from '../components/StatusMessage'
import { repository } from '../services/repository'
import { loadPlayerSession, savePlayerSession } from '../services/playerSession'
import { RepositoryError } from '../services/gameRepository'
import type { JoinResult, RoomJoinInfo } from '../types/domain'

export function JoinPage() {
  const [params] = useSearchParams()
  const [roomCode, setRoomCode] = useState(() => (params.get('room') ?? '').replace(/\D/g, '').slice(0, 6))
  const [nickname, setNickname] = useState('')
  const [teamId, setTeamId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoverableName, setRecoverableName] = useState('')
  const [roomInfo, setRoomInfo] = useState<RoomJoinInfo | null>(null)
  const [checkingRoom, setCheckingRoom] = useState(false)
  const [roomCheckComplete, setRoomCheckComplete] = useState(false)
  const [roomCheckFailed, setRoomCheckFailed] = useState(false)
  const [errorField, setErrorField] = useState<'room' | 'nickname' | 'form' | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    setTeamId('')
    if (roomCode.length !== 6) {
      setRecoverableName('')
      setRoomInfo(null)
      setRoomCheckComplete(false)
      setRoomCheckFailed(false)
      setCheckingRoom(false)
      return
    }
    setRecoverableName(loadPlayerSession(roomCode)?.nickname ?? '')
    let cancelled = false
    setCheckingRoom(true)
    setRoomInfo(null)
    setRoomCheckComplete(false)
    setRoomCheckFailed(false)
    void repository.getRoomJoinInfo(roomCode).then((info) => {
      if (!cancelled) setRoomInfo(info)
    }).catch(() => {
      if (!cancelled) {
        setRoomInfo(null)
        setRoomCheckFailed(true)
      }
    }).finally(() => {
      if (!cancelled) {
        setCheckingRoom(false)
        setRoomCheckComplete(true)
      }
    })
    return () => { cancelled = true }
  }, [roomCode])

  async function storeAndPlay(result: JoinResult) {
    savePlayerSession({
      playerId: result.player.id,
      roomCode,
      nickname: result.player.nickname,
      competitorId: result.player.competitorId ?? null,
      reconnectToken: result.reconnectToken,
    })
    await navigate(`/play/${roomCode}`)
  }

  async function join(event: FormEvent) {
    event.preventDefault()
    if (roomCode.length !== 6) {
      setErrorField('room')
      return setError('Enter a six-digit room code.')
    }
    if (!nickname.trim()) {
      setErrorField('nickname')
      return setError('Enter the nickname your teammates will recognise.')
    }
    if (nickname.trim().length > 30) {
      setErrorField('nickname')
      return setError('Keep your nickname to 30 characters or fewer.')
    }
    setSubmitting(true)
    setError('')
    setErrorField(null)
    try {
      if (roomInfo?.playMode === 'teams' && roomInfo.teamAssignmentMode === 'player-choice' && !teamId) throw new RepositoryError('invalid-selection', 'Choose your team.')
      await storeAndPlay(await repository.joinRoom(roomCode, nickname, teamId || undefined))
    } catch (reason) {
      setErrorField('form')
      if (reason instanceof RepositoryError) setError(reason.message)
      else setError('We could not join the game. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function joinCompetitor(competitorId: string) {
    setSubmitting(true)
    setError('')
    setErrorField(null)
    try {
      await storeAndPlay(await repository.joinHeadToHeadRoom(roomCode, competitorId))
    } catch (reason) {
      setErrorField('form')
      setError(reason instanceof RepositoryError ? reason.message : 'We could not claim that competitor. Try again.')
      setRoomInfo(await repository.getRoomJoinInfo(roomCode).catch(() => null))
    } finally {
      setSubmitting(false)
    }
  }

  async function recover() {
    const saved = loadPlayerSession(roomCode)
    if (!saved) return
    setSubmitting(true)
    try {
      const result = await repository.reconnectPlayer(saved)
      if (!result) {
        setRecoverableName('')
        setErrorField('form')
        setError('That saved player session has expired. Join again.')
        return
      }
      await navigate(`/play/${roomCode}`)
    } catch {
      setErrorField('form')
      setError('We could not restore that player session just now.')
    } finally {
      setSubmitting(false)
    }
  }

  const isHeadToHead = roomInfo?.quizType === 'head-to-head'
  const roomClosed = roomInfo?.status === 'closed'
  const gameStarted = Boolean(roomInfo && roomInfo.status === 'active' && roomInfo.phase !== 'lobby')
  const roomNotFound = roomCode.length === 6 && roomCheckComplete && !roomCheckFailed && !roomInfo
  const roomBlocked = Boolean(roomClosed || gameStarted || roomNotFound)
  const roomStatusId = checkingRoom || roomInfo || roomNotFound || roomCheckFailed ? 'join-room-status' : undefined
  const roomError = errorField === 'room' || roomBlocked
  const nicknameError = errorField === 'nickname'

  return (
    <main className="form-page">
      <div className="form-card">
        <p className="eyebrow">Join the curious crowd</p>
        <h1>Enter your game</h1>
        <p>Ask your host for the six-digit room code.</p>
        {recoverableName && (
          <StatusMessage>
            Welcome back, <strong>{recoverableName}</strong>.{' '}
            <button className="inline-button" type="button" onClick={() => void recover()}>Restore my session</button>
          </StatusMessage>
        )}
        <form onSubmit={(event) => void join(event)} noValidate>
          <label htmlFor="join-room">Room code</label>
          <input id="join-room" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={roomCode} onChange={(event) => { setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); setErrorField(null) }}
            placeholder="123456" aria-invalid={roomError} aria-describedby={[roomStatusId, errorField === 'room' ? 'join-error' : ''].filter(Boolean).join(' ') || undefined} />
          {checkingRoom && <p className="room-check-status" id="join-room-status" role="status"><span aria-hidden="true" />Checking room…</p>}
          {!checkingRoom && roomInfo && !roomBlocked && <div className="room-context" id="join-room-status" role="status"><span>Room found</span><strong>{roomInfo.quizTitle}</strong></div>}
          {!checkingRoom && roomNotFound && <StatusMessage id="join-room-status" tone="error">We could not find an open room with that code. Check the six digits and try again.</StatusMessage>}
          {!checkingRoom && roomClosed && <StatusMessage id="join-room-status" tone="error">This room has closed. Ask the host for a new code.</StatusMessage>}
          {!checkingRoom && gameStarted && <StatusMessage id="join-room-status" tone="error">This game has already started. Ask the host before trying another code.</StatusMessage>}
          {!checkingRoom && roomCheckFailed && <StatusMessage id="join-room-status">Room details are unavailable just now. You can still try joining.</StatusMessage>}
          {isHeadToHead ? (
            <fieldset className="head-to-head-join">
              <legend>Who are you?</legend>
              <p>{roomInfo.quizTitle}</p>
              <div className="head-to-head-join__choices">
                {roomInfo.headToHeadCompetitors.map((competitor) => (
                  <button
                    className="button button--primary"
                    disabled={submitting || competitor.claimed || roomInfo.status !== 'active' || roomInfo.phase !== 'lobby'}
                    key={competitor.competitorId}
                    onClick={() => void joinCompetitor(competitor.competitorId)}
                    type="button"
                  >
                    {competitor.displayName}{competitor.claimed ? ' — joined' : ''}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <>
              <label htmlFor="nickname">Nickname</label>
              <input id="nickname" autoComplete="nickname" maxLength={30} value={nickname}
                onChange={(event) => { setNickname(event.target.value); setError(''); setErrorField(null) }} placeholder="e.g. Quizzy Lizzy"
                aria-invalid={nicknameError} aria-describedby={["nickname-help", errorField === 'nickname' ? 'join-error' : ''].filter(Boolean).join(' ')} />
              <p className="field-help" id="nickname-help">Up to 30 characters.</p>
              {roomInfo?.playMode === 'teams' && roomInfo.teamAssignmentMode === 'player-choice' && <fieldset><legend>Choose your team</legend><div className="team-choice-grid">{roomInfo.teams?.map((team) => <button type="button" key={team.id} aria-pressed={teamId === team.id} disabled={submitting || roomBlocked} onClick={() => setTeamId(team.id)}><strong>{team.name}</strong><span>{team.memberCount} joined</span></button>)}</div></fieldset>}
              <button className="button button--primary button--wide" aria-busy={submitting} disabled={submitting || roomBlocked} type="submit">
                {submitting ? 'Joining…' : 'Join game'}
              </button>
            </>
          )}
          {error && <StatusMessage id="join-error" tone="error">{error}</StatusMessage>}
        </form>
        <Link className="text-link" to="/">← Back home</Link>
      </div>
    </main>
  )
}
