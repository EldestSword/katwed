import { useEffect, useState } from 'react'
import type { QuizType, SafeQuestion } from '../types/domain'

const SERVER_DOUBLE_SCORE_INTRO_MS = 1_500
const DOUBLE_SCORE_VISUAL_MS = 5_000

export function useDoubleScoreIntro(
  quizType: QuizType | undefined,
  question: SafeQuestion | null,
  questionOpenedAt: string | null,
): boolean {
  const [now, setNow] = useState(() => Date.now())

  const openedAtMs = questionOpenedAt ? new Date(questionOpenedAt).getTime() : Number.NaN
  const introStartedAtMs = Number.isFinite(openedAtMs) ? openedAtMs - SERVER_DOUBLE_SCORE_INTRO_MS : Number.NaN
  const introEndsAtMs = Number.isFinite(introStartedAtMs) ? introStartedAtMs + DOUBLE_SCORE_VISUAL_MS : Number.NaN
  const active = quizType !== 'head-to-head' && Boolean(question?.doubleScore) && Number.isFinite(introEndsAtMs) && now < introEndsAtMs

  useEffect(() => {
    setNow(Date.now())
    if (!questionOpenedAt || !question?.doubleScore) return
    const opened = new Date(questionOpenedAt).getTime()
    if (!Number.isFinite(opened)) return
    const end = (opened - SERVER_DOUBLE_SCORE_INTRO_MS) + DOUBLE_SCORE_VISUAL_MS
    const delay = Math.max(0, end - Date.now())
    if (delay <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 10)
    return () => window.clearTimeout(timer)
  }, [question?.id, question?.doubleScore, questionOpenedAt])

  return active
}
