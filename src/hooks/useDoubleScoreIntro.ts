import { useEffect, useState } from 'react'
import { DOUBLE_SCORE_INTRO_MS, isDoubleScoreIntroActive } from '../features/scoring/standardScoring'
import type { QuizType, SafeQuestion } from '../types/domain'

export function useDoubleScoreIntro(
  quizType: QuizType | undefined,
  question: SafeQuestion | null,
  questionOpenedAt: string | null,
): boolean {
  const [now, setNow] = useState(() => Date.now())
  const [clientIntroEndsAt, setClientIntroEndsAt] = useState<number | null>(null)

  useEffect(() => {
    const observedAt = Date.now()
    setNow(observedAt)

    if (quizType === 'head-to-head' || !question?.doubleScore || !questionOpenedAt) {
      setClientIntroEndsAt(null)
      return
    }

    const openedAt = new Date(questionOpenedAt).getTime()
    if (!Number.isFinite(openedAt) || openedAt <= observedAt) {
      setClientIntroEndsAt(null)
      return
    }

    // Guarantee the full showpiece even while an older server still uses the
    // historical 1.5-second opening delay. Once the server migration is live,
    // its five-second opening timestamp and this local window naturally align.
    setClientIntroEndsAt(observedAt + DOUBLE_SCORE_INTRO_MS)
  }, [quizType, question?.id, question?.doubleScore, questionOpenedAt])

  const serverActive = isDoubleScoreIntroActive(quizType, question, questionOpenedAt, now)
  const clientActive = clientIntroEndsAt !== null && now < clientIntroEndsAt
  const active = serverActive || clientActive

  useEffect(() => {
    if (!active) return
    const openedAt = questionOpenedAt ? new Date(questionOpenedAt).getTime() : Number.NaN
    const target = Math.max(
      Number.isFinite(openedAt) ? openedAt : 0,
      clientIntroEndsAt ?? 0,
    )
    const delay = Math.max(0, target - Date.now())
    if (delay <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 10)
    return () => window.clearTimeout(timer)
  }, [active, clientIntroEndsAt, questionOpenedAt])

  return active
}
