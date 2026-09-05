import { useEffect, useState } from 'react'
import type { SafeQuestion } from '../../types/domain'
import { PROGRESSIVE_SCORE_TICK_MS, progressiveRevealScore } from '../scoring/progressiveReveal'

/** This local clock renders only the badge, never remounting the answer controls. */
export function ProgressiveRevealPoints({ question, openedAt }: { question: SafeQuestion; openedAt: string | null }) {
  const [now, setNow] = useState(Date.now)
  const duration = question.media.type === 'image' ? Math.max(1, Math.round(question.media.revealDurationSeconds * 1000)) : 0
  const start = openedAt ? Date.parse(openedAt) : NaN
  const running = question.progressiveRevealEnabled && Number.isFinite(start) && now < start + duration
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), PROGRESSIVE_SCORE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [running, openedAt, duration])
  if (!question.progressiveRevealEnabled || !Number.isFinite(start)) return null
  const points = progressiveRevealScore(question.points, now - start, duration) * (question.doubleScore ? 2 : 1)
  return <p className="progressive-points" aria-live="off"><strong>{points.toLocaleString('en-GB')}</strong> points available</p>
}
