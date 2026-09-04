import type { GameSessionSettings, Question, QuestionPreludeKind } from '../../types/domain'
import { DEFAULT_DOUBLE_SCORE_DURATION_MS } from '../audio/soundPacks'
import { questionPreludeDurationMs, questionPreludeKind } from '../game/launchSettings'

export const DOUBLE_SCORE_INTRO_MS = DEFAULT_DOUBLE_SCORE_DURATION_MS

export function calculateTimedScore(baseScore: number, responseTimeMs: number, durationMs: number): number {
  if (!Number.isFinite(baseScore) || baseScore <= 0) return 0
  if (!Number.isFinite(durationMs) || durationMs <= 0) return Math.floor(baseScore)
  const elapsedFraction = Math.min(1, Math.max(0, responseTimeMs / durationMs))
  return Math.floor(baseScore * (1 - (0.5 * elapsedFraction)))
}

export function calculateStandardQuestionScore(
  baseScore: number,
  question: Pick<Question, 'doubleScore' | 'speedScoringEnabled'> & { type?: Question['type'] },
  responseTimeMs: number,
  durationMs: number,
): number {
  if (baseScore <= 0) return 0
  const doubled = question.doubleScore ? baseScore * 2 : baseScore
  return question.speedScoringEnabled && question.type !== 'connections'
    ? calculateTimedScore(doubled, responseTimeMs, durationMs)
    : Math.floor(doubled)
}

export function standardQuestionWindow(
  question: Pick<Question, 'doubleScore' | 'timeLimitSeconds'>,
  transitionTimeMs: number,
  settings: Pick<GameSessionSettings, 'doubleScoreIntroMs' | 'questionTypeIntrosEnabled'> = {
    doubleScoreIntroMs: DOUBLE_SCORE_INTRO_MS,
    questionTypeIntrosEnabled: false,
  },
): { openedAt: string; closesAt: string } {
  const prelude = questionPreludeKind(question, settings)
  const openedAtMs = transitionTimeMs + questionPreludeDurationMs(prelude, settings)
  return {
    openedAt: new Date(openedAtMs).toISOString(),
    closesAt: new Date(openedAtMs + (question.timeLimitSeconds * 1_000)).toISOString(),
  }
}

export function isQuestionPreludeActive(
  kind: QuestionPreludeKind | undefined,
  questionOpenedAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!kind || !questionOpenedAt) return false
  const openedAtMs = new Date(questionOpenedAt).getTime()
  return Number.isFinite(openedAtMs) && nowMs < openedAtMs
}
