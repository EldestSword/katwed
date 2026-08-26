import type { ChoiceOption, MultipleSelectQuestion, SafeQuestion, SingleChoiceQuestion } from '../../types/domain'

type ChoiceQuestion = Pick<SingleChoiceQuestion | MultipleSelectQuestion, 'id' | 'options' | 'randomiseOptions'>
type SafeChoiceQuestion = Extract<SafeQuestion, { type: 'single-choice' | 'multiple-select' }>

function stableScore(seed: string, value: string): number {
  return [...`${seed}${value}`].reduce(
    (total, character) => ((total * 31) + character.charCodeAt(0)) | 0,
    0,
  )
}

export function orderOptions(
  options: readonly ChoiceOption[],
  randomiseOptions: boolean,
  questionId: string,
): ChoiceOption[] {
  if (!randomiseOptions) return [...options]
  return [...options].sort((left, right) => (
    stableScore(questionId, left.id) - stableScore(questionId, right.id) || left.id.localeCompare(right.id)
  ))
}

export function orderedQuestionOptions(question: ChoiceQuestion | SafeChoiceQuestion): ChoiceOption[] {
  return orderOptions(question.options, question.randomiseOptions, question.id)
}

export function optionPosition(question: ChoiceQuestion | SafeChoiceQuestion, optionId: string): number {
  return orderedQuestionOptions(question).findIndex((option) => option.id === optionId)
}
