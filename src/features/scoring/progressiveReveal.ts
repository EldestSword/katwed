import type { Question, QuestionMedia, QuizType } from '../../types/domain'

export const PROGRESSIVE_MINIMUM_MULTIPLIER = 0.25
export const PROGRESSIVE_NEUTRAL_ALT = 'Progressively revealing question image'
export const PROGRESSIVE_SCORE_TICK_MS = 250
export const PROGRESSIVE_REDUCED_MOTION_STEPS = 4

export function progressiveRevealScore(baseScore: number, elapsedMs: number, durationMs: number): number {
  if (!Number.isSafeInteger(baseScore) || baseScore < 0 || !Number.isFinite(elapsedMs) || !Number.isSafeInteger(durationMs) || durationMs <= 0) return 0
  const elapsed = Math.min(Math.max(Math.floor(elapsedMs), 0), durationMs)
  // Keep integer boundaries exact, including odd durations.
  const denominator = BigInt(durationMs) * BigInt(1 / PROGRESSIVE_MINIMUM_MULTIPLIER)
  return Number(BigInt(baseScore) * (denominator - 3n * BigInt(elapsed)) / denominator)
}

export function progressiveRevealProgress(openedAt: string | null, nowMs: number, durationMs: number): number {
  const start = openedAt ? Date.parse(openedAt) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(nowMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0
  return Math.min(1, Math.max(0, (nowMs - start) / durationMs))
}

type ProgressiveQuestion = Pick<Question, 'type' | 'media' | 'timeLimitSeconds' | 'progressiveRevealEnabled'>
export function canOfferProgressiveReveal(question: ProgressiveQuestion, quizType: QuizType = 'standard'): boolean {
  return quizType === 'standard' && !['pinpoint', 'connections'].includes(question.type) && question.media.type === 'image'
}

export function progressiveRevealValidation(question: ProgressiveQuestion, quizType: QuizType = 'standard'): string[] {
  if (question.progressiveRevealEnabled === undefined || question.progressiveRevealEnabled === false) return []
  if (question.progressiveRevealEnabled !== true) return ['Choose a valid Progressive Reveal setting.']
  if (!canOfferProgressiveReveal(question, quizType)) return ['Progressive Reveal needs a Standard image question, excluding Pinpoint and Connections.']
  const media = question.media
  if (media.type !== 'image' || !['blur', 'pixelate', 'tiles', 'zoom-out'].includes(media.revealEffect) ||
    !Number.isFinite(media.revealDurationSeconds) || media.revealDurationSeconds <= 0 || media.revealDurationSeconds > 180 || media.revealDurationSeconds > question.timeLimitSeconds) {
    return ['Progressive Reveal needs a timed image effect of more than 0 seconds, no longer than the question timer or 180 seconds.']
  }
  return []
}

export function progressiveSafeMedia(media: QuestionMedia, enabled: boolean, revealed: boolean): QuestionMedia {
  return enabled && !revealed && media.type === 'image' ? { ...media, altText: PROGRESSIVE_NEUTRAL_ALT } : media
}
