import {
  QUIZ_TYPE_IDS,
  type HeadToHeadCompetitor,
  type Question,
  type Quiz,
  type QuizType,
} from '../../types/domain'

export const DEFAULT_QUIZ_TYPE: QuizType = 'standard'
export const HEAD_TO_HEAD_LAUNCH_MESSAGE = 'Head-to-Head live play is not available in this build yet.'

const quizTypes = new Set<string>(QUIZ_TYPE_IDS)

export function isQuizType(value: unknown): value is QuizType {
  return typeof value === 'string' && quizTypes.has(value)
}

export function normaliseQuizType(value: unknown): QuizType {
  return isQuizType(value) ? value : DEFAULT_QUIZ_TYPE
}

export function createHeadToHeadCompetitors(
  quizId: string,
  createId: () => string = () => crypto.randomUUID(),
): [HeadToHeadCompetitor, HeadToHeadCompetitor] {
  return [
    { id: createId(), quizId, displayName: '', displayOrder: 0 },
    { id: createId(), quizId, displayName: '', displayOrder: 1 },
  ]
}

export function nextHeadToHeadAssignment(quiz: Pick<Quiz, 'quizType' | 'headToHeadCompetitors' | 'questions'>): string | null {
  if (quiz.quizType !== 'head-to-head' || quiz.headToHeadCompetitors.length !== 2) return null
  const latest = quiz.questions.at(-1)?.assignedCompetitorId
  if (!latest) return null
  const [first, second] = [...quiz.headToHeadCompetitors].sort((a, b) => a.displayOrder - b.displayOrder)
  if (latest === first.id) return second.id
  if (latest === second.id) return first.id
  return null
}

function normaliseCompetitors(value: unknown, quizId: string): HeadToHeadCompetitor[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const item = candidate as Record<string, unknown>
    if (
      typeof item.id !== 'string' ||
      typeof item.displayName !== 'string' ||
      (item.displayOrder !== 0 && item.displayOrder !== 1)
    ) return []
    const displayOrder = item.displayOrder as 0 | 1
    return [{
      id: item.id,
      quizId,
      displayName: item.displayName,
      displayOrder,
    }]
  }).sort((a, b) => a.displayOrder - b.displayOrder)
}

export function normaliseQuizHeadToHead(quiz: Quiz): Quiz {
  const quizType = normaliseQuizType((quiz as { quizType?: unknown }).quizType)
  const headToHeadCompetitors = quizType === 'head-to-head'
    ? normaliseCompetitors((quiz as { headToHeadCompetitors?: unknown }).headToHeadCompetitors, quiz.id)
    : []
  const questions = quiz.questions.map((question): Question => ({
    ...question,
    assignedCompetitorId: quizType === 'head-to-head' && typeof (question as { assignedCompetitorId?: unknown }).assignedCompetitorId === 'string'
      ? (question as { assignedCompetitorId: string }).assignedCompetitorId
      : null,
  }))
  return { ...quiz, quizType, headToHeadCompetitors, questions }
}
