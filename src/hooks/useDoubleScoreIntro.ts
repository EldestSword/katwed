import { useEffect, useState } from 'react'
import { isDoubleScoreIntroActive } from '../features/scoring/standardScoring'
import type { QuizType, SafeQuestion } from '../types/domain'

export function useDoubleScoreIntro(
  quizType: QuizType | undefined,
  question: SafeQuestion | null,
  questionOpenedAt: string | null,
): boolean {
  const [now, setNow] = useState(() => Date.now())
  const active = isDoubleScoreIntroActive(quizType, question, questionOpenedAt, now)

  useEffect(() => {
    setNow(Date.now())
    if (!questionOpenedAt) return
    const delay = Math.max(0, new Date(questionOpenedAt).getTime() - Date.now())
    if (!Number.isFinite(delay) || delay <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 10)
    return () => window.clearTimeout(timer)
  }, [question?.id, questionOpenedAt])

  return active
}
