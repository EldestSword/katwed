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
