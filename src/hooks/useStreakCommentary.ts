import { useState } from 'react'
import type { SafeGameState } from '../types/domain'
import { selectStreakMilestone, type StreakCommentary } from '../features/game/streakCommentary'
import { isTeamGame } from '../features/teams/teams'

interface History {
  observation: string
  sessionId: string | null
  questionKey: string
  questionNumber: number
  before: Map<string, number> | null
  handled: boolean
  event: StreakCommentary | null
}
const empty = (): History => ({ observation: '', sessionId: null, questionKey: '', questionNumber: 0, before: null, handled: false, event: null })

/** Independent component memory. Only a witnessed same-question increment can announce a milestone. */
export function useStreakCommentary(state: SafeGameState | null): StreakCommentary | null {
  const question = state?.currentQuestion
  const key = question && state?.questionOpenedAt && Number.isFinite(Date.parse(state.questionOpenedAt)) ? JSON.stringify([question.id, state.questionOpenedAt]) : ''
  const observation = JSON.stringify([state?.sessionId, state?.status, state?.phase, key,
    state?.players.map(player => [player.id, player.nickname, player.currentCorrectStreak]),
    state?.leaderboard.map(entry => [entry.playerId, entry.rank, entry.totalScore, entry.correctAnswerCount, entry.totalCorrectResponseMs])])
  const [history, setHistory] = useState<History>(empty)
  let next = history
  if (history.observation !== observation) {
    const reset = !state || state.sessionId !== history.sessionId || state.status === 'closed' ||
      state.quizType === 'head-to-head' || ['lobby', 'finished'].includes(state.phase) ||
      Boolean(question && question.questionNumber < history.questionNumber)
    next = reset ? empty() : { ...history }
    if (state && state.quizType !== 'head-to-head' && state.status !== 'closed' && !['lobby', 'finished'].includes(state.phase)) {
      // A round intro has no question. Preserve the previous history until the next opening.
      if (key && key !== next.questionKey) next = { ...empty(), questionKey: key, questionNumber: question!.questionNumber }
      if (key && ['question', 'locked', 'reveal'].includes(state.phase) && !next.handled) {
        // Missing legacy fields cannot prove a transition, even though the UI treats them as zero.
        next.before = new Map(state.players.flatMap(player => player.currentCorrectStreak === undefined ? [] : [[player.id, player.currentCorrectStreak]]))
      }
      if (key && state.phase === 'leaderboard') {
        if (!next.handled) next.event = selectStreakMilestone(next.before, state.players, isTeamGame(state) ? [] : state.leaderboard)
        // A correction can repaint rows but never starts a second commentary beat.
        else next.event = null
        next.handled = true
      }
    }
    next = { ...next, observation, sessionId: state?.sessionId ?? null }
    setHistory(next)
  }
  return state?.phase === 'leaderboard' ? next.event : null
}
