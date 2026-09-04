import { useState } from 'react'
import type { SafeGameState } from '../types/domain'
import type { FinalAwardsBaseline } from '../features/game/finalAwards'

interface History {
  observation: string
  sessionId: string | null
  phase: SafeGameState['phase'] | null
  highestQuestion: number
  firstQuestionKey: string | null
  baseline: FinalAwardsBaseline | null
}

/** Independent of animation history. Only known Question 1 standings can establish a baseline. */
export function useFinalAwardsHistory(state: SafeGameState | null): FinalAwardsBaseline | null {
  const question = state?.currentQuestion
  const firstQuestionKey = question?.questionNumber === 1 && question.id && state?.questionOpenedAt &&
    Number.isFinite(Date.parse(state.questionOpenedAt)) ? JSON.stringify([question.id, state.questionOpenedAt]) : null
  const legitimateFirst = state?.status === 'active' && state.quizType !== 'head-to-head' &&
    state.phase === 'leaderboard' && firstQuestionKey !== null && question !== null && question !== undefined && question.totalQuestions > 1
  const ranks = legitimateFirst ? state.leaderboard.map(({ playerId, rank }) => [playerId, rank] as const) : []
  const observation = JSON.stringify([state?.sessionId, state?.status, state?.quizType, state?.phase,
    question?.questionNumber, firstQuestionKey, ranks])
  const [history, setHistory] = useState<History>({ observation: '', sessionId: null, phase: null,
    highestQuestion: 0, firstQuestionKey: null, baseline: null })
  let next = history
  if (history.observation !== observation) {
    const reset = !state || !state.sessionId || state.sessionId !== history.sessionId || state.status === 'closed' ||
      state.quizType === 'head-to-head' || state.phase === 'lobby' ||
      (history.phase === 'finished' && state.phase !== 'finished') ||
      (question && question.questionNumber < history.highestQuestion) ||
      (firstQuestionKey && history.firstQuestionKey && firstQuestionKey !== history.firstQuestionKey)
    let baseline = reset ? null : history.baseline
    // Polling corrections during Question 1 replace its ranks. Later boards can never seed or rewrite them.
    if (legitimateFirst && ranks.length && new Set(ranks.map(([id]) => id)).size === ranks.length &&
      ranks.every(([id, rank]) => id && Number.isInteger(rank) && rank > 0)) baseline = new Map(ranks)
    next = { observation, sessionId: state?.sessionId ?? null, phase: state?.phase ?? null, baseline,
      highestQuestion: Math.max(reset ? 0 : history.highestQuestion, question?.questionNumber ?? 0),
      firstQuestionKey: firstQuestionKey ?? (reset ? null : history.firstQuestionKey) }
    // Update on changed input before children paint, so session/restart changes never flash stale awards.
    setHistory(next)
  }
  return state?.phase === 'finished' && state.status === 'active' && state.quizType !== 'head-to-head' ? next.baseline : null
}
