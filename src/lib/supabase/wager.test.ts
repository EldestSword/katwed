import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { SupabaseGameRepository } from './SupabaseGameRepository'
import { parseSafeGameState } from './safeGameState'
import { progressiveState } from '../../test/progressiveFixtures'
import { WAGER_PERCENTAGES } from '../../features/scoring/wager'

it.each(WAGER_PERCENTAGES)('sends %d with precisely one existing answer RPC and no preliminary request', async wagerPercent => {
  const rpc = vi.fn().mockResolvedValue({data:null,error:null})
  const repo = new SupabaseGameRepository({rpc} as unknown as SupabaseClient)
  const payload = {type:'typed-answer' as const,value:'Alex',wagerPercent}
  await repo.submitAnswer('123456','player','token',payload)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('submit_answer',{p_room_code:'123456',p_player_id:'player',p_reconnect_token:'token',p_answer:payload})
})
it('safe question accepts legacy/boolean flags and rejects malformed or H2H flags', () => {
  const state=progressiveState()
  expect(parseSafeGameState(state).currentQuestion?.wagerEnabled).toBeUndefined()
  for (const wagerEnabled of [false,true]) expect(parseSafeGameState({...state,currentQuestion:{...state.currentQuestion,wagerEnabled}}).currentQuestion?.wagerEnabled).toBe(wagerEnabled)
  for (const wagerEnabled of ['true',null,{},1]) expect(()=>parseSafeGameState({...state,currentQuestion:{...state.currentQuestion,wagerEnabled}})).toThrow('Invalid Wager setting')
  expect(()=>parseSafeGameState({...state,quizType:'head-to-head',currentQuestion:{...state.currentQuestion,wagerEnabled:true,progressiveRevealEnabled:false}})).toThrow('Wager is Standard-only')
})
