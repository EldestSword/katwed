import { expect, it } from 'vitest'
import { applyWager, extractWager, isWagerPercent, WAGER_PERCENTAGES, wagerStake } from './wager'
import { allWagerQuestions, correctPayload } from '../../test/wagerFixtures'
import { scoreQuestion } from '../../utils/scoring'
import type { PlayerAnswerPayload } from '../../types/domain'
import { validateQuestion, validateQuizSave } from '../quiz-editor/validation'
import { createQuestion } from '../questions/factories'
import { headToHeadDemoQuiz, mixedDemoQuiz } from '../../lib/demo/sampleData'
import { createDuplicateQuizInput } from '../quiz-editor/duplicateQuiz'
import { moveQuestionToRound } from '../quiz-editor/rounds'
import { wagerQuiz } from '../../test/wagerFixtures'

it('uses exact integer stakes without mutating input', () => {
  expect(WAGER_PERCENTAGES.map(p => wagerStake(999, p))).toEqual([0, 249, 499, 999])
  expect(WAGER_PERCENTAGES.map(p => wagerStake(1000, p))).toEqual([0, 250, 500, 1000])
  expect(wagerStake(Number.MAX_SAFE_INTEGER, 25)).toBe(2251799813685247)
})
it.each([[820,1000,true,50,1320],[0,1000,false,50,-500],[1250,1000,true,50,1750],[500,1000,false,50,0],[250,1000,false,100,-750],[2000,1000,true,100,3000]] as const)('applies last: %d, %d, %s, %d → %d', (ordinary, base, correct, percent, expected) => {
  expect(applyWager(ordinary,base,correct,percent)).toBe(expected)
})
it.each(WAGER_PERCENTAGES)('accepts %d and strips only wager metadata', percent => {
  const payload = Object.freeze({ type: 'true-false' as const, value: true, wagerPercent: percent })
  expect(isWagerPercent(percent)).toBe(true)
  expect(extractWager(payload, true)).toEqual({ answer: { type: 'true-false', value: true }, percent })
  expect(payload.wagerPercent).toBe(percent)
})
it.each([10,33,75,200,-25,25.5,'50',null,{},[],true,undefined,NaN])('rejects invalid explicit percent %j', value => {
  expect(isWagerPercent(value)).toBe(false)
  expect(extractWager({ type: 'true-false', value: true, wagerPercent: value } as PlayerAnswerPayload,true)).toBeNull()
})
it('defaults missing metadata to zero and rejects nonzero on ordinary questions', () => {
  expect(extractWager({ type: 'true-false', value: true },false)?.percent).toBe(0)
  expect(extractWager({ type: 'true-false', value: true, wagerPercent: 0 },false)?.percent).toBe(0)
  expect(extractWager({ type: 'true-false', value: true, wagerPercent: 25 },false)).toBeNull()
})
it.each(allWagerQuestions().map(q => [q.type, q] as const))('%s keeps core scoring and exact payload validation', (_type, q) => {
  const payload = correctPayload(q), before = structuredClone(q)
  const ordinary = scoreQuestion(q,payload,{ revealedClueCount: 1 })
  expect(scoreQuestion(q,{ ...payload, wagerPercent: 50 },{ revealedClueCount: 1 })).toEqual(ordinary)
  expect(scoreQuestion(q,{ ...payload, wagerPercent: 50, wager: { amount: 1000 } } as unknown as PlayerAnswerPayload,{ revealedClueCount: 1 }).valid).toBe(false)
  expect(q).toEqual(before)
  expect(validateQuestion({ ...q, wagerEnabled: 'yes' } as unknown as typeof q,mixedDemoQuiz.roster).valid).toBe(false)
  expect(createQuestion(q.type, q.quizId, 0).wagerEnabled).toBe(false)
})
it('accepts Standard flags but rejects Head-to-Head wagers', () => {
  expect(validateQuizSave(mixedDemoQuiz)).toEqual([])
  const h2h = structuredClone(headToHeadDemoQuiz)
  expect(validateQuizSave(h2h)).toEqual([])
  h2h.questions[0].wagerEnabled = true
  expect(validateQuizSave(h2h).join(' ')).toContain('Wager is Standard-only')
})
it('preserves the modifier through quiz duplication and round moves', () => {
  const source = wagerQuiz(allWagerQuestions())
  const copy = createDuplicateQuizInput(source)
  expect(copy.questions.every(q=>q.wagerEnabled)).toBe(true)
  source.rounds.push({...source.rounds[0],id:'next',title:'Next',displayOrder:1})
  const moved=moveQuestionToRound(source,source.questions[0].id,'next')
  expect(moved.questions.find(q=>q.id===source.questions[0].id)).toMatchObject({wagerEnabled:true,roundId:'next'})
})
