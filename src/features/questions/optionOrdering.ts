import type { ChoiceOption, MultipleSelectQuestion, SafeQuestion, SingleChoiceQuestion } from '../../types/domain'

type ChoiceQuestion = Pick<SingleChoiceQuestion | MultipleSelectQuestion, 'id' | 'options' | 'randomiseOptions'> & {
  forceRandomiseOptions?: boolean
  optionOrderSeed?: string
}
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
  const safe = question as ChoiceQuestion
  const randomise = question.randomiseOptions || safe.forceRandomiseOptions === true
  const seed = safe.optionOrderSeed ?? question.id
  return orderOptions(question.options, randomise, seed)
}

export function optionPosition(question: ChoiceQuestion | SafeChoiceQuestion, optionId: string): number {
  return orderedQuestionOptions(question).findIndex((option) => option.id === optionId)
}
