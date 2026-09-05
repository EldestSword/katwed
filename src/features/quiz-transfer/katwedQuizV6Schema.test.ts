import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { exportQuizToPortable } from './katwedQuizFormat'
import { withoutProgressiveFlag } from '../../test/legacyPortable'

const ajv = new Ajv2020({ strict: false })
const validate = ajv.compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v6.schema.json', 'utf8')))

describe('portable v6 schema', () => {
  it('validates complete exports with all three target variants', () => {
    const exported = withoutProgressiveFlag(exportQuizToPortable(mixedDemoQuiz))
    const { rounds, ...quiz } = exported.quiz
    expect(rounds).toHaveLength(1)
    const file = { ...exported, formatVersion: 6, quiz: { ...quiz, questions: quiz.questions.map(({ roundKey, ...question }) => { expect(roundKey).toBeTruthy(); return question }) } }
    expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
    const question = file.quiz.questions.find((q) => q.type === 'pinpoint')!
    if (question.type !== 'pinpoint') throw new Error('Missing fixture')
    question.target = { kind: 'rectangle', x: .2, y: .3, width: .4, height: .5 }
    expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
    question.target = { kind: 'polygon', points: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .5, y: .9 }] }
    expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
    Object.assign(question.target, { unexpected: 'value' })
    expect(validate(file)).toBe(false)
  })
})
