import type {SupabaseClient} from '@supabase/supabase-js'
import {expect,it,vi} from 'vitest'
import {SupabaseGameRepository} from './SupabaseGameRepository'
import {parseSafeGameState} from './safeGameState'
import {streakState,streakPlayer} from '../../test/streakFixtures'
import {KATWED_QUIZ_FORMAT_VERSION,exportQuizToPortable,parseKatwedQuizJson} from '../../features/quiz-transfer/katwedQuizFormat'
import {wagerQuiz} from '../../test/wagerFixtures'

it.each(['question','locked','reveal'] as const)('accepts prior streaks but still withholds current scores in %s',phase=>{
  const state=streakState(phase,4);state.players=state.players.map(p=>({...p,totalScore:0,correctAnswerCount:0,totalCorrectResponseMs:0}))
  expect(parseSafeGameState(state).players[0].currentCorrectStreak).toBe(4)
  state.players[0].totalScore=100;expect(()=>parseSafeGameState(state)).toThrow(/totals/)
})
it('normalises absent fields in legacy players/individual entries without mutation',()=>{
  const state=streakState('leaderboard');delete state.players[0].currentCorrectStreak;delete state.players[0].longestCorrectStreak
  const copy=structuredClone(state),parsed=parseSafeGameState(state)
  expect(parsed.players[0]).toMatchObject({currentCorrectStreak:0,longestCorrectStreak:0})
  expect(parsed.leaderboard[0]).toMatchObject({currentCorrectStreak:0,longestCorrectStreak:0});expect(state).toEqual(copy)
})
it.each([{currentCorrectStreak:-1},{currentCorrectStreak:'3'},{currentCorrectStreak:2.5},{currentCorrectStreak:null},{longestCorrectStreak:1}])('rejects malformed server statistics %j',bad=>{
  const state=streakState('leaderboard')
  expect(()=>parseSafeGameState({...state,players:[{...state.players[0],...bad}]})).toThrow(/streak/)
  expect(()=>parseSafeGameState({...state,leaderboard:[{...state.leaderboard[0],currentCorrectStreak:3,longestCorrectStreak:3,...bad}]})).toThrow(/streak/)
})
it('rejects nonzero Head-to-Head statistics',()=>expect(()=>parseSafeGameState({...streakState('leaderboard'),quizType:'head-to-head'})).toThrow(/Head-to-Head/))
it('normalises joins and reconnects with no extra RPC',async()=>{
  const p=streakPlayer();delete p.currentCorrectStreak;delete p.longestCorrectStreak
  const rpc=vi.fn().mockResolvedValue({data:{player:p,reconnectToken:'token'},error:null})
  const repo=new SupabaseGameRepository({rpc} as unknown as SupabaseClient)
  expect((await repo.joinRoom('123456','Carol')).player).toMatchObject({currentCorrectStreak:0,longestCorrectStreak:0})
  expect(rpc).toHaveBeenCalledTimes(1)
  expect((await repo.reconnectPlayer({roomCode:'123456',playerId:'carol',nickname:'Carol',reconnectToken:'token'}))?.player.currentCorrectStreak).toBe(0)
  expect(rpc).toHaveBeenCalledTimes(2)
})
it('keeps portable version 12 and excludes runtime streaks',()=>{
  expect(KATWED_QUIZ_FORMAT_VERSION).toBe(12)
  const exported=exportQuizToPortable(wagerQuiz())
  expect(JSON.stringify(exported)).not.toMatch(/streak/i)
  expect(parseKatwedQuizJson(JSON.stringify(exported))).toBeTruthy()
})
