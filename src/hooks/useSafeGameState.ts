import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeSubscriptionStatus } from '../services/gameRepository'
import { createRefreshScheduler, type RefreshScheduler } from '../services/refreshScheduler'
import { repository } from '../services/repository'
import type { SafeGameState } from '../types/domain'

export const HEALTHY_SANITY_REFRESH_MS = 45_000
export const UNHEALTHY_FALLBACK_REFRESH_MS = 3_000

type ConnectionState = RealtimeSubscriptionStatus | 'CONNECTING'

export function useSafeGameState(roomCode: string) {
  const [state, setState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState<ConnectionState>('CONNECTING')
  const schedulerRef = useRef<RefreshScheduler | null>(null)

  const refresh = useCallback(() => (
    schedulerRef.current?.request({ immediate: true }) ?? Promise.resolve()
  ), [])

  useEffect(() => {
    setLoading(true)
    setRealtimeStatus('CONNECTING')
    let active = true
    let connectionState: ConnectionState = 'CONNECTING'
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const scheduler = createRefreshScheduler(async ({ isCurrent }) => {
      try {
        const next = await repository.getSafeGameState(roomCode)
        if (!isCurrent()) return
        setState(next)
        setError('')
      } catch (reason) {
        if (!isCurrent()) return
        setError(reason instanceof Error ? reason.message : 'The game could not be refreshed.')
      } finally {
        if (isCurrent()) setLoading(false)
      }
    })
    schedulerRef.current = scheduler

    const schedulePoll = () => {
      if (!active) return
      if (pollTimer !== null) clearTimeout(pollTimer)
      const delay = connectionState === 'SUBSCRIBED'
        ? HEALTHY_SANITY_REFRESH_MS
        : UNHEALTHY_FALLBACK_REFRESH_MS
      pollTimer = setTimeout(() => {
        void scheduler.request().then(() => {
          if (active) schedulePoll()
        })
      }, delay)
    }

    const unsubscribe = repository.subscribe(
      roomCode,
      () => void scheduler.request(),
      (status) => {
        if (!active) return
        connectionState = status
        setRealtimeStatus(status)
        schedulePoll()
      },
    )

    const recover = () => void scheduler.request({ immediate: true })
    const recoverVisible = () => {
      if (document.visibilityState === 'visible') recover()
    }
    window.addEventListener('online', recover)
    window.addEventListener('focus', recover)
    document.addEventListener('visibilitychange', recoverVisible)
    schedulePoll()
    void scheduler.request({ immediate: true })

    return () => {
      active = false
      unsubscribe()
      scheduler.dispose()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      if (pollTimer !== null) clearTimeout(pollTimer)
      window.removeEventListener('online', recover)
      window.removeEventListener('focus', recover)
      document.removeEventListener('visibilitychange', recoverVisible)
    }
  }, [roomCode])

  return {
    state,
    loading,
    error,
    refresh,
    realtimeStatus,
    fallbackPolling: realtimeStatus !== 'SUBSCRIBED',
  }
}
