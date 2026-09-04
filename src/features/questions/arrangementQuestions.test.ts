import { describe, expect, it } from 'vitest'
import { arrangementValidation, remapArrangementItems, shuffledTextItems } from './arrangementQuestions'
import { createQuestion } from './factories'
import { orderingFixture, matchingFixture, arrangementQuiz } from '../../test/arrangementFixtures'
import { validateQuizSave } from '../quiz-editor/validation'
import { createDuplicateQuizInput } from '../quiz-editor/duplicateQuiz'
import { scoreQuestion } from '../../utils/scoring'
import type { MatchingQuestion, OrderingQuestion, PlayerAnswerPayload } from '../../types/domain'

describe('Ordering and Matching definitions', () => {
  it.each(['ordering', 'matching'] as const)('creates a valid %s draft and remaps item references without losing its round', (type) => {
    const q = createQuestion(type, 'quiz', 0) as OrderingQuestion | MatchingQuestion
    expect(arrangementValidation(q)).toEqual([])
    const copy = remapArrangementItems(q)
    expect(copy.roundId).toBe(q.roundId)
    expect(arrangementValidation(copy)).toEqual([])
    if (q.type === 'ordering' && copy.type === 'ordering') {
      expect(copy.items.every((item) => !q.items.some((old) => old.id === item.id))).toBe(true)
      expect(copy.correctItemIds.map((id) => copy.items.find((item) => item.id === id)?.label)).toEqual(q.correctItemIds.map((id) => q.items.find((item) => item.id === id)?.label))
    } else if (q.type === 'matching' && copy.type === 'matching') {
      expect(copy.scoringMode).toBe('partial')
      expect([...copy.leftItems, ...copy.rightItems].every((item) => ![...q.leftItems, ...q.rightItems].some((old) => old.id === item.id))).toBe(true)
      expect(copy.correctPairs.map((pair) => [copy.leftItems.find((item) => item.id === pair.leftId)?.label, copy.rightItems.find((item) => item.id === pair.rightId)?.label])).toEqual([['Left 1', 'Right 1'], ['Left 2', 'Right 2'], ['Left 3', 'Right 3']])
    }
    expect(validateQuizSave(createDuplicateQuizInput(arrangementQuiz()))).toEqual([])
  })
  const invalidOrdering: Array<(q: OrderingQuestion) => void> = [
    q => { q.items = q.items.slice(0, 1) }, q => { q.items = Array.from({ length: 9 }, (_, i) => ({ id: String(i), label: String(i) })) },
    q => { q.items[0].label = ' ' }, q => { q.items[0].label = 'x'.repeat(121) }, q => { q.items[0].label = ' BRAVO ' },
    q => { q.items[0].id = q.items[1].id }, q => { q.correctItemIds.pop() }, q => { q.correctItemIds[0] = 'unknown' },
    q => { q.correctItemIds[0] = q.correctItemIds[1] }, q => { q.correctItemIds.push('extra') },
    q => { Object.assign(q.items[0], { image: '/photo.png' }) },
  ]
  it.each(invalidOrdering.map((fn, i) => [i, fn] as const))('rejects malformed Ordering %i in application validation', (_, mutate) => {
    const quiz = arrangementQuiz(); const q = orderingFixture(); mutate(q); quiz.questions = [q]
    expect(validateQuizSave(quiz).length).toBeGreaterThan(0)
  })
  const invalidMatching: Array<(q: MatchingQuestion) => void> = [
    q => { q.leftItems = q.leftItems.slice(0, 1) }, q => { q.rightItems.pop() }, q => { q.leftItems[0].label = ' ' },
    q => { q.rightItems[0].label = ' SCOTT ' }, q => { q.correctPairs.pop() },
    q => { q.correctPairs[0].leftId = q.correctPairs[1].leftId }, q => { q.correctPairs[0].rightId = q.correctPairs[1].rightId },
    q => { q.correctPairs[0].rightId = 'missing' }, q => { Object.assign(q, { scoringMode: 'wrong' }) },
    q => { q.leftItems[0].id = q.rightItems[0].id }, q => { Object.assign(q.correctPairs[0], { extra: true }) },
    q => { q.rightItems[0].label = 'x'.repeat(121) }, q => { q.leftItems = Array.from({ length: 9 }, (_, i) => ({ id: String(i), label: String(i) })) },
  ]
  it.each(invalidMatching.map((fn, i) => [i, fn] as const))('rejects malformed Matching %i', (_, mutate) => {
    const quiz = arrangementQuiz(); const q = matchingFixture(); mutate(q); quiz.questions = [q]
    expect(validateQuizSave(quiz).length).toBeGreaterThan(0)
  })
  it('displays a stable seed/ID-only permutation independently of authored order or paired row positions', () => {
    const q = orderingFixture(), before = structuredClone(q)
    for (const seed of ['session-a', 'session-b', 'reconnect']) {
      expect(shuffledTextItems(q.items, seed)).toEqual(shuffledTextItems([...q.items].reverse(), seed))
    }
    const orders = new Set(Array.from({ length: 20 }, (_, i) => shuffledTextItems(q.items, `session-${i}`).map(x => x.id).join()))
    expect(orders.size).toBeGreaterThan(5)
    expect(shuffledTextItems(q.items, 'session:left')).not.toEqual(shuffledTextItems(q.items, 'session:right'))
    expect(q).toEqual(before)
  })
})

describe('Arrangement scoring', () => {
  it('scores Ordering exactly and does not mutate its definition', () => {
    const q = orderingFixture(), before = structuredClone(q)
    expect(scoreQuestion(q, { type: 'ordering', itemIds: q.correctItemIds })).toEqual({ valid: true, correct: true, points: 1000 })
    expect(scoreQuestion(q, { type: 'ordering', itemIds: [...q.correctItemIds].reverse() })).toEqual({ valid: true, correct: false, points: 0 })
    expect(q).toEqual(before)
  })
  it.each([[], ['item-0'], ['item-0', 'item-0', 'item-2', 'item-3'], ['missing', 'item-1', 'item-2', 'item-3'], null, 'item-0'])('rejects invalid Ordering payload %j', (itemIds) => {
    expect(scoreQuestion(orderingFixture(), { type: 'ordering', itemIds } as PlayerAnswerPayload)).toMatchObject({ valid: false, points: 0 })
  })
  it.each(['exact', 'partial'] as const)('scores complete, half-correct and wrong Matching in %s mode', (mode) => {
    const q = { ...matchingFixture(), scoringMode: mode, points: 1001 }, before = structuredClone(q)
    expect(scoreQuestion(q, { type: 'matching', pairs: [...q.correctPairs].reverse() })).toEqual({ valid: true, correct: true, points: 1001 })
    const half = q.correctPairs.map((pair, i) => ({ ...pair, rightId: q.rightItems[i < 2 ? i : 5 - i].id }))
    expect(scoreQuestion(q, { type: 'matching', pairs: half })).toEqual({ valid: true, correct: false, points: mode === 'partial' ? 500 : 0 })
    expect(scoreQuestion(q, { type: 'matching', pairs: q.correctPairs.map((pair, i) => ({ ...pair, rightId: q.rightItems[(i + 1) % 4].id })) })).toEqual({ valid: true, correct: false, points: 0 })
    expect(q).toEqual(before)
  })
  it.each(['missing', 'duplicate-left', 'duplicate-right', 'unknown', 'extra-pair-field', 'extra-answer-field', 'wrong-type', 'null'])('rejects malformed Matching %s without points', (bad) => {
    const q = matchingFixture(); const answer: Record<string, unknown> = { type: 'matching', pairs: structuredClone(q.correctPairs) }
    const pairs = answer.pairs as typeof q.correctPairs
    if (bad === 'missing') pairs.pop()
    if (bad === 'duplicate-left') pairs[0].leftId = pairs[1].leftId
    if (bad === 'duplicate-right') pairs[0].rightId = pairs[1].rightId
    if (bad === 'unknown') pairs[0].rightId = 'missing'
    if (bad === 'extra-pair-field') Object.assign(pairs[0], { extra: true })
    if (bad === 'extra-answer-field') answer.extra = true
    if (bad === 'wrong-type') answer.type = 'ordering'
    if (bad === 'null') answer.pairs = null
    expect(scoreQuestion(q, answer as PlayerAnswerPayload)).toMatchObject({ valid: false, points: 0 })
  })
  it('rejects extra Ordering payload fields', () => {
    expect(scoreQuestion(orderingFixture(), { type: 'ordering', itemIds: orderingFixture().correctItemIds, extra: true } as PlayerAnswerPayload)).toMatchObject({ valid: false })
  })
})
