import type {
  GamePhase,
  GameSessionSettings,
  HostResponseRecord,
  Player,
  PlayerAnswer,
  Question,
  RosterMember,
} from '../../types/domain'
import { orderedQuestionOptions } from '../questions/optionOrdering'
import { formatSliderValue } from './revealFormatting'
import { itemLabel, matchingLabels } from '../questions/arrangementQuestions'

export const HOST_RESPONSE_DETAIL_LIMIT = 15

export type HostResponseStatus = 'ready' | 'waiting' | 'locked-in' | 'answered' | 'correct' | 'incorrect' | 'no-answer'

export interface HostResponseRow {
  player: Player
  response: HostResponseRecord | null
  answer: PlayerAnswer | null
  status: HostResponseStatus
}

export function hostResponseRecordForAnswer(answer: PlayerAnswer): HostResponseRecord {
  return {
    id: answer.id,
    sessionId: answer.sessionId,
    questionId: answer.questionId,
    playerId: answer.playerId,
    resolutionStatus: answer.resolutionStatus,
    submittedAt: answer.submittedAt,
  }
}

export function buildHostResponseRows(
  players: readonly Player[],
  responses: readonly HostResponseRecord[],
  answers: readonly PlayerAnswer[],
  questionId: string,
  phase: GamePhase,
  preludeActive: boolean,
): HostResponseRow[] {
  const responseByPlayer = new Map(
    responses.filter((response) => response.questionId === questionId).map((response) => [response.playerId, response]),
  )
  const answerByPlayer = new Map(
    answers.filter((answer) => answer.questionId === questionId).map((answer) => [answer.playerId, answer]),
  )
  return players.map((player) => {
    const response = responseByPlayer.get(player.id) ?? null
    const answer = answerByPlayer.get(player.id) ?? null
    let status: HostResponseStatus
    if (preludeActive) status = 'ready'
    else if (phase === 'question') status = response ? 'locked-in' : 'waiting'
    else if (!response) status = 'no-answer'
    else if (answer && ['reveal', 'leaderboard', 'finished'].includes(phase)) status = answer.correct ? 'correct' : 'incorrect'
    else status = 'answered'
    return { player, response, answer, status }
  }).sort((left, right) => {
    const priority = (row: HostResponseRow) => row.response ? 1 : 0
    return priority(left) - priority(right) || left.player.nickname.localeCompare(right.player.nickname)
  })
}

export function responseSummary(rows: readonly HostResponseRow[], phase: GamePhase, preludeActive: boolean): string {
  if (preludeActive) return 'Question opens shortly'
  const missing = rows.filter((row) => !row.response).map((row) => row.player.nickname)
  if (phase === 'question') return missing.length ? `Waiting for: ${missing.join(' · ')}` : 'Everyone locked in'
  const summary = missing.length ? `No answer from: ${missing.join(' · ')}` : 'Everyone answered'
  if (phase === 'locked') return `Answers closed · ${summary}`
  if (['reveal', 'leaderboard', 'finished'].includes(phase)) return `Results shown · ${summary}`
  return summary
}

export function formatHostAnswer(
  answer: PlayerAnswer,
  question: Question,
  roster: readonly RosterMember[],
  settings: Pick<GameSessionSettings, 'shuffleAnswerOptions' | 'answerOptionSeed'>,
): string {
  const payload = answer.payload
  if (payload.type !== question.type) return 'Answer submitted'
  switch (payload.type) {
    case 'ordering': return question.type === 'ordering' ? payload.itemIds.map((id) => itemLabel(question.items, id)).join(' → ') : 'Order submitted'
    case 'matching': return question.type === 'matching' ? matchingLabels(question, payload.pairs).join(' · ') : 'Pairs submitted'
    case 'single-choice':
      return question.type === 'single-choice'
        ? question.options.find((option) => option.id === payload.optionId)?.label ?? 'Selected option'
        : 'Selected option'
    case 'multiple-select': {
      if (question.type !== 'multiple-select') return 'Multiple answers selected'
      const displayQuestion = {
        ...question,
        forceRandomiseOptions: settings.shuffleAnswerOptions,
        optionOrderSeed: settings.shuffleAnswerOptions ? `${settings.answerOptionSeed}:${question.id}` : undefined,
      }
      return orderedQuestionOptions(displayQuestion)
        .filter((option) => payload.optionIds.includes(option.id))
        .map((option) => option.label)
        .join(', ')
    }
    case 'true-false': return payload.value ? 'True' : 'False'
    case 'slider': return question.type === 'slider' ? formatSliderValue(payload.value, question) : String(payload.value)
    case 'pinpoint': return 'Pin placed'
    case 'typed-answer': return payload.value
    case 'mashup': return payload.memberIds.map(
      (id) => roster.find((member) => member.id === id)?.displayName ?? 'Unknown person',
    ).join(' + ')
  }
}
