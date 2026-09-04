import type { KatwedQuizFileV10, KatwedQuizFileV11, KatwedQuizFileV12 } from '../features/quiz-transfer/katwedQuizFormat'

export function withoutBuzzFlag(file: KatwedQuizFileV12): KatwedQuizFileV11 {
  return { ...file, formatVersion: 11, quiz: { ...file.quiz, questions: file.quiz.questions.map(question => {
    const { buzzInEnabled, ...legacy } = question
    if (buzzInEnabled) throw new Error('Cannot downgrade a Buzz-In fixture')
    return legacy
  }) } }
}

export function withoutWagerFlag(file: KatwedQuizFileV11 | KatwedQuizFileV12): KatwedQuizFileV10 {
  const current = file.formatVersion === 12 ? withoutBuzzFlag(file) : file
  return { ...current, formatVersion: 10, quiz: { ...current.quiz, questions: current.quiz.questions.map(question => {
    const { wagerEnabled, ...legacy } = question
    if (wagerEnabled) throw new Error('Cannot downgrade a Wager fixture')
    return legacy
  }) } }
}

/** Historical schema fixtures must not carry a later version's common field. */
export function withoutProgressiveFlag(file: KatwedQuizFileV11 | KatwedQuizFileV12) {
  const v10 = withoutWagerFlag(file)
  return { ...v10, quiz: { ...v10.quiz, questions: v10.quiz.questions.map(question => {
    const { progressiveRevealEnabled, ...legacy } = question
    if (progressiveRevealEnabled) throw new Error('Cannot downgrade a Progressive Reveal fixture')
    return legacy
  }) } }
}
