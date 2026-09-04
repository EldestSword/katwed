import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, it } from 'vitest'
import { allWagerQuestions, wagerQuiz } from '../../test/wagerFixtures'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { headToHeadDemoQuiz } from '../../lib/demo/sampleData'
import { withoutWagerFlag, withoutProgressiveFlag } from '../../test/legacyPortable'
import { exportQuizToPortable, parseKatwedQuizJson, KATWED_QUIZ_V10_FORMAT_VERSION } from './katwedQuizFormat'
const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v11.schema.json','utf8')))

it('round trips all ten Standard types, Progressive, Double, Rounds and explicit wager flags', () => {
  const source = wagerQuiz([...allWagerQuestions(),{ ...progressiveQuestion(), doubleScore:true }])
  source.questions[1].wagerEnabled = false
  const file = exportQuizToPortable(source)
  expect(file.formatVersion).toBe(11); expect(KATWED_QUIZ_V10_FORMAT_VERSION).toBe(10)
  expect(validate(file),JSON.stringify(validate.errors)).toBe(true)
  const input = parseKatwedQuizJson(JSON.stringify(file)).input
  expect(input.questions.map(q => q.wagerEnabled)).toEqual(source.questions.map(q => q.wagerEnabled))
  expect(exportQuizToPortable({...source,...input,id:input.rounds![0].quizId,rounds:input.rounds!})).toEqual(file)
  expect(JSON.stringify(file)).not.toMatch(/wagerPercent|wagerStake|teamNames|playMode|sessionId|playerId/)
})
it.each(['missing','string','null','extra','nested','h2h'])('strictly rejects invalid v11 %s', kind => {
  const file = exportQuizToPortable(kind === 'h2h' ? headToHeadDemoQuiz : wagerQuiz())
  const q = file.quiz.questions[0]
  if (kind === 'missing') Reflect.deleteProperty(q,'wagerEnabled')
  if (kind === 'string') Object.assign(q,{wagerEnabled:'true'})
  if (kind === 'null') Object.assign(q,{wagerEnabled:null})
  if (kind === 'extra') Object.assign(q,{wagerPercent:50})
  if (kind === 'nested') Object.assign(q,{wager:{enabled:true}})
  if (kind === 'h2h') q.wagerEnabled = true
  expect(validate(file)).toBe(false)
  expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow()
})
it.each([1,2,3,4,5,6,7,8,9,10])('imports historical v%d with false and re-exports v11', version => {
  const source = wagerQuiz([allWagerQuestions().find(q => q.type === 'true-false')!]); source.questions[0].wagerEnabled = false
  const current = exportQuizToPortable(source)
  const file = (version === 10 ? withoutWagerFlag(current) : withoutProgressiveFlag(current)) as unknown as {formatVersion:number;quiz:Record<string,unknown>&{questions:Record<string,unknown>[]}}
  file.formatVersion = version
  if (version < 7) { delete file.quiz.rounds; for (const q of file.quiz.questions) delete q.roundKey }
  if (version < 5) delete file.quiz.soundPackId
  if (version < 4) { delete file.quiz.answerPaletteId; delete file.quiz.customAnswerColours }
  if (version < 3) for (const q of file.quiz.questions) { delete q.doubleScore; delete q.speedScoringEnabled }
  const input = parseKatwedQuizJson(JSON.stringify(file)).input
  expect(input.questions[0].wagerEnabled).toBe(false)
  expect(exportQuizToPortable({...source,...input,id:input.rounds![0].quizId,rounds:input.rounds!}).formatVersion).toBe(11)
  Object.assign(file.quiz.questions[0],{wagerEnabled:false})
  expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow(/unsupported field/)
})
