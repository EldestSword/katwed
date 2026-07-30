import { useCallback, useEffect, useState } from 'react'
import { repository } from '../services/repository'
import type { SafeGameState } from '../types/domain'

export function useSafeGameState(roomCode: string) {
  const [state, setState] = useState<SafeGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await repository.getSafeGameState(roomCode)
      setState(next)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The game could not be refreshed.')
    } finally {
      setLoading(false)
    }
  }, [roomCode])

  useEffect(() => {
    void refresh()
    const unsubscribe = repository.subscribe(roomCode, () => void refresh())
    const poll = window.setInterval(() => void refresh(), repository.mode === 'supabase' ? 5000 : 15000)
    return () => {
      unsubscribe()
      window.clearInterval(poll)
    }
  }, [refresh, roomCode])

  return { state, loading, error, refresh }
}
