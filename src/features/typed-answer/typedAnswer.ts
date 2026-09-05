export const MAX_TYPED_ANSWER_LENGTH = 120
export const MAX_TYPED_ANSWER_VARIANTS = 20

export function normaliseTypedAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function isMeaningfulTypedAnswer(value: string): boolean {
  return normaliseTypedAnswer(value).length > 0
}

export function typedAnswerMatches(
  submitted: string,
  correctAnswer: string,
  acceptedAnswers: readonly string[],
): boolean {
  const normalised = normaliseTypedAnswer(submitted)
  return normalised.length > 0 && [correctAnswer, ...acceptedAnswers]
    .some((answer) => normaliseTypedAnswer(answer) === normalised)
}

export function parseTypedAnswerAlternatives(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((answer) => answer.trim())
    .filter(Boolean)
}

export function validateTypedAnswers(primary: unknown, alternatives: unknown): string[] {
  if (typeof primary !== 'string' || !Array.isArray(alternatives) || !alternatives.every((answer: unknown): answer is string => typeof answer === 'string')) return ['Provide a primary answer and a list of text alternatives.']
  const answers = [primary, ...alternatives]
  const messages: string[] = []
  if (answers.length > MAX_TYPED_ANSWER_VARIANTS) messages.push('Typed Answer supports one primary answer and up to 19 alternatives.')
  if (answers.some(answer => answer.length > MAX_TYPED_ANSWER_LENGTH)) messages.push('Typed answers must be 120 characters or fewer.')
  if (answers.some(answer => !answer.trim() || !isMeaningfulTypedAnswer(answer))) messages.push('Every typed answer must contain at least one letter or number.')
  const normalised = answers.map(normaliseTypedAnswer)
  if (new Set(normalised).size !== normalised.length) messages.push('Typed answers must be different after ignoring capitals, spaces and punctuation.')
  return messages
}
