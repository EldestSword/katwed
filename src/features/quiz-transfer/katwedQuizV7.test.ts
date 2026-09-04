import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { exportQuizToPortable, parseKatwedQuizJson } from './katwedQuizFormat'
import type { Quiz } from '../../types/domain'

const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v7.schema.json', 'utf8')))
function fixture() {
  const quiz = structuredClone(mixedDemoQuiz)
  quiz.rounds.push({ id: 'second', quizId: quiz.id, displayOrder: 1, title: 'The finale', subtitle: 'Nearly there', introEnabled: true })
  quiz.questions = quiz.questions.map((q, index) => ({ ...q, roundId: index < 3 ? quiz.id : 'second' }))
  return quiz
}
describe('portable Core Rounds v7', () => {
  it('round trips ordered metadata, memberships and every v6 Pinpoint shape', () => {
    for (const target of [
      { kind: 'circle' as const, x: .5, y: .5, radius: .1 },
      { kind: 'rectangle' as const, x: .1, y: .2, width: .3, height: .4 },
      { kind: 'polygon' as const, points: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .5, y: .9 }] },
    ]) {
      const quiz = fixture()
      const pinpoint = quiz.questions.find((q) => q.type === 'pinpoint')!; pinpoint.target = target
      const portable = exportQuizToPortable(quiz)
      expect(portable.formatVersion).toBe(9)
      expect(validate({ ...portable, formatVersion: 7 }), JSON.stringify(validate.errors)).toBe(true)
      expect(portable.quiz.rounds.map((r) => r.key)).toEqual(['round-1', 'round-2'])
      const parsed = parseKatwedQuizJson(JSON.stringify({ ...portable, formatVersion: 7 })).input
      const copy: Quiz = { ...quiz, ...parsed, id: parsed.rounds![0].quizId, rounds: parsed.rounds! }
      expect(exportQuizToPortable(copy)).toEqual(portable)
      expect(copy.rounds.every((r) => !quiz.rounds.some((old) => old.id === r.id))).toBe(true)
      expect(copy.questions.find((q) => q.type === 'pinpoint')).toMatchObject({ target })
    }
  })
  it.each([
    (file: ReturnType<typeof exportQuizToPortable>) => { file.quiz.rounds = [] },
    (file: ReturnType<typeof exportQuizToPortable>) => { file.quiz.rounds[1].key = file.quiz.rounds[0].key },
    (file: ReturnType<typeof exportQuizToPortable>) => { file.quiz.questions[0].roundKey = 'missing' },
    (file: ReturnType<typeof exportQuizToPortable>) => { delete (file.quiz.questions[0] as { roundKey?: string }).roundKey },
    (file: ReturnType<typeof exportQuizToPortable>) => { file.quiz.rounds[0].title = ' ' },
    (file: ReturnType<typeof exportQuizToPortable>) => { file.quiz.rounds[0].subtitle = 'x'.repeat(201) },
    (file: ReturnType<typeof exportQuizToPortable>) => { Object.assign(file.quiz.rounds[0], { timer: 10 }) },
    (file: ReturnType<typeof exportQuizToPortable>) => { Object.assign(file.quiz.rounds[0], { introEnabled: 'yes' }) },
  ])('rejects invalid round structure %i', (mutate) => {
    const file = exportQuizToPortable(fixture()); mutate(file)
    expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow()
  })
  it.each([1, 2, 3, 4, 5, 6])('gives legacy v%d files one silent round without losing target data', (version) => {
    const raw = exportQuizToPortable(mixedDemoQuiz) as unknown as { formatVersion: number; quiz: Record<string, unknown> & { questions: Array<Record<string, unknown>> } }
    raw.formatVersion = version
    delete raw.quiz.rounds
    if (version < 5) delete raw.quiz.soundPackId
    if (version < 4) { delete raw.quiz.answerPaletteId; delete raw.quiz.customAnswerColours }
    if (version === 1) raw.quiz.questions = raw.quiz.questions.filter((q) => q.type !== 'typed-answer')
    for (const q of raw.quiz.questions) {
      delete q.roundKey
      if (version < 3) { delete q.speedScoringEnabled; delete q.doubleScore }
      if (version < 6 && q.type === 'pinpoint') {
        const target = q.target as { x: number; y: number; radius: number }
        Object.assign(q, { targetX: target.x, targetY: target.y, targetRadius: target.radius }); delete q.target
      }
    }
    const imported = parseKatwedQuizJson(JSON.stringify(raw)).input
    expect(imported.rounds).toHaveLength(1)
    expect(imported.rounds![0]).toMatchObject({ title: 'Round 1', subtitle: '', introEnabled: false })
    expect(imported.questions.every((q) => q.roundId === imported.rounds![0].id)).toBe(true)
    expect(imported.questions.find((q) => q.type === 'pinpoint')).toMatchObject({ target: { kind: 'circle', x: .5, y: .43, radius: .12 } })
  })
})
