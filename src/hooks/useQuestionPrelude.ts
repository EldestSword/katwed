import { useEffect, useState } from 'react'
import { isQuestionPreludeActive } from '../features/scoring/standardScoring'
import type { QuestionPreludeKind } from '../types/domain'

const MAX_BROWSER_TIMEOUT_MS = 2_147_483_647

export function useQuestionPrelude(
  kind: QuestionPreludeKind | undefined,
  questionOpenedAt: string | null,
): QuestionPreludeKind {
  const [now, setNow] = useState(() => Date.now())
  const active = isQuestionPreludeActive(kind, questionOpenedAt, now)

  useEffect(() => {
    setNow(Date.now())
  }, [kind, questionOpenedAt])

  useEffect(() => {
    if (!active || !questionOpenedAt) return
    const openedAt = new Date(questionOpenedAt).getTime()
    if (!Number.isFinite(openedAt)) return
    const remainingMs = Math.max(0, openedAt - Date.now()) + 10
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(remainingMs, MAX_BROWSER_TIMEOUT_MS),
    )
    return () => window.clearTimeout(timer)
  }, [active, questionOpenedAt])

  return active ? kind ?? null : null
}
