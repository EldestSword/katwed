import { POWER_UP_IDS, type AnswerPowerUpId, type PersonalPowerUpState, type PlayerAnswerPayload, type PowerUpId, type Question, type SafeQuestion } from '../../types/domain'

export const POWER_UP_NAMES: Record<PowerUpId, string> = { 'double-up': 'Double Up', 'fifty-fifty': '50/50', 'fast-five': 'Fast Five' }

export function powerUpUnavailableReason(id: PowerUpId, question: Question | SafeQuestion): string | null {
  if (question.buzzInEnabled) return 'Unavailable on Buzz-In'
  if (id === 'fifty-fifty' && (question.type !== 'single-choice' || question.options.length < 4)) return 'Single Choice with 4+ options only'
  if (id === 'fast-five' && (!question.speedScoringEnabled || question.progressiveRevealEnabled || question.type === 'connections')) return 'Speed questions only'
  return null
}

export function extractPowerUp(payload: PlayerAnswerPayload): { answer: PlayerAnswerPayload; powerUp: AnswerPowerUpId | null } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const powerUp = payload.powerUp ?? null
  if (powerUp !== null && powerUp !== 'double-up' && powerUp !== 'fast-five') return null
  const answer = { ...payload }
  delete answer.powerUp
  return { answer, powerUp }
}

export function powerUpScoringTime(actualMs: number, powerUp: PowerUpId | null | undefined): number {
  return powerUp === 'fast-five' ? Math.max(actualMs - 5_000, 0) : actualMs
}

export function powerUpFinalPoints(points: number, powerUp: PowerUpId | null | undefined): number {
  return powerUp === 'double-up' && points > 0 ? points * 2 : points
}

/** Private RPC input boundary. Unknown fields can otherwise leak into personal UI. */
export function parsePersonalPowerUps(value: unknown): PersonalPowerUpState | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Power-Up state.')
  const state = value as Record<string, unknown>
  if (Object.keys(state).some(key => !['runId', 'uses'].includes(key)) || typeof state.runId !== 'string' || !state.runId || !Array.isArray(state.uses) || state.uses.length > 3) throw new Error('Invalid Power-Up state.')
  const uses = state.uses.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid Power-Up use.')
    const use = raw as Record<string, unknown>
    if (Object.keys(use).some(key => !['questionId', 'powerUp', 'optionIds'].includes(key)) || typeof use.questionId !== 'string' || !use.questionId || !POWER_UP_IDS.some(id => id === use.powerUp)) throw new Error('Invalid Power-Up use.')
    if (use.powerUp === 'fifty-fifty') {
      if (!Array.isArray(use.optionIds) || use.optionIds.length !== 2 || use.optionIds.some(id => typeof id !== 'string' || !id) || new Set(use.optionIds).size !== 2) throw new Error('Invalid 50/50 options.')
    } else if (use.optionIds !== undefined) throw new Error('Invalid Power-Up options.')
    return { questionId: use.questionId, powerUp: use.powerUp as PowerUpId, ...(use.optionIds ? { optionIds: use.optionIds as string[] } : {}) }
  })
  if (new Set(uses.map(use => use.powerUp)).size !== uses.length || new Set(uses.map(use => use.questionId)).size !== uses.length) throw new Error('Duplicate Power-Up use.')
  return { runId: state.runId, uses }
}
