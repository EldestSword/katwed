import { expect,it,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { progressiveState } from '../../test/progressiveFixtures'
import { parseSafeGameState } from './safeGameState'
import { SupabaseGameRepository } from './SupabaseGameRepository'

it('keeps private inventory out of room state, while accepting default-off and public capability',()=>{
  const raw=progressiveState()
  expect(parseSafeGameState(raw).sessionSettings?.powerUpsEnabled).toBe(false)
  expect(parseSafeGameState({...raw,sessionSettings:{...raw.sessionSettings,powerUpsEnabled:true,powerUpRunId:'run'}}).sessionSettings?.powerUpsEnabled).toBe(true)
  expect(()=>parseSafeGameState({...raw,powerUps:{uses:[]}})).toThrow(/Private/)
  expect(()=>parseSafeGameState({...raw,players:[{...raw.players[0],powerUpUses:[]}]})).toThrow(/Private/)
  expect(()=>parseSafeGameState({...raw,quizType:'head-to-head',sessionSettings:{...raw.sessionSettings,powerUpsEnabled:true}})).toThrow(/Head-to-Head/)
})
it('uses one explicit authenticated activation call and parses personal reconnect state',async()=>{
  const personal={runId:'run',uses:[{questionId:'q',powerUp:'fifty-fifty',optionIds:['a','b']}]}
  const rpc=vi.fn().mockResolvedValueOnce({data:personal,error:null}).mockResolvedValueOnce({data:{player:{id:'p'},reconnectToken:'token',powerUps:personal},error:null})
  const repo=new SupabaseGameRepository({rpc} as unknown as SupabaseClient)
  expect(await repo.activateFiftyFifty('123456','p','token','q')).toEqual(personal)
  expect(rpc).toHaveBeenCalledWith('activate_fifty_fifty',{p_room_code:'123456',p_player_id:'p',p_reconnect_token:'token',p_question_id:'q'})
  expect((await repo.reconnectPlayer({roomCode:'123456',playerId:'p',nickname:'Carol',reconnectToken:'token'}))?.powerUps).toEqual(personal)
  expect(rpc).toHaveBeenCalledTimes(2)
})
