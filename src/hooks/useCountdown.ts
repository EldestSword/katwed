import { useCallback, useEffect, useState } from 'react'

export function useCountdown(closesAt: string | null): number {
  const calculate = useCallback(
    () => closesAt ? Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000)) : 0,
    [closesAt],
  )
  const [remaining, setRemaining] = useState(calculate)

  useEffect(() => {
    setRemaining(calculate())
    if (!closesAt) return
    const timer = window.setInterval(() => setRemaining(calculate()), 250)
    return () => window.clearInterval(timer)
  }, [calculate, closesAt])
  return remaining
}
