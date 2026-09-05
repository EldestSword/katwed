import type { BuzzState, Question, QuizType } from '../../types/domain'

export const BUZZ_ANSWER_WINDOW_SECONDS = 10

export function normaliseBuzzState(value: unknown): BuzzState | null {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Buzz state.')
  const buzz = value as Record<string, unknown>
  if (Object.keys(buzz).some(key => !['winnerPlayerId', 'claimedAt', 'answerDeadlineAt'].includes(key)) ||
    typeof buzz.winnerPlayerId !== 'string' || !buzz.winnerPlayerId || typeof buzz.claimedAt !== 'string' ||
    typeof buzz.answerDeadlineAt !== 'string' || !Number.isFinite(Date.parse(buzz.claimedAt)) ||
    !Number.isFinite(Date.parse(buzz.answerDeadlineAt)) || Date.parse(buzz.answerDeadlineAt) < Date.parse(buzz.claimedAt) ||
    Date.parse(buzz.answerDeadlineAt) - Date.parse(buzz.claimedAt) > BUZZ_ANSWER_WINDOW_SECONDS * 1_000) {
    throw new Error('Invalid Buzz state.')
  }
  return { winnerPlayerId: buzz.winnerPlayerId, claimedAt: buzz.claimedAt, answerDeadlineAt: buzz.answerDeadlineAt }
}

type BuzzQuestion = Pick<Question, 'type' | 'buzzInEnabled' | 'progressiveRevealEnabled'>

export function canUseBuzzIn(question: BuzzQuestion, quizType: QuizType = 'standard'): boolean {
  return quizType === 'standard' && question.type !== 'connections' && !question.progressiveRevealEnabled
}

export function buzzInValidation(question: BuzzQuestion, quizType: QuizType = 'standard'): string[] {
  if (question.buzzInEnabled === undefined || question.buzzInEnabled === false) return []
  if (question.buzzInEnabled !== true) return ['Choose a valid Buzz-In setting.']
  if (quizType !== 'standard') return ['Buzz-In is Standard-only. Disable it before switching to Head-to-Head.']
  if (question.type === 'connections') return ['Buzz-In is not available for Connections.']
  if (question.progressiveRevealEnabled) return ['Buzz-In cannot be combined with Progressive Reveal.']
  return []
}

export function buzzAnswerOpen(buzz: BuzzState | null | undefined, playerId: string, now = Date.now()): boolean {
  return Boolean(buzz && buzz.winnerPlayerId === playerId && now < Date.parse(buzz.answerDeadlineAt))
}
