import { expect, it } from 'vitest'
import { calculateCorrectStreaks, normaliseStreaks, recomputePlayerStreaks } from './streaks'
import type { Player, PlayerAnswer } from '../../types/domain'

it.each([
  [[true,true,true],3,3], [[true,true,false],0,2], [[true,true,false,true],1,2],
  [[true,true,null,true,true,true],3,3], [[true,true,true,false,true,true],2,3], [[],0,0], [[undefined],0,0],
] as const)('calculates completed correctness history %j', (history,current,longest) => {
  expect(calculateCorrectStreaks(history)).toEqual({currentCorrectStreak:current,longestCorrectStreak:longest})
})
it('indexes authoritative order, ignores score and never mutates source data', () => {
  const players=[{id:'p',totalScore:-1500},{id:'missing'}] as Player[]
  const answers=[{playerId:'p',questionId:'q3',correct:true,pointsAwarded:-500},
    {playerId:'p',questionId:'q1',correct:true,pointsAwarded:0},
    {playerId:'p',questionId:'q2',correct:false,pointsAwarded:500}] as PlayerAnswer[]
  const original=structuredClone({players,answers})
  expect(recomputePlayerStreaks(players,answers,['q2','q1','q3'])).toMatchObject([
    {currentCorrectStreak:2,longestCorrectStreak:2,totalScore:-1500},{currentCorrectStreak:0,longestCorrectStreak:0},
  ])
  expect(recomputePlayerStreaks(players,answers,['q1'])).toMatchObject([{currentCorrectStreak:1},{currentCorrectStreak:0}])
  expect({players,answers}).toEqual(original)
})
it('normalises missing legacy values', () => expect(normaliseStreaks({})).toEqual({currentCorrectStreak:0,longestCorrectStreak:0}))
it.each([-1,1.5,'3',null,NaN,Infinity])('rejects malformed current streak %s', currentCorrectStreak => {
  expect(()=>normaliseStreaks({currentCorrectStreak,longestCorrectStreak:5})).toThrow(/streak/)
})
it.each([-1,1.5,'3',null,NaN,Infinity,1])('rejects malformed/inconsistent longest %s', longestCorrectStreak => {
  expect(()=>normaliseStreaks({currentCorrectStreak:2,longestCorrectStreak})).toThrow(/streak/)
})
