import type { Question, RosterMember } from '../../types/domain'
import type { QuizSaveInput } from '../../services/gameRepository'

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

export function validateQuizSave(input: QuizSaveInput): string[] {
  const messages: string[] = []
  const title = input.title.trim()
  if (!title || title.length > 120) messages.push('Give the quiz a title of 1–120 characters.')

  const memberIds = new Set<string>()
  const memberNames = new Set<string>()
  for (const member of input.roster) {
    const name = member.displayName.trim()
    if (!member.id || memberIds.has(member.id)) messages.push('Roster members must have unique IDs.')
    memberIds.add(member.id)
    if (!name || name.length > 60) messages.push('Every roster member needs a display name of 1–60 characters.')
    const nameKey = name.toLocaleLowerCase('en-GB')
    if (nameKey && memberNames.has(nameKey)) messages.push('Roster names must be unique.')
    memberNames.add(nameKey)
    if (member.shortName.length > 30) messages.push('Short names must be 30 characters or fewer.')
  }

  const questionIds = new Set<string>()
  for (const question of input.questions) {
    if (!question.id || questionIds.has(question.id)) messages.push('Questions must have unique IDs.')
    questionIds.add(question.id)
    messages.push(...validateQuestion(question, input.roster).messages)
    if (question.revealCaption.length > 240) messages.push('Reveal captions must be 240 characters or fewer.')
  }

  return [...new Set(messages)]
}
