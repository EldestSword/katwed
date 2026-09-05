import { useState } from 'react'
import { selectSurvivorCommentary, type SurvivorCommentary } from '../features/game/survivorCommentary'
import { isSurvivorGame, survivorStandings } from '../features/game/survivor'
import type { SafeGameState } from '../types/domain'

interface History {
  observation: string
  sessionId: string | null
  questionKey: string
  before: Map<string, number> | null
  handled: boolean
  event: SurvivorCommentary | null
}
const empty = (): History => ({ observation: '', sessionId: null, questionKey: '', before: null, handled: false, event: null })

/** Component memory only. A refresh directly on Leaderboard cannot invent an elimination event. */
export function useSurvivorHistory(state: SafeGameState | null): SurvivorCommentary | null {
  const question = state?.currentQuestion
  const questionKey = question?.id && state?.questionOpenedAt && Number.isFinite(Date.parse(state.questionOpenedAt))
    ? JSON.stringify([question.id, state.questionOpenedAt]) : ''
  const observation = JSON.stringify([state?.sessionId, state?.status, state?.phase, questionKey,
    state?.players.map((player) => [player.id, player.survivorLivesRemaining, player.survivorEliminatedAtQuestion])])
  const [history, setHistory] = useState<History>(empty)
  let next = history
  if (history.observation !== observation) {
    const reset = !state || state.sessionId !== history.sessionId || state.status === 'closed' || !isSurvivorGame(state) ||
      state.phase === 'lobby' || (history.questionKey && questionKey && history.questionKey !== questionKey)
    next = reset ? empty() : { ...history }
    if (state && isSurvivorGame(state) && state.status === 'active') {
      if (questionKey && questionKey !== next.questionKey && ['question', 'locked', 'reveal'].includes(state.phase)) {
        next = { ...empty(), questionKey, before: new Map(state.players.map((player) => [player.id, player.survivorLivesRemaining ?? 0])) }
      } else if (questionKey && ['question', 'locked', 'reveal'].includes(state.phase) && !next.handled) {
        next.before = new Map(state.players.map((player) => [player.id, player.survivorLivesRemaining ?? 0]))
      }
      if (questionKey && state.phase === 'leaderboard') {
        next.event = next.handled ? null : selectSurvivorCommentary(next.before, state.players, survivorStandings(state.players))
        next.handled = true
      }
    }
    next = { ...next, observation, sessionId: state?.sessionId ?? null }
    setHistory(next)
  }
  return state?.phase === 'leaderboard' ? next.event : null
}
