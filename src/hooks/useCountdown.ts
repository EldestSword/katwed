import { useCallback, useEffect, useState } from 'react'

export function useCountdown(closesAt: string | null, pendingValue = 0): number {
  const calculate = useCallback(
    () => closesAt ? Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000)) : 0,
    [closesAt],
  )
  const [snapshot, setSnapshot] = useState(() => ({ closesAt, remaining: calculate() }))

  useEffect(() => {
    const update = () => setSnapshot({ closesAt, remaining: calculate() })
    update()
    if (!closesAt) return
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [calculate, closesAt])
  return snapshot.closesAt === closesAt ? snapshot.remaining : pendingValue
}
