import type { Question, QuizType, SafeQuestion } from '../../types/domain'

export const DOUBLE_SCORE_INTRO_MS = 1_500

export function calculateTimedScore(baseScore: number, responseTimeMs: number, durationMs: number): number {
  if (!Number.isFinite(baseScore) || baseScore <= 0) return 0
  if (!Number.isFinite(durationMs) || durationMs <= 0) return Math.floor(baseScore)
  const elapsedFraction = Math.min(1, Math.max(0, responseTimeMs / durationMs))
  return Math.floor(baseScore * (1 - (0.5 * elapsedFraction)))
}

export function calculateStandardQuestionScore(
  baseScore: number,
  question: Pick<Question, 'doubleScore' | 'speedScoringEnabled'>,
  responseTimeMs: number,
  durationMs: number,
): number {
  if (baseScore <= 0) return 0
  const doubled = question.doubleScore ? baseScore * 2 : baseScore
  return question.speedScoringEnabled
    ? calculateTimedScore(doubled, responseTimeMs, durationMs)
    : Math.floor(doubled)
}

export function standardQuestionWindow(
  question: Pick<Question, 'doubleScore' | 'timeLimitSeconds'>,
  transitionTimeMs: number,
): { openedAt: string; closesAt: string } {
  const openedAtMs = transitionTimeMs + (question.doubleScore ? DOUBLE_SCORE_INTRO_MS : 0)
  return {
    openedAt: new Date(openedAtMs).toISOString(),
    closesAt: new Date(openedAtMs + (question.timeLimitSeconds * 1_000)).toISOString(),
  }
}

export function isDoubleScoreIntroActive(
  quizType: QuizType | undefined,
  question: Pick<SafeQuestion, 'doubleScore'> | null,
  questionOpenedAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (quizType === 'head-to-head' || !question?.doubleScore || !questionOpenedAt) return false
  const openedAtMs = new Date(questionOpenedAt).getTime()
  return Number.isFinite(openedAtMs) && nowMs < openedAtMs
}
