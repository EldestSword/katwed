import type { GamePhase } from '../../types/domain'

export type LiveViewRole = 'controller' | 'presentation'

export function liveViewPollInterval(role: LiveViewRole, phase: GamePhase | undefined): number {
  if (phase === 'lobby') return 1_000
  if (phase === 'question') return role === 'controller' ? 750 : 1_000
  return 5_000
}
