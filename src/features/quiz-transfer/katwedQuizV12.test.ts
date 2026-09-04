import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, it } from 'vitest'
import { allWagerQuestions, wagerQuiz } from '../../test/wagerFixtures'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { headToHeadDemoQuiz } from '../../lib/demo/sampleData'
import { withoutBuzzFlag, withoutProgressiveFlag, withoutWagerFlag } from '../../test/legacyPortable'
import { exportQuizToPortable, KATWED_QUIZ_FORMAT_VERSION, KATWED_QUIZ_V11_FORMAT_VERSION, parseKatwedQuizJson } from './katwedQuizFormat'

const validate = new Ajv2020({ strict: false }).compile(JSON.parse(readFileSync('docs/schemas/katwed-quiz-v12.schema.json', 'utf8')))

it('round trips eligible Standard Buzz-In questions with Wager using explicit v12 fields', () => {
  const questions = allWagerQuestions().filter(question => question.type !== 'connections').map(question => ({ ...question, buzzInEnabled: true }))
  const source = wagerQuiz(questions)
  const file = exportQuizToPortable(source)
  expect(KATWED_QUIZ_FORMAT_VERSION).toBe(12)
  expect(KATWED_QUIZ_V11_FORMAT_VERSION).toBe(11)
  expect(validate(file), JSON.stringify(validate.errors)).toBe(true)
  expect(file.quiz.questions.every(question => question.buzzInEnabled && question.wagerEnabled)).toBe(true)
  const input = parseKatwedQuizJson(JSON.stringify(file)).input
  expect(input.questions.every(question => question.buzzInEnabled)).toBe(true)
  expect(JSON.stringify(file)).not.toMatch(/winnerPlayerId|claimedAt|answerDeadlineAt|reconnectToken|wagerPercent/)
})

it.each(['missing', 'string', 'null', 'extra', 'h2h', 'connections', 'progressive'] as const)('strictly rejects invalid v12 Buzz state: %s', kind => {
  const source = kind === 'h2h'
    ? structuredClone(headToHeadDemoQuiz)
    : kind === 'progressive'
      ? wagerQuiz([{ ...progressiveQuestion(), buzzInEnabled: false }])
      : wagerQuiz([allWagerQuestions().find(question => question.type === (kind === 'connections' ? 'connections' : 'true-false'))!])
  source.questions[0].buzzInEnabled = !['h2h', 'connections', 'progressive'].includes(kind)
  const file = exportQuizToPortable(source)
  const question = file.quiz.questions[0] as unknown as Record<string, unknown>
  if (kind === 'missing') delete question.buzzInEnabled
  if (kind === 'string') question.buzzInEnabled = 'true'
  if (kind === 'null') question.buzzInEnabled = null
  if (kind === 'extra') question.buzzWinner = 'player-id'
  if (kind === 'h2h') question.buzzInEnabled = true
  if (kind === 'connections') question.buzzInEnabled = true
  if (kind === 'progressive') { question.buzzInEnabled = true; question.progressiveRevealEnabled = true }
  expect(validate(file)).toBe(false)
  expect(() => parseKatwedQuizJson(JSON.stringify(file))).toThrow()
})

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])('imports historical v%d with Buzz-In false', version => {
  const source = wagerQuiz([allWagerQuestions().find(question => question.type === 'true-false')!])
  source.questions[0].wagerEnabled = false
  const current = exportQuizToPortable(source)
  let file = withoutBuzzFlag(current) as unknown as { formatVersion: number; quiz: Record<string, unknown> & { questions: Record<string, unknown>[] } }
  if (version < 11) file = withoutWagerFlag(current) as unknown as typeof file
  if (version < 10) file = withoutProgressiveFlag(current) as unknown as typeof file
  file.formatVersion = version
  if (version < 7) { delete file.quiz.rounds; file.quiz.questions.forEach(question => delete question.roundKey) }
  if (version < 5) delete file.quiz.soundPackId
  if (version < 4) { delete file.quiz.answerPaletteId; delete file.quiz.customAnswerColours }
  if (version < 3) file.quiz.questions.forEach(question => { delete question.doubleScore; delete question.speedScoringEnabled })
  const input = parseKatwedQuizJson(JSON.stringify(file)).input
  expect(input.questions[0].buzzInEnabled).toBe(false)
  expect(exportQuizToPortable({ ...source, ...input, id: input.rounds![0].quizId, rounds: input.rounds! }).formatVersion).toBe(12)
})
