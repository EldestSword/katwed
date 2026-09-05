import type { Question, Quiz, QuizRound, SafeRound } from '../../types/domain'

// The quiz ID is also a valid, deterministic identity in the separate rounds table.
// This matches the database's one-time legacy backfill.
export function defaultRound(quizId: string): QuizRound {
  return { id: quizId, quizId, title: 'Round 1', subtitle: '', displayOrder: 0, introEnabled: false }
}

export function orderedRounds(rounds: readonly QuizRound[]): QuizRound[] {
  return [...rounds].sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
}

export function orderedRoundQuestions(quiz: Pick<Quiz, 'rounds' | 'questions'>): Question[] {
  return orderedRounds(quiz.rounds).flatMap((round) => quiz.questions
    .filter((question) => question.roundId === round.id)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)))
}

/** Only absent legacy structure is upgraded; explicit malformed rounds are never repaired. */
export function normaliseQuizRounds(quiz: Quiz): Quiz {
  if (quiz.rounds !== undefined) return quiz
  return { ...quiz, rounds: [defaultRound(quiz.id)], questions: quiz.questions.map((question) => ({ ...question, roundId: quiz.id })) }
}

export function canonicaliseRounds(quiz: Quiz): Quiz {
  return {
    ...quiz,
    rounds: orderedRounds(quiz.rounds).map((round, displayOrder) => ({ ...round, displayOrder })),
    questions: orderedRoundQuestions(quiz).map((question, displayOrder) => ({ ...question, displayOrder })),
  }
}

export function roundValidation(input: Pick<Quiz, 'quizType' | 'rounds' | 'questions'> & { id?: string }): string[] {
  const messages: string[] = []
  if (!Array.isArray(input.rounds) || !input.rounds.length) return ['A quiz needs at least one round.']
  if (input.rounds.some((round) => !round || typeof round !== 'object' || Array.isArray(round))) return ['Every round must contain valid metadata.']
  if (input.quizType === 'head-to-head' && input.rounds.length !== 1) messages.push('Head-to-Head supports exactly one round.')
  const ids = new Set<string>()
  const orders = new Set<number>()
  const quizId = input.id ?? input.rounds[0].quizId
  for (const round of input.rounds) {
    if (typeof round.id !== 'string' || !round.id.trim() || ids.has(round.id)) messages.push('Rounds must have unique IDs.')
    ids.add(round.id)
    if (typeof round.quizId !== 'string' || !round.quizId || round.quizId !== quizId) messages.push('Every round must belong to this quiz.')
    if (typeof round.title !== 'string' || !round.title.trim() || round.title.length > 80) messages.push('Give every round a title of 1–80 characters.')
    if (typeof round.subtitle !== 'string' || round.subtitle.length > 200) messages.push('Round subtitles must be 200 characters or fewer.')
    if (typeof round.introEnabled !== 'boolean') messages.push('Choose whether to show each round intro.')
    if (!Number.isInteger(round.displayOrder) || round.displayOrder < 0 || orders.has(round.displayOrder)) messages.push('Rounds must have distinct, non-negative positions.')
    orders.add(round.displayOrder)
  }
  for (const question of input.questions) {
    if (question.quizId !== quizId || !ids.has(question.roundId)) messages.push('Every question must belong to a round in this quiz.')
  }
  return [...new Set(messages)]
}

export function roundDeletionReason(quiz: Pick<Quiz, 'rounds' | 'questions'>, roundId: string): string | null {
  if (quiz.rounds.length <= 1) return 'Keep at least one round in the quiz.'
  if (quiz.questions.some((question) => question.roundId === roundId)) return 'Move this round’s questions to another round before deleting it.'
  return null
}

export function deleteRound(quiz: Quiz, roundId: string): Quiz {
  const reason = roundDeletionReason(quiz, roundId)
  if (reason) throw new Error(reason)
  return canonicaliseRounds({ ...quiz, rounds: quiz.rounds.filter((round) => round.id !== roundId) })
}

export function moveRound(quiz: Quiz, roundId: string, direction: -1 | 1): Quiz {
  const rounds = orderedRounds(quiz.rounds)
  const index = rounds.findIndex((round) => round.id === roundId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= rounds.length) return quiz
  ;[rounds[index], rounds[target]] = [rounds[target], rounds[index]]
  return canonicaliseRounds({ ...quiz, rounds: rounds.map((round, displayOrder) => ({ ...round, displayOrder })) })
}

export function moveQuestionToRound(quiz: Quiz, questionId: string, roundId: string): Quiz {
  if (!quiz.rounds.some((round) => round.id === roundId)) throw new Error('Choose a round in this quiz.')
  return canonicaliseRounds({ ...quiz, questions: quiz.questions.map((question) => question.id === questionId
    ? { ...question, roundId, displayOrder: Math.max(0, ...quiz.questions.map((item) => item.displayOrder)) + 1 }
    : question) })
}

export function moveQuestionInRound(quiz: Quiz, questionId: string, direction: -1 | 1): Quiz {
  const question = quiz.questions.find((item) => item.id === questionId)
  if (!question) return quiz
  const questions = orderedRoundQuestions(quiz)
  const index = questions.findIndex((item) => item.id === questionId)
  const target = index + direction
  if (questions[target]?.roundId !== question.roundId) return quiz
  ;[questions[index], questions[target]] = [questions[target], questions[index]]
  return { ...quiz, questions: questions.map((item, displayOrder) => ({ ...item, displayOrder })) }
}

export function safeRound(quiz: Pick<Quiz, 'rounds' | 'questions'>, roundId: string | null): SafeRound | null {
  const rounds = orderedRounds(quiz.rounds)
  const index = rounds.findIndex((round) => round.id === roundId)
  if (index < 0) return null
  const round = rounds[index]
  return { id: round.id, title: round.title, subtitle: round.subtitle, introEnabled: round.introEnabled,
    roundNumber: index + 1, totalRounds: rounds.length, questionCount: quiz.questions.filter((question) => question.roundId === round.id).length }
}
