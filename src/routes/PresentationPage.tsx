import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LoadingScreen } from '../components/LoadingScreen'
import { Logo } from '../components/AppShell'
import { PresentationStage } from '../features/game/PresentationStage'
import { repository } from '../services/repository'
import type { SafeGameState } from '../types/domain'
import { usePresentationAudio } from '../hooks/usePresentationAudio'
import { createRefreshScheduler, type RefreshScheduler } from '../services/refreshScheduler'
import { liveViewPollInterval } from '../features/game/liveRefreshPolicy'

export function PresentationPage() {
  const sessionId = useParams().sessionId ?? ''
  const [state, setState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursorHidden, setCursorHidden] = useState(false)
  const roomCodeRef = useRef<string | null>(null)
  const schedulerRef = useRef<RefreshScheduler | null>(null)

  useEffect(() => {
    const scheduler = createRefreshScheduler(async ({ isCurrent }) => {
      try {
        let roomCode = roomCodeRef.current
        if (!roomCode) {
          const bundle = await repository.getHostSession(sessionId)
          if (!bundle) throw new Error('That presentation could not be found.')
          roomCode = bundle.session.roomCode
        }
        const nextState = await repository.getSafeGameState(roomCode)
        if (!isCurrent()) return
        roomCodeRef.current = roomCode
        setState(nextState)
        setError('')
      } catch (reason) {
        if (isCurrent()) setError(reason instanceof Error ? reason.message : 'The presentation could not be refreshed.')
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
      roomCodeRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    const poll = window.setInterval(
      () => void schedulerRef.current?.request(),
      liveViewPollInterval('presentation', state?.phase),
    )
    return () => window.clearInterval(poll)
  }, [state?.phase])

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
  return <PresentationWithAudio state={state} cursorHidden={cursorHidden} />
}

function PresentationWithAudio({ state, cursorHidden }: { state: SafeGameState; cursorHidden: boolean }) {
  const audio = usePresentationAudio(state)
  const needsSoundAction = audio.status === 'blocked' || audio.status === 'error'
  return (
    <main
      className={`presentation-page ${cursorHidden ? 'cursor-hidden' : ''}`}
      data-audio-pack={audio.packId}
      data-audio-cue={audio.cue}
      data-audio-muted={audio.muted || undefined}
      data-audio-ducked={audio.duckedForYouTube || undefined}
    >
      <PresentationStage state={state} />
      {needsSoundAction && <aside className="presentation-audio-unlock" role="status">
        <span><strong>Presentation sound is paused</strong><small>The game can continue normally.</small></span>
        <button className="button button--light button--compact" type="button" onClick={audio.enable}>Enable sound</button>
      </aside>}
    </main>
  )
}
