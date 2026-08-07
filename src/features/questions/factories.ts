import type { Question, QuestionType } from '../../types/domain'

const common = (quizId: string, displayOrder: number) => ({
  id: crypto.randomUUID(),
  quizId,
  assignedCompetitorId: null,
  prompt: 'New question',
  supportingText: '',
  timeLimitSeconds: 30,
  points: 1000,
  displayOrder,
  revealCaption: '',
  media: { type: 'none' } as const,
  mediaVisibility: 'both' as const,
  presentationChoiceVisibility: 'show' as const,
})

export function createQuestion(type: QuestionType, quizId: string, displayOrder: number): Question {
  const base = common(quizId, displayOrder)
  switch (type) {
    case 'single-choice':
      return {
        ...base,
        type,
        options: [
          { id: crypto.randomUUID(), label: 'Option 1' },
          { id: crypto.randomUUID(), label: 'Option 2' },
        ],
        correctOptionId: '',
        randomiseOptions: false,
      }
    case 'multiple-select':
      return {
        ...base,
        type,
        options: [
          { id: crypto.randomUUID(), label: 'Option 1' },
          { id: crypto.randomUUID(), label: 'Option 2' },
          { id: crypto.randomUUID(), label: 'Option 3' },
        ],
        correctOptionIds: [],
        minimumSelections: 2,
        maximumSelections: 2,
        scoringMode: 'exact',
        randomiseOptions: false,
      }
    case 'true-false':
      return { ...base, type, correctValue: true }
    case 'slider':
      return {
        ...base,
        type,
        minimum: 0,
        maximum: 100,
        step: 1,
        correctValue: 50,
        tolerance: 0,
        prefix: '',
        suffix: '',
        unitLabel: '',
      }
    case 'pinpoint':
      return {
        ...base,
        type,
        media: { type: 'image', path: '', altText: 'Question image', revealEffect: 'immediate', revealDurationSeconds: 0 },
        targetX: 0.5,
        targetY: 0.5,
        targetRadius: 0.08,
      }
    case 'mashup':
      return {
        ...base,
        type,
        prompt: 'Who is in this mash-up?',
        points: 1,
        media: {
          type: 'image',
          path: '',
          altText: 'AI-generated merged portrait for the current question.',
          revealEffect: 'immediate',
          revealDurationSeconds: 0,
        },
        correctMemberIds: ['', ''],
      }
  }
}
