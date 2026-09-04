import type { KatwedQuizFileV10, KatwedQuizFileV11 } from '../features/quiz-transfer/katwedQuizFormat'

export function withoutWagerFlag(file: KatwedQuizFileV11): KatwedQuizFileV10 {
  return { ...file, formatVersion: 10, quiz: { ...file.quiz, questions: file.quiz.questions.map(question => {
    const { wagerEnabled, ...legacy } = question
    if (wagerEnabled) throw new Error('Cannot downgrade a Wager fixture')
    return legacy
  }) } }
}

/** Historical schema fixtures must not carry a later version's common field. */
export function withoutProgressiveFlag(file: KatwedQuizFileV11) {
  const v10 = withoutWagerFlag(file)
  return { ...file, quiz: { ...file.quiz, questions: v10.quiz.questions.map(question => {
    const { progressiveRevealEnabled, ...legacy } = question
    if (progressiveRevealEnabled) throw new Error('Cannot downgrade a Progressive Reveal fixture')
    return legacy
  }) } }
}
