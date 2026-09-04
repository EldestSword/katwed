import type { PlayerAnswerPayload, WagerPercent } from '../../types/domain'

export const WAGER_PERCENTAGES = [0, 25, 50, 100] as const satisfies readonly WagerPercent[]

export function isWagerPercent(value: unknown): value is WagerPercent {
  return typeof value === 'number' && WAGER_PERCENTAGES.some(percent => percent === value)
}

/** Exact integer flooring, shared by preview, submission summaries and Demo scoring. */
export function wagerStake(questionPoints: number, percent: WagerPercent): number {
  if (!Number.isSafeInteger(questionPoints) || questionPoints < 0 || !isWagerPercent(percent)) {
    throw new Error('Invalid wager stake.')
  }
  return Number(BigInt(questionPoints) * BigInt(percent) / 100n)
}

export function applyWager(ordinaryPoints: number, baseQuestionPoints: number, correct: boolean, percent: WagerPercent): number {
  const stake = wagerStake(baseQuestionPoints, percent)
  return ordinaryPoints + (correct ? stake : -stake)
}

/** Remove only this metadata; the core validator must still reject other extra fields. */
export function extractWager(payload: PlayerAnswerPayload, enabled: boolean): { answer: PlayerAnswerPayload; percent: WagerPercent } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const hasWager = Object.hasOwn(payload, 'wagerPercent')
  const percent = hasWager ? payload.wagerPercent : 0
  if (!isWagerPercent(percent) || (!enabled && percent !== 0)) return null
  const answer = { ...payload }
  delete answer.wagerPercent
  return { answer, percent }
}
