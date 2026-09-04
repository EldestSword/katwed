import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, it } from 'vitest'
import { progressiveQuiz } from '../../test/progressiveFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { arrangementQuiz } from '../../test/arrangementFixtures'
import { connectionsFixture } from '../../test/connectionsFixtures'
import { withoutProgressiveFlag } from '../../test/legacyPortable'
import { exportQuizToPortable, parseKatwedQuizJson } from './katwedQuizFormat'
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v10.schema.json', 'utf8')))

it('round trips all types, image settings, explicit flags, Double Score and rounds without session data', () => {
  const source = progressiveQuiz()
  source.questions.push(...mixedDemoQuiz.questions, ...arrangementQuiz().questions, connectionsFixture())
  source.questions = source.questions.map((q, i) => ({ ...q, displayOrder: i, roundId: source.rounds[0].id }))
  source.questions[0].doubleScore = true
  const file = exportQuizToPortable(source)
  expect(file.formatVersion).toBe(10)
  expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
  const input = parseKatwedQuizJson(JSON.stringify(file)).input
  expect(input.questions[0]).toMatchObject({ progressiveRevealEnabled: true, doubleScore: true, media: source.questions[0].media })
  expect(input.questions.slice(1).every(q => q.progressiveRevealEnabled === false)).toBe(true)
  expect(exportQuizToPortable({ ...source, ...input, id: input.rounds![0].quizId, rounds: input.rounds! })).toEqual(file)
  expect(JSON.stringify(file)).not.toMatch(/sessionId|questionOpenedAt|availablePoints|revealedClueCount|playMode|teamNames/)
})
it.each(['missing', 'string', 'immediate', 'duration', 'timer', 'media', 'h2h', 'connections', 'pinpoint'] as const)('rejects invalid v10 %s', kind => {
  const source = progressiveQuiz()
  if (kind === 'connections') source.questions[0] = { ...connectionsFixture(), media: source.questions[0].media }
  if (kind === 'pinpoint') source.questions[0] = { ...mixedDemoQuiz.questions.find(q => q.type === 'pinpoint')!, progressiveRevealEnabled: false }
  const file = exportQuizToPortable(source), q = file.quiz.questions[0]
  if (kind === 'connections' || kind === 'pinpoint') q.progressiveRevealEnabled = true
  if (kind === 'missing') Reflect.deleteProperty(q, 'progressiveRevealEnabled')
  if (kind === 'string') Object.assign(q, { progressiveRevealEnabled: 'true' })
  if (kind === 'immediate') Object.assign(q.media!, { revealEffect: 'immediate' })
  if (kind === 'duration') Object.assign(q.media!, { revealDurationSeconds: 0 })
  if (kind === 'timer') q.timeLimitSeconds = 10
  if (kind === 'media') q.media = { type: 'none' }
  if (kind === 'h2h') file.quiz.quizType = 'head-to-head'
  expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow()
  if (kind !== 'timer') expect(validate(file)).toBe(false)
})
it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('preserves import v%d with default false, and rejects smuggled modifier fields', version => {
  const source = { ...structuredClone(mixedDemoQuiz), questions: mixedDemoQuiz.questions.filter(q => q.type === 'true-false') }
  const file = withoutProgressiveFlag(exportQuizToPortable(source)) as unknown as { formatVersion: number; quiz: Record<string, unknown> & { questions: Array<Record<string, unknown>> } }
  file.formatVersion = version
  if (version < 7) { delete file.quiz.rounds; for (const q of file.quiz.questions) delete q.roundKey }
  if (version < 5) delete file.quiz.soundPackId
  if (version < 4) { delete file.quiz.answerPaletteId; delete file.quiz.customAnswerColours }
  if (version < 3) for (const q of file.quiz.questions) { delete q.doubleScore; delete q.speedScoringEnabled }
  const input = parseKatwedQuizJson(JSON.stringify(file)).input
  expect(input.questions[0].progressiveRevealEnabled).toBe(false)
  Object.assign(file.quiz.questions[0], { progressiveRevealEnabled: false })
  expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow(/unsupported field/)
})
