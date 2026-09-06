import { config } from '../lib/config'
import { supabase } from '../lib/supabase/client'
import type { Player, PlayerAnswer } from '../types/domain'

export interface TypedAnswerReviewItem {
  answerId: string
  playerId: string
  nickname: string
  value: string
  submittedAt: string
}

function localReview(
  questionId: string,
  players: readonly Player[],
  answers: readonly PlayerAnswer[],
): TypedAnswerReviewItem[] {
  return answers
    .filter((answer) => answer.questionId === questionId && answer.payload.type === 'typed-answer')
    .filter((answer) => (answer.automaticCorrect ?? answer.correct) === false && answer.hostCorrectOverride !== true)
    .map((answer) => ({
      answerId: answer.id,
      playerId: answer.playerId,
      nickname: players.find((player) => player.id === answer.playerId)?.nickname ?? 'Player',
      value: answer.payload.type === 'typed-answer' ? answer.payload.value : '',
      submittedAt: answer.submittedAt,
    }))
    .sort((left, right) => left.nickname.localeCompare(right.nickname, 'en-GB'))
}

function validItem(value: unknown): value is TypedAnswerReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.answerId === 'string' &&
    typeof candidate.playerId === 'string' &&
    typeof candidate.nickname === 'string' &&
    typeof candidate.value === 'string' &&
    typeof candidate.submittedAt === 'string'
}

export async function loadTypedAnswerReview(
  sessionId: string,
  questionId: string,
  players: readonly Player[],
  answers: readonly PlayerAnswer[],
): Promise<TypedAnswerReviewItem[]> {
  if (config.demoMode || !supabase) return localReview(questionId, players, answers)

  const result = await supabase.rpc('host_get_typed_answer_review', { p_session_id: sessionId })
  if (result.error) throw new Error(result.error.message)
  if (!Array.isArray(result.data)) throw new Error('Typed Answer review returned an invalid response.')
  return result.data.filter(validItem)
}
