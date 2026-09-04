import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { connectionsQuiz } from '../../test/connectionsFixtures'
import { arrangementQuiz } from '../../test/arrangementFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { exportQuizToPortable, parseKatwedQuizJson } from './katwedQuizFormat'
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v9.schema.json', 'utf8')))

describe('Portable Connections v9', () => {
  it('round trips Connections with v8 questions, Pinpoint and Rounds, excluding session settings', () => {
    const source = connectionsQuiz()
    source.questions.push(...arrangementQuiz().questions, { ...mixedDemoQuiz.questions.find(q => q.type === 'pinpoint')!, displayOrder: 3 })
    const file = exportQuizToPortable(source)
    expect(file.formatVersion).toBe(9); expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
    const input = parseKatwedQuizJson(JSON.stringify(file)).input
    expect(exportQuizToPortable({ ...source, ...input, id: input.rounds![0].quizId, rounds: input.rounds! })).toEqual(file)
    const q = input.questions[0]
    if (q.type !== 'connections') throw new Error('fixture')
    expect(q.clues[0].id).not.toBe('clue-1'); expect(q.clues.map(c => c.text)).toEqual(['Mercury', 'Venus', 'Earth', 'Mars'])
    expect(JSON.stringify(file)).not.toMatch(/connectionClueCount|revealedClueCount|playMode|teamNames/)
  })
  it.each(['few', 'many', 'duplicate-key', 'duplicate-text', 'long', 'extra', 'duplicate-answer', 'h2h', 'progress'])('rejects %s', kind => {
    const file = exportQuizToPortable(connectionsQuiz()), q = file.quiz.questions[0]
    if (q.type !== 'connections') throw new Error('fixture')
    if (kind === 'few') { q.clues.pop(); q.clues.pop(); q.clues.pop() }
    if (kind === 'many') q.clues.push(...q.clues)
    if (kind === 'duplicate-key') q.clues[0].key = q.clues[1].key
    if (kind === 'duplicate-text') q.clues[0].text = ' VENUS '
    if (kind === 'long') q.clues[0].text = 'x'.repeat(201)
    if (kind === 'extra') Object.assign(q.clues[0], { hidden: 'x' })
    if (kind === 'duplicate-answer') q.acceptedAnswers = ['P-L-A-N-E-T-S']
    if (kind === 'h2h') file.quiz.quizType = 'head-to-head'
    if (kind === 'progress') Object.assign(q, { revealedClueCount: 3 })
    expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow()
  })
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('rejects Connections in historical v%d', formatVersion => {
    expect(() => parseKatwedQuizJson(JSON.stringify({ ...exportQuizToPortable(connectionsQuiz()), formatVersion }))).toThrow()
  })
  it('imports v8 Ordering/Matching and re-exports v9', () => {
    const source = arrangementQuiz(), file = { ...exportQuizToPortable(source), formatVersion: 8 }
    const input = parseKatwedQuizJson(JSON.stringify(file)).input
    expect(exportQuizToPortable({ ...source, ...input, id: input.rounds![0].quizId, rounds: input.rounds! }).formatVersion).toBe(9)
  })
})
