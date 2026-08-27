import type {
  GamePhase,
  GameSessionSettings,
  Player,
  PlayerAnswer,
  Question,
  RosterMember,
} from '../../types/domain'
import { orderedQuestionOptions } from '../questions/optionOrdering'
import { formatSliderValue } from './revealFormatting'

export const HOST_RESPONSE_DETAIL_LIMIT = 15

export type HostResponseStatus = 'ready' | 'waiting' | 'locked-in' | 'answered' | 'no-answer'

export interface HostResponseRow {
  player: Player
  answer: PlayerAnswer | null
  status: HostResponseStatus
}

export function buildHostResponseRows(
  players: readonly Player[],
  answers: readonly PlayerAnswer[],
  questionId: string,
  phase: GamePhase,
  preludeActive: boolean,
): HostResponseRow[] {
  const byPlayer = new Map(
    answers.filter((answer) => answer.questionId === questionId).map((answer) => [answer.playerId, answer]),
  )
  return players.map((player) => {
    const answer = byPlayer.get(player.id) ?? null
    const status: HostResponseStatus = preludeActive
      ? 'ready'
      : phase === 'question'
        ? (answer ? 'locked-in' : 'waiting')
        : (answer ? 'answered' : 'no-answer')
    return { player, answer, status }
  }).sort((left, right) => {
    const priority = (row: HostResponseRow) => row.answer ? 1 : 0
    return priority(left) - priority(right) || left.player.nickname.localeCompare(right.player.nickname)
  })
}

export function responseSummary(rows: readonly HostResponseRow[], phase: GamePhase, preludeActive: boolean): string {
  if (preludeActive) return 'Question opens shortly'
  const missing = rows.filter((row) => !row.answer).map((row) => row.player.nickname)
  if (phase === 'question') return missing.length ? `Waiting for: ${missing.join(' · ')}` : 'Everyone locked in'
  return missing.length ? `No answer from: ${missing.join(' · ')}` : 'Everyone answered'
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
