import { extractWager } from '../features/scoring/wager'
import { extractPowerUp } from '../features/game/powerUps'
import { ANSWER_CORE_FIELDS } from '../features/questions/answerPayload'
import type { MatchingPair, PlayerAnswerPayload, PlayerSession } from '../types/domain'
import { onlyFields } from '../features/questions/arrangementQuestions'
import { MAX_TYPED_ANSWER_LENGTH, isMeaningfulTypedAnswer } from '../features/typed-answer/typedAnswer'

const prefix = 'katwed.player.'
const answerPrefix = 'katwed.answer.'

export function savePlayerSession(session: PlayerSession): void {
  localStorage.setItem(`${prefix}${session.roomCode}`, JSON.stringify(session))
}

export function loadPlayerSession(roomCode: string): PlayerSession | null {
  const raw = localStorage.getItem(`${prefix}${roomCode}`)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PlayerSession>
    return value.playerId && value.reconnectToken && value.roomCode === roomCode && value.nickname
      ? value as PlayerSession
      : null
  } catch {
    return null
  }
}

export function clearPlayerSession(roomCode: string): void {
  localStorage.removeItem(`${prefix}${roomCode}`)
}

function isSubmittedAnswer(value: unknown): value is PlayerAnswerPayload {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  const powerUp = extractPowerUp(value as PlayerAnswerPayload)
  const wager = powerUp && extractWager(powerUp.answer, true)
  if (!wager) return false
  const candidate = wager.answer as Record<string, unknown>
  const fields = ANSWER_CORE_FIELDS[wager.answer.type]
  if (!fields || !onlyFields(candidate, fields)) return false
  switch (candidate.type) {
    case 'connections': return onlyFields(candidate, ['type', 'value']) && typeof candidate.value === 'string' && candidate.value.trim().length <= MAX_TYPED_ANSWER_LENGTH && isMeaningfulTypedAnswer(candidate.value)
    case 'ordering': return onlyFields(candidate, ['type', 'itemIds']) && Array.isArray(candidate.itemIds) &&
      candidate.itemIds.length >= 2 && candidate.itemIds.length <= 8 &&
      candidate.itemIds.every((id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 128) && new Set(candidate.itemIds).size === candidate.itemIds.length
    case 'matching': return onlyFields(candidate, ['type', 'pairs']) && Array.isArray(candidate.pairs) &&
      candidate.pairs.length >= 2 && candidate.pairs.length <= 8 &&
      candidate.pairs.every((pair: unknown): pair is MatchingPair => onlyFields(pair, ['leftId', 'rightId']) && typeof pair.leftId === 'string' && typeof pair.rightId === 'string' && pair.leftId.length > 0 && pair.rightId.length > 0) &&
      new Set(candidate.pairs.map(pair => pair.leftId)).size === candidate.pairs.length && new Set(candidate.pairs.map(pair => pair.rightId)).size === candidate.pairs.length
    case 'single-choice': return typeof candidate.optionId === 'string'
    case 'multiple-select': return Array.isArray(candidate.optionIds) && candidate.optionIds.every((id) => typeof id === 'string')
    case 'true-false': return typeof candidate.value === 'boolean'
    case 'slider': return typeof candidate.value === 'number'
    case 'pinpoint': return typeof candidate.x === 'number' && typeof candidate.y === 'number'
    case 'typed-answer': return typeof candidate.value === 'string'
    case 'mashup':
      return Array.isArray(candidate.memberIds) &&
        candidate.memberIds.length === 2 &&
        candidate.memberIds.every((id) => typeof id === 'string')
    default: return false
  }
}

export function loadSubmittedAnswer(
  playerId: string,
  questionId: string,
  openedAt: string | null,
): PlayerAnswerPayload | null {
  const raw = localStorage.getItem(`${answerPrefix}${playerId}.${questionId}.${openedAt ?? 'unknown'}`)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isSubmittedAnswer(value) ? value : null
  } catch {
    return null
  }
}

export function saveSubmittedAnswer(
  playerId: string,
  questionId: string,
  openedAt: string | null,
  payload: PlayerAnswerPayload,
): void {
  localStorage.setItem(
    `${answerPrefix}${playerId}.${questionId}.${openedAt ?? 'unknown'}`,
    JSON.stringify(payload),
  )
}
