import { describe, expect, it } from 'vitest'
import { connectionStagePoints, connectionValidation, validConnectionClues } from './connections'
import { createQuestion } from './factories'
import { createDuplicateQuizInput } from '../quiz-editor/duplicateQuiz'
import { validateQuizSave } from '../quiz-editor/validation'
import { connectionsFixture, connectionsQuiz } from '../../test/connectionsFixtures'
import { scoreQuestion } from '../../utils/scoring'
import { calculateStandardQuestionScore } from '../scoring/standardScoring'
import type { PlayerAnswerPayload } from '../../types/domain'

describe('Connections definitions and clue-stage scoring', () => {
  it('creates a useful four-clue draft with fixed scoring', () => {
    const q = createQuestion('connections', 'quiz', 0)
    expect(q).toMatchObject({ prompt: 'What connects these clues?', timeLimitSeconds: 60, points: 1000, speedScoringEnabled: false, correctAnswer: '', acceptedAnswers: [] })
    if (q.type !== 'connections') throw new Error('fixture')
    expect(validConnectionClues(q.clues)).toBe(true)
    expect(connectionValidation(q)).toHaveLength(1)
  })
  it('duplicates clue IDs while preserving authored order and remapping rounds', () => {
    const quiz = connectionsQuiz(), copy = createDuplicateQuizInput(quiz), q = copy.questions[0]
    if (q.type !== 'connections') throw new Error('fixture')
    expect(q.clues.map(c => c.text)).toEqual(connectionsFixture().clues.map(c => c.text))
    expect(q.clues.every(c => !connectionsFixture().clues.some(old => old.id === c.id))).toBe(true)
    expect(q.roundId).toBe(copy.rounds![0].id)
    expect(validateQuizSave(copy)).toEqual([])
  })
  it.each(['few', 'many', 'blank', 'long', 'duplicate-id', 'duplicate-text', 'extra-field', 'blank-answer', 'many-alternatives', 'normalised-duplicate', 'meaningless-alternative'])('rejects %s', kind => {
    const q = connectionsFixture()
    if (kind === 'few') q.clues = q.clues.slice(0, 1)
    if (kind === 'many') q.clues = Array.from({ length: 7 }, (_, i) => ({ id: `${i}`, text: `${i}` }))
    if (kind === 'blank') q.clues[0].text = '\u00a0 '
    if (kind === 'long') q.clues[0].text = 'a'.repeat(201)
    if (kind === 'duplicate-id') q.clues[0].id = q.clues[1].id
    if (kind === 'duplicate-text') q.clues[0].text = ' VENUS '
    if (kind === 'extra-field') Object.assign(q.clues[0], { image: 'x' })
    if (kind === 'blank-answer') q.correctAnswer = '!!!'
    if (kind === 'many-alternatives') q.acceptedAnswers = Array.from({ length: 20 }, (_, i) => `a${i}`)
    if (kind === 'normalised-duplicate') q.acceptedAnswers = ['ＰＬＡＮＥＴＳ!']
    if (kind === 'meaningless-alternative') q.acceptedAnswers = ['!!!']
    expect(connectionValidation(q).length).toBeGreaterThan(0)
  })
  it.each([[2, [1000, 500]], [3, [1000, 666, 333]], [4, [1000, 750, 500, 250]], [5, [1000, 800, 600, 400, 200]], [6, [1000, 833, 666, 500, 333, 166]]] as const)('uses the exact %d-clue ladder', (count, expected) => {
    expect(Array.from({ length: count }, (_, i) => connectionStagePoints(1000, count, i + 1))).toEqual(expected)
    expect(Array.from({ length: count }, (_, i) => connectionStagePoints(999, count, i + 1))).toEqual(Array.from({ length: count }, (_, i) => Math.floor(999 * (count - i) / count)))
  })
  it.each([undefined, 0, 5, 1.5, NaN])('rejects missing/invalid trusted stage %s', count => {
    expect(scoreQuestion(connectionsFixture(), { type: 'connections', value: 'Planets' }, { revealedClueCount: count }).valid).toBe(false)
  })
  it.each([1, 2, 4])('scores a normalised correct answer at clue %d', count => {
    expect(scoreQuestion(connectionsFixture(), { type: 'connections', value: ' P-L A N E T S! ' }, { revealedClueCount: count })).toEqual({ valid: true, correct: true, points: [1000, 750, 500, 250][count - 1] })
  })
  it('matches alternatives, rejects incorrect guesses and ignores speed even on malformed data', () => {
    const q = { ...connectionsFixture(), speedScoringEnabled: true, doubleScore: true }
    const score = scoreQuestion(q, { type: 'connections', value: 'Planets of the Solar System' }, { revealedClueCount: 3 })
    expect(score).toEqual({ valid: true, correct: true, points: 500 })
    expect(calculateStandardQuestionScore(score.points, q, 59000, 60000)).toBe(1000)
    expect(scoreQuestion(q, { type: 'connections', value: 'Stars' }, { revealedClueCount: 1 })).toEqual({ valid: true, correct: false, points: 0 })
  })
  it.each([{ type: 'connections' }, { type: 'typed-answer', value: 'Planets' }, { type: 'connections', value: '' }, { type: 'connections', value: '!!!' }, { type: 'connections', value: 'a'.repeat(121) }, { type: 'connections', value: 7 }, { type: 'connections', value: 'Planets', revealedClueCount: 1 }])('rejects malformed player payload %#', value => {
    expect(scoreQuestion(connectionsFixture(), value as PlayerAnswerPayload, { revealedClueCount: 2 }).valid).toBe(false)
  })
  it('rejects Connections in H2H', () => {
    expect(validateQuizSave({ ...connectionsQuiz(), quizType: 'head-to-head' }).join(' ')).toContain('Connections is Standard-only')
  })
})
