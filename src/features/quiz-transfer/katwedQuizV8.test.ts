import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { arrangementQuiz } from '../../test/arrangementFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { exportQuizToPortable, parseKatwedQuizJson } from './katwedQuizFormat'
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v8.schema.json', 'utf8')))

describe('Portable Ordering/Matching v8', () => {
  it.each(['exact', 'partial'] as const)('round trips Ordering and %s Matching with Pinpoint and Rounds, remapping all IDs', (mode) => {
    const quiz = arrangementQuiz()
    if (quiz.questions[1].type === 'matching') quiz.questions[1].scoringMode = mode
    quiz.rounds.push({ ...quiz.rounds[0], id: 'final-round', title: 'Final round', introEnabled: true, displayOrder: 1 })
    quiz.questions.push({ ...mixedDemoQuiz.questions.find(q => q.type === 'pinpoint')!, roundId: 'final-round', displayOrder: 2 })
    const file = exportQuizToPortable(quiz)
    expect(file.formatVersion).toBe(8); expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
    const parsed = parseKatwedQuizJson(JSON.stringify(file)).input
    const copy = { ...quiz, ...parsed, id: parsed.rounds![0].quizId, rounds: parsed.rounds! }
    expect(exportQuizToPortable(copy)).toEqual(file)
    expect(parsed.questions[0].id).not.toBe(quiz.questions[0].id)
    if (parsed.questions[0].type === 'ordering') expect(parsed.questions[0].items[0].id).not.toBe('item-0')
    expect(JSON.stringify(file)).not.toMatch(/teamId|playMode|teamAssignment|teamNames/)
  })
  it.each(['order-missing', 'order-duplicate', 'order-unknown', 'label-duplicate', 'item-field', 'pair-field', 'pair-missing', 'pair-duplicate', 'mode', 'team-field'])('rejects %s strictly', (kind) => {
    const file = exportQuizToPortable(arrangementQuiz()), order = file.quiz.questions[0], match = file.quiz.questions[1]
    if (order.type !== 'ordering' || match.type !== 'matching') throw new Error('fixture')
    if (kind === 'order-missing') order.correctItemKeys.pop()
    if (kind === 'order-duplicate') order.correctItemKeys[0] = order.correctItemKeys[1]
    if (kind === 'order-unknown') order.correctItemKeys[0] = 'unknown'
    if (kind === 'label-duplicate') order.items[0].label = ' BRAVO '
    if (kind === 'item-field') Object.assign(order.items[0], { image: 'x' })
    if (kind === 'pair-field') Object.assign(match.correctPairs[0], { extra: 'x' })
    if (kind === 'pair-missing') match.correctPairs.pop()
    if (kind === 'pair-duplicate') match.correctPairs[0].rightKey = match.correctPairs[1].rightKey
    if (kind === 'mode') Object.assign(match, { scoringMode: 'partial-wipeout' })
    if (kind === 'team-field') Object.assign(file.quiz, { playMode: 'teams' })
    expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow()
  })
  it.each([1, 2, 3, 4, 5, 6, 7])('rejects new types in legacy v%d without changing its schema', (formatVersion) => {
    const file = exportQuizToPortable(arrangementQuiz())
    expect(() => parseKatwedQuizJson(JSON.stringify({ ...file, formatVersion }))).toThrow()
  })
})
