import type { KatwedQuizFileV10 } from '../features/quiz-transfer/katwedQuizFormat'

/** Historical schema fixtures must not carry a later version's common field. */
export function withoutProgressiveFlag(file: KatwedQuizFileV10) {
  return { ...file, quiz: { ...file.quiz, questions: file.quiz.questions.map(question => {
    const { progressiveRevealEnabled, ...legacy } = question
    if (progressiveRevealEnabled) throw new Error('Cannot downgrade a Progressive Reveal fixture')
    return legacy
  }) } }
}
