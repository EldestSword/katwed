import { useCallback, useState } from 'react'
import type { LeaderboardEntry, SafeGameState } from '../types/domain'

export interface LeaderboardReveal {
  id: number
  previous: LeaderboardEntry[] | null
  entries: LeaderboardEntry[]
}

interface History {
  observation: string
  sessionId: string | null
  questionKey: string
  baseline: LeaderboardEntry[] | null
  reveal: LeaderboardReveal | null
  sequence: number
}

/** Mounted above the phase switch: never stores hidden totals, persists nothing and makes no requests. */
export function useRevealedLeaderboard(state: SafeGameState | null) {
  const questionKey = JSON.stringify([state?.currentQuestion?.id, state?.questionOpenedAt])
  const visible = state?.phase === 'leaderboard' && state.status !== 'closed'
  const observation = JSON.stringify([state?.sessionId, state?.status, state?.phase, questionKey,
    visible ? state.leaderboard.map(({ playerId, nickname, rank, totalScore, survivorLivesRemaining, survivorEliminatedAtQuestion }) =>
      [playerId, nickname, rank, totalScore, survivorLivesRemaining, survivorEliminatedAtQuestion]) : null])
  const [history, setHistory] = useState<History>({ observation: '', sessionId: null, questionKey: '', baseline: null, reveal: null, sequence: 0 })
  let next = history
  if (history.observation !== observation) {
    const reset = state?.sessionId !== history.sessionId || !state || state.status === 'closed' || state.phase === 'lobby' || state.phase === 'finished'
    // Advancing early still establishes the last board actually revealed, even if its animation was interrupted.
    const baseline = reset ? null : history.reveal?.entries ?? history.baseline
    const sameReveal = !reset && history.reveal !== null && history.questionKey === questionKey
    const sequence = history.sequence + 1
    next = {
      observation, sessionId: state?.sessionId ?? null, questionKey, baseline, sequence,
      reveal: visible ? {
        id: sequence,
        // A corrected total within the same revealed question updates immediately without another announcement.
        previous: sameReveal ? null : baseline,
        entries: state.leaderboard.map((entry) => ({ ...entry })),
      } : null,
    }
    // Derive on an observed input change before children paint; this avoids flashing the final order first.
    setHistory(next)
  }
  const settle = useCallback((id: number) => {
    setHistory((current) => current.reveal?.id === id && current.baseline !== current.reveal.entries
      ? { ...current, baseline: current.reveal.entries }
      : current)
  }, [])
  return { reveal: next.reveal, settle }
}
