import type { GamePhase, QuizType } from '../../types/domain'

export function shouldAutoLockStandardQuestion({
  quizType,
  phase,
  submittedCount,
  joinedPlayerCount,
  deadlineReached,
}: {
  quizType: QuizType | undefined
  phase: GamePhase | undefined
  submittedCount: number
  joinedPlayerCount: number
  deadlineReached: boolean
}): boolean {
  if (quizType === 'head-to-head' || phase !== 'question') return false
  const everyoneSubmitted = joinedPlayerCount > 0 && submittedCount >= joinedPlayerCount
  return deadlineReached || everyoneSubmitted
}
