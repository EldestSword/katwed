import type { PlayerAnswerPayload, PlayerSession } from '../types/domain'

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
  const candidate = value as Record<string, unknown>
  switch (candidate.type) {
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
