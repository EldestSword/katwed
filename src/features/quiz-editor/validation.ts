import type { Question, RosterMember } from '../../types/domain'

export interface QuestionValidation {
  valid: boolean
  messages: string[]
}

export function validateQuestion(question: Question, roster: readonly RosterMember[]): QuestionValidation {
  const messages: string[] = []
  const activeIds = new Set(roster.filter((member) => member.active).map((member) => member.id))
  if (!question.imagePath.trim()) messages.push('Add a question image.')
  if (question.correctMemberIds.length !== 2 || new Set(question.correctMemberIds).size !== 2 || question.correctMemberIds.some((id) => !id)) {
    messages.push('Choose exactly two different correct people.')
  } else if (question.correctMemberIds.some((id) => !activeIds.has(id))) {
    messages.push('Both correct people must be active.')
  }
  if (!Number.isInteger(question.timeLimitSeconds) || question.timeLimitSeconds < 5 || question.timeLimitSeconds > 180) {
    messages.push('Set a timer between 5 and 180 seconds.')
  }
  return { valid: messages.length === 0, messages }
}
