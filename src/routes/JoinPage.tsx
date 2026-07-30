import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { StatusMessage } from '../components/StatusMessage'
import { repository } from '../services/repository'
import { loadPlayerSession, savePlayerSession } from '../services/playerSession'
import { RepositoryError } from '../services/gameRepository'

export function JoinPage() {
  const [params] = useSearchParams()
  const [roomCode, setRoomCode] = useState(() => (params.get('room') ?? '').replace(/\D/g, '').slice(0, 6))
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoverableName, setRecoverableName] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (roomCode.length === 6) setRecoverableName(loadPlayerSession(roomCode)?.nickname ?? '')
    else setRecoverableName('')
  }, [roomCode])

  async function join(event: FormEvent) {
    event.preventDefault()
    if (roomCode.length !== 6) return setError('Enter a six-digit room code.')
    if (!nickname.trim()) return setError('Enter the nickname your teammates will recognise.')
    if (nickname.trim().length > 30) return setError('Keep your nickname to 30 characters or fewer.')
    setSubmitting(true)
    setError('')
    try {
      const result = await repository.joinRoom(roomCode, nickname)
      savePlayerSession({
        playerId: result.player.id,
        roomCode,
        nickname: result.player.nickname,
        reconnectToken: result.reconnectToken,
      })
      await navigate(`/play/${roomCode}`)
    } catch (reason) {
      if (reason instanceof RepositoryError) setError(reason.message)
      else setError('We could not join the game. Check your connection and try again.')
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
        setError('That saved player session has expired. Join again with a nickname.')
        return
      }
      await navigate(`/play/${roomCode}`)
    } catch {
      setError('We could not restore that player session just now.')
    } finally {
      setSubmitting(false)
    }
  }

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
            value={roomCode} onChange={(event) => { setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            placeholder="123456" />
          <label htmlFor="nickname">Nickname</label>
          <input id="nickname" autoComplete="nickname" maxLength={30} value={nickname}
            onChange={(event) => { setNickname(event.target.value); setError('') }} placeholder="e.g. Quizzy Lizzy" />
          {error && <StatusMessage tone="error">{error}</StatusMessage>}
          <button className="button button--primary button--wide" disabled={submitting} type="submit">
            {submitting ? 'Joining…' : 'Join game'}
          </button>
        </form>
        <Link className="text-link" to="/">← Back home</Link>
      </div>
    </main>
  )
}
