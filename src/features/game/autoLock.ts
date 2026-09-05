import type { GamePhase, QuizType } from '../../types/domain'

export function shouldAutoLockStandardQuestion({
  quizType,
  phase,
  submittedCount,
  joinedPlayerCount,
  deadlineReached,
  autoLockWhenAllAnswered = true,
  eligibleResponderCount,
}: {
  quizType: QuizType | undefined
  phase: GamePhase | undefined
  submittedCount: number
  joinedPlayerCount: number
  deadlineReached: boolean
  autoLockWhenAllAnswered?: boolean
  eligibleResponderCount?: number
}): boolean {
  if (quizType === 'head-to-head' || phase !== 'question') return false
  const eligible = eligibleResponderCount ?? joinedPlayerCount
  const everyoneSubmitted = eligible > 0 && submittedCount >= eligible
  return deadlineReached || (autoLockWhenAllAnswered && everyoneSubmitted)
}
