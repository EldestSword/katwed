import { beforeEach, expect, it } from 'vitest'
import { allWagerQuestions, correctPayload } from '../test/wagerFixtures'
import { loadSubmittedAnswer, saveSubmittedAnswer } from './playerSession'

beforeEach(() => localStorage.clear())
it.each(allWagerQuestions().map(q => ({ type:q.type, payload:correctPayload(q) })))('restores $type submitted wagers and old answers', ({payload}) => {
  for (const wager of [{},{wagerPercent:0 as const},{wagerPercent:25 as const},{wagerPercent:50 as const},{wagerPercent:100 as const}]) {
    const answer = {...payload,...wager}
    saveSubmittedAnswer('p','q','open',answer)
    expect(loadSubmittedAnswer('p','q','open')).toEqual(answer)
    expect(loadSubmittedAnswer('p','q','restart')).toBeNull()
  }
})
it.each([null,'50',10,75,25.5,-25,200,{},[],true])('rejects malformed local wager %j', wagerPercent => {
  localStorage.setItem('katwed.answer.p.q.open',JSON.stringify({type:'connections',value:'Planets',wagerPercent}))
  expect(loadSubmittedAnswer('p','q','open')).toBeNull()
})
it('rejects nested wager objects and preserves strict Matching pairs', () => {
  for (const payload of [{type:'typed-answer',value:'Alex',wager:{percent:50}}, {type:'matching',pairs:[{leftId:'a',rightId:'b',wagerPercent:100},{leftId:'c',rightId:'d'}],wagerPercent:50}]) {
    localStorage.setItem('katwed.answer.p.q.open',JSON.stringify(payload))
    expect(loadSubmittedAnswer('p','q','open')).toBeNull()
  }
})
