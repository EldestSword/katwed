import type { PlayerSession } from '../types/domain'

const prefix = 'katwed.player.'

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
