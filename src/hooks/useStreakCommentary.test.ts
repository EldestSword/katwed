import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { streakState } from '../test/streakFixtures'
import type { SafeGameState } from '../types/domain'
import { useStreakCommentary } from './useStreakCommentary'

it('announces once from pre-transition values, not repeated polls',()=>{
  const {result,rerender}=renderHook(useStreakCommentary,{initialProps:streakState('question',2)})
  for(const phase of ['locked','reveal'] as const){rerender(streakState(phase,2));expect(result.current).toBeNull()}
  rerender(streakState('leaderboard',3)); const first=result.current
  expect(first?.streak).toBe(3)
  rerender(structuredClone(streakState('leaderboard',3))); expect(result.current).toBe(first)
  rerender(streakState('leaderboard',0)); expect(result.current).toBeNull()
  rerender(streakState('leaderboard',3)); expect(result.current).toBeNull()
})
it('does not invent a milestone on refresh or a late correction without a baseline',()=>{
  const {result,rerender}=renderHook(useStreakCommentary,{initialProps:streakState('leaderboard',5,5)})
  expect(result.current).toBeNull(); rerender(streakState('leaderboard',10,5)); expect(result.current).toBeNull()
})
it('retains useful history across Round Intro and the next opening',()=>{
  const {result,rerender}=renderHook(useStreakCommentary,{initialProps:streakState('question',2)})
  rerender(streakState('leaderboard',3)); expect(result.current?.streak).toBe(3)
  rerender({...streakState('round-intro',3),currentQuestion:null,questionOpenedAt:null}); expect(result.current).toBeNull()
  rerender(streakState('question',3,4)); rerender(streakState('leaderboard',4,4)); expect(result.current).toBeNull()
  rerender(streakState('question',4,5)); rerender(streakState('leaderboard',5,5)); expect(result.current?.streak).toBe(5)
})
it.each(['session','lobby','closed','finished','h2h','missing'] as const)('clears memory for %s',kind=>{
  const {result,rerender}=renderHook(useStreakCommentary,{initialProps:streakState('question',4,5) as SafeGameState|null})
  const next=streakState('leaderboard',5,5)
  if(kind==='session')next.sessionId='new'; if(kind==='lobby')next.phase='lobby'; if(kind==='closed')next.status='closed'
  if(kind==='finished')next.phase='finished';if(kind==='h2h')next.quizType='head-to-head'
  rerender(kind==='missing'?null:next);expect(result.current).toBeNull()
  rerender(streakState('leaderboard',5,5));expect(result.current).toBeNull()
})
it('requires matching question identity/opening and valid timestamps',()=>{
  const {result,rerender}=renderHook(useStreakCommentary,{initialProps:streakState('question',4,5)})
  rerender({...streakState('leaderboard',5,5),questionOpenedAt:'2026-09-04T13:00:00Z'});expect(result.current).toBeNull()
  rerender({...streakState('question',4,5),questionOpenedAt:'bad'});rerender({...streakState('leaderboard',5,5),questionOpenedAt:'bad'});expect(result.current).toBeNull()
})
it('suppresses corrected leaderboard scores without restarting a milestone',()=>{
  const {result,rerender}=renderHook(useStreakCommentary,{initialProps:streakState('question',2)})
  rerender(streakState('leaderboard',3)); expect(result.current).not.toBeNull()
  const correction=streakState('leaderboard',3);correction.leaderboard[0].totalScore+=1
  rerender(correction); expect(result.current).toBeNull()
})
