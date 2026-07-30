import type { PlayerSession } from '../types/domain'

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

export function loadSubmittedAnswer(
  playerId: string,
  questionId: string,
  openedAt: string | null,
): readonly [string, string] | null {
  const raw = localStorage.getItem(`${answerPrefix}${playerId}.${questionId}.${openedAt ?? 'unknown'}`)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) &&
      value.length === 2 &&
      value.every((item) => typeof item === 'string') &&
      value[0] !== value[1]
      ? [value[0], value[1]]
      : null
  } catch {
    return null
  }
}

export function saveSubmittedAnswer(
  playerId: string,
  questionId: string,
  openedAt: string | null,
  selectedIds: readonly [string, string],
): void {
  localStorage.setItem(
    `${answerPrefix}${playerId}.${questionId}.${openedAt ?? 'unknown'}`,
    JSON.stringify(selectedIds),
  )
}
