import type { ChoiceOption, Question, Quiz } from '../../types/domain'
import type { QuizSaveInput } from '../../services/gameRepository'

type IdFactory = () => string
const COPY_SUFFIX = ' (Copy)'
const MAX_QUIZ_TITLE_LENGTH = 120

function remappedId(ids: ReadonlyMap<string, string>, sourceId: string, subject: string): string {
  const id = ids.get(sourceId)
  if (!id) throw new Error(`The ${subject} reference could not be duplicated.`)
  return id
}

function duplicateOptions(
  options: readonly ChoiceOption[],
  createId: IdFactory,
): { options: ChoiceOption[]; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  const duplicates = options.map((option) => {
    const id = createId()
    ids.set(option.id, id)
    return { ...option, id }
  })
  return { options: duplicates, ids }
}

export function createDuplicateQuizInput(
  source: Quiz,
  createId: IdFactory = () => crypto.randomUUID(),
): QuizSaveInput {
  const duplicateQuizId = createId()
  const competitorIds = new Map<string, string>()
  const headToHeadCompetitors = source.headToHeadCompetitors.map((competitor) => {
    const id = createId()
    competitorIds.set(competitor.id, id)
    return { ...competitor, id, quizId: duplicateQuizId }
  })
  const memberIds = new Map<string, string>()
  const roster = source.roster.map((member) => {
    const id = createId()
    memberIds.set(member.id, id)
    return { ...member, id, quizId: duplicateQuizId }
  })

  const questions: Question[] = source.questions.map((question) => {
    const duplicate = {
      ...structuredClone(question),
      id: createId(),
      quizId: duplicateQuizId,
      assignedCompetitorId: question.assignedCompetitorId === null
        ? null
        : remappedId(competitorIds, question.assignedCompetitorId, 'assigned competitor'),
    }

    switch (duplicate.type) {
      case 'single-choice': {
        const { options, ids } = duplicateOptions(duplicate.options, createId)
        return {
          ...duplicate,
          options,
          correctOptionId: remappedId(ids, duplicate.correctOptionId, 'correct option'),
        }
      }
      case 'multiple-select': {
        const { options, ids } = duplicateOptions(duplicate.options, createId)
        return {
          ...duplicate,
          options,
          correctOptionIds: duplicate.correctOptionIds.map((id) => remappedId(ids, id, 'correct option')),
        }
      }
      case 'mashup':
        return {
          ...duplicate,
          correctMemberIds: duplicate.correctMemberIds.map(
            (id) => remappedId(memberIds, id, 'correct person'),
          ) as [string, string],
        }
      case 'true-false':
      case 'slider':
      case 'pinpoint':
      case 'typed-answer':
        return duplicate
    }
  })

  return {
    title: `${source.title.slice(0, MAX_QUIZ_TITLE_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`,
    quizType: source.quizType,
    headToHeadCompetitors,
    coverImagePath: source.coverImagePath,
    themeId: source.themeId,
    backgroundId: source.backgroundId,
    answerPaletteId: source.answerPaletteId,
    customAnswerColours: [...source.customAnswerColours] as QuizSaveInput['customAnswerColours'],
    soundPackId: source.soundPackId,
    roster,
    questions,
  }
}
