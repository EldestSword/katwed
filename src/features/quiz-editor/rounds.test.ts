import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { createQuestion } from '../questions/factories'
import { createSessionQuestionOrder } from '../game/launchSettings'
import { createDuplicateQuizInput } from './duplicateQuiz'
import { canonicaliseRounds, defaultRound, deleteRound, moveQuestionInRound, moveQuestionToRound, moveRound, normaliseQuizRounds, roundValidation } from './rounds'
import type { Quiz } from '../../types/domain'

function roundQuiz(): Quiz {
  const quiz = structuredClone(mixedDemoQuiz)
  quiz.rounds = [defaultRound(quiz.id), { id: 'round-b', quizId: quiz.id, title: 'Round 2', subtitle: 'Next up', introEnabled: true, displayOrder: 1 }]
  quiz.questions = [0, 1, 2, 3].map((index) => ({ ...createQuestion('true-false', quiz.id, index, false), id: `q-${index}`, roundId: quiz.rounds[Math.floor(index / 2)].id }))
  return quiz
}

describe('Core Rounds structure', () => {
  it('upgrades missing legacy structure without altering question order or intro behaviour', () => {
    const legacy = structuredClone(mixedDemoQuiz)
    delete (legacy as Partial<Quiz>).rounds
    const normalised = normaliseQuizRounds(legacy)
    expect(normalised.rounds).toEqual([defaultRound(legacy.id)])
    expect(normalised.questions.map((q) => q.id)).toEqual(legacy.questions.map((q) => q.id))
    expect(normalised.questions.every((q) => q.roundId === legacy.id)).toBe(true)
    expect(normaliseQuizRounds(normalised)).toBe(normalised)
  })
  it.each([
    (q: Quiz) => { q.rounds = [] },
    (q: Quiz) => { q.rounds = [null] as unknown as Quiz['rounds'] },
    (q: Quiz) => { q.rounds[1].id = q.rounds[0].id },
    (q: Quiz) => { q.rounds[0].title = ' ' },
    (q: Quiz) => { q.rounds[0].title = 'x'.repeat(81) },
    (q: Quiz) => { q.rounds[0].subtitle = 'x'.repeat(201) },
    (q: Quiz) => { q.rounds[0].quizId = 'another-quiz' },
    (q: Quiz) => { q.questions[0].quizId = 'another-quiz' },
    (q: Quiz) => { q.questions[0].roundId = 'missing' },
    (q: Quiz) => { q.rounds[1].displayOrder = 0 },
    (q: Quiz) => { q.quizType = 'head-to-head' },
  ])('rejects malformed structure %i', (mutate) => {
    const quiz = roundQuiz(); mutate(quiz)
    expect(roundValidation(normaliseQuizRounds(quiz)).length).toBeGreaterThan(0)
  })
  it('allows a single structural H2H round', () => {
    const quiz = roundQuiz(); quiz.quizType = 'head-to-head'; quiz.rounds = quiz.rounds.slice(0, 1); quiz.questions = quiz.questions.slice(0, 2)
    expect(roundValidation(quiz)).toEqual([])
  })
  it('moves and reorders questions while keeping global numbering grouped', () => {
    const quiz = moveQuestionToRound(roundQuiz(), 'q-0', 'round-b')
    expect(quiz.questions.map((q) => q.id)).toEqual(['q-1', 'q-2', 'q-3', 'q-0'])
    expect(moveQuestionInRound(quiz, 'q-2', -1)).toBe(quiz)
    const reordered = moveQuestionInRound(quiz, 'q-0', -1)
    expect(reordered.questions.map((q) => q.id)).toEqual(['q-1', 'q-2', 'q-0', 'q-3'])
    expect(reordered.questions.map((q) => q.displayOrder)).toEqual([0, 1, 2, 3])
    const reversed = moveRound(reordered, 'round-b', -1)
    expect(reversed.questions.map((q) => q.id)).toEqual(['q-2', 'q-0', 'q-3', 'q-1'])
  })
  it('blocks deleting the last or a non-empty round, and deletes an emptied round', () => {
    let quiz = roundQuiz()
    expect(() => deleteRound(quiz, quiz.id)).toThrow('Move this round’s questions')
    quiz = moveQuestionToRound(moveQuestionToRound(quiz, 'q-0', 'round-b'), 'q-1', 'round-b')
    quiz = deleteRound(quiz, quiz.id)
    expect(quiz.rounds.map((r) => r.id)).toEqual(['round-b'])
    expect(() => deleteRound(quiz, 'round-b')).toThrow('Keep at least one')
  })
  it('duplicates a quiz with fresh round identities and preserved membership', () => {
    const original = roundQuiz(); const copy = createDuplicateQuizInput(original)
    expect(copy.rounds).toHaveLength(2)
    expect(copy.rounds!.every((r) => !original.rounds.some((old) => old.id === r.id))).toBe(true)
    expect(copy.questions.map((q) => q.roundId)).toEqual([copy.rounds![0].id, copy.rounds![0].id, copy.rounds![1].id, copy.rounds![1].id])
    expect(roundValidation({ ...copy, rounds: copy.rounds! })).toEqual([])
  })
  it('keeps authored round order when shuffled and repeats the same seed exactly', () => {
    const quiz = roundQuiz()
    const authored = createSessionQuestionOrder([...quiz.questions].reverse(), false, 'seed', quiz.rounds)
    expect(authored).toEqual(['q-0', 'q-1', 'q-2', 'q-3'])
    for (const seed of ['a', 'b', 'c']) {
      const shuffled = createSessionQuestionOrder(quiz.questions, true, seed, quiz.rounds)
      expect(shuffled.slice(0, 2).sort()).toEqual(['q-0', 'q-1'])
      expect(shuffled.slice(2).sort()).toEqual(['q-2', 'q-3'])
      expect(createSessionQuestionOrder(quiz.questions, true, seed, quiz.rounds)).toEqual(shuffled)
    }
    const reordered = canonicaliseRounds({ ...quiz, rounds: quiz.rounds.map((r) => ({ ...r, displayOrder: 1 - r.displayOrder })) })
    expect(createSessionQuestionOrder(reordered.questions, true, 'seed', reordered.rounds).slice(0, 2).sort()).toEqual(['q-2', 'q-3'])
  })
})
