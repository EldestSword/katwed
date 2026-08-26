import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { Logo } from '../components/AppShell'
import { PresentationStage } from '../features/game/PresentationStage'
import { repository } from '../services/repository'
import type { SafeGameState } from '../types/domain'

export function PresentationPage() {
  const sessionId = useParams().sessionId ?? ''
  const [state, setState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursorHidden, setCursorHidden] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const bundle = await repository.getHostSession(sessionId)
      if (!bundle) throw new Error('That presentation could not be found.')
      setState(await repository.getSafeGameState(bundle.session.roomCode))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The presentation could not be refreshed.')
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

  useEffect(() => {
    let timer = window.setTimeout(() => setCursorHidden(true), 2500)
    const move = () => {
      setCursorHidden(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setCursorHidden(true), 2500)
    }
    window.addEventListener('mousemove', move)
    return () => { window.removeEventListener('mousemove', move); window.clearTimeout(timer) }
  }, [])

  if (loading) return <LoadingScreen message="Opening the presentation…" />
  if (!state) return <main className="centred-screen recovery-screen"><Logo /><p className="eyebrow">Shared screen unavailable</p><h1>Presentation unavailable</h1><p>{error}</p><Link className="button button--primary" to="/host">Back to quizzes</Link></main>
  return <main className={`presentation-page ${cursorHidden ? 'cursor-hidden' : ''}`}><PresentationStage state={state} /></main>
}
