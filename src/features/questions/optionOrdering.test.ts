import { describe, expect, it } from 'vitest'
import type { SingleChoiceQuestion } from '../../types/domain'
import { optionPosition, orderedQuestionOptions } from './optionOrdering'

function question(randomiseOptions: boolean): SingleChoiceQuestion {
  return {
    id: 'stable-question', quizId: 'quiz', assignedCompetitorId: null, type: 'single-choice',
    prompt: 'Choose', supportingText: '', timeLimitSeconds: 30, points: 1000,
    speedScoringEnabled: false, doubleScore: false, displayOrder: 0, revealCaption: '',
    media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
    options: [
      { id: 'paris', label: 'Paris' }, { id: 'london', label: 'London' },
      { id: 'rome', label: 'Rome' }, { id: 'berlin', label: 'Berlin' },
    ],
    correctOptionId: 'paris',
    randomiseOptions,
  }
}

describe('shared option ordering', () => {
  it('preserves authored order when randomisation is disabled', () => {
    expect(orderedQuestionOptions(question(false)).map((option) => option.id))
      .toEqual(['paris', 'london', 'rome', 'berlin'])
  })

  it('is deterministic for the same question across refreshes and consumers', () => {
    const first = orderedQuestionOptions(question(true)).map((option) => option.id)
    const refreshed = orderedQuestionOptions(structuredClone(question(true))).map((option) => option.id)
    expect(first).toEqual(refreshed)
    expect(first).not.toEqual(['paris', 'london', 'rome', 'berlin'])
    first.forEach((id, index) => expect(optionPosition(question(true), id)).toBe(index))
  })
})
