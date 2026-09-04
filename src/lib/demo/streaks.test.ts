import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DemoGameRepository} from './DemoGameRepository'
import {allWagerQuestions,correctPayload,wagerQuiz} from '../../test/wagerFixtures'
import {progressiveQuestion} from '../../test/progressiveFixtures'
import {matchingFixture} from '../../test/arrangementFixtures'
import {connectionsFixture} from '../../test/connectionsFixtures'
import {defaultLaunchGameSettings} from '../../features/game/launchSettings'
import type {PlayerAnswerPayload,Question,Quiz} from '../../types/domain'
import {parseSafeGameState} from '../supabase/safeGameState'

beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-04T15:00:00Z'))})
afterEach(()=>vi.useRealTimers())
const typed=():Question=>({...progressiveQuestion(),progressiveRevealEnabled:false,speedScoringEnabled:false,media:{type:'none'}})
async function setup(questions:Question[],teams=false,round=false){
  const repo=new DemoGameRepository(),input=wagerQuiz(questions)
  if(round){input.rounds.push({...input.rounds[0],id:'round-two',title:'Round 2',displayOrder:1,introEnabled:true});input.questions[1].roundId='round-two'}
  const quiz=await repo.saveQuiz(input),session=await repo.launchGame(quiz.id,{...defaultLaunchGameSettings(quiz),soundPackId:'none',autoLockWhenAllAnswered:false,
    playMode:teams?'teams':'individual',teamNames:['Blue','Red'],teamAssignmentMode:'balanced-random'})
  const player=await repo.joinRoom(session.roomCode,'Carol'),missing=await repo.joinRoom(session.roomCode,'Missing')
  const action=(kind:Parameters<DemoGameRepository['changePhase']>[1])=>repo.changePhase(session.id,kind)
  const safe=async()=>parseSafeGameState(await repo.getSafeGameState(session.roomCode))
  const host=async()=>(await repo.getHostSession(session.id))!.session
  const stats=async()=>{const p=(await host()).players[0];return [p.currentCorrectStreak,p.longestCorrectStreak]}
  const open=async()=>vi.setSystemTime(Date.parse((await safe()).questionOpenedAt!)+10000)
  const submit=(payload:PlayerAnswerPayload)=>repo.submitAnswer(session.roomCode,player.player.id,player.reconnectToken,payload)
  const complete=async(final=false)=>{await action('lock');await action('reveal');await action(final?'finish':'leaderboard')}
  await action('start');await open()
  return {repo,quiz,session,player,missing,action,safe,host,stats,open,submit,complete}
}
it('finalises only at leaderboard/final results, uses missing answers, survives reconnect/rounds/Teams and resets on restart',async()=>{
  const g=await setup([typed(),{...typed(),id:'second'}],true,true)
  await g.submit({type:'typed-answer',value:'Alex',wagerPercent:100})
  expect(await g.stats()).toEqual([0,0]);await g.action('lock');await g.action('reveal');expect(await g.stats()).toEqual([0,0])
  const scored=await g.host();await g.action('leaderboard');expect(await g.stats()).toEqual([1,1])
  expect((await g.host()).players[0].totalScore).toBe(scored.players[0].totalScore)
  expect((await g.safe()).leaderboard[0]).toMatchObject({currentCorrectStreak:1,longestCorrectStreak:1})
  await g.action('next');expect((await g.safe()).phase).toBe('round-intro');expect(await g.stats()).toEqual([1,1])
  await g.action('start-round');await g.open()
  const reconnect=await g.repo.reconnectPlayer({roomCode:g.session.roomCode,playerId:g.player.player.id,reconnectToken:g.player.reconnectToken,nickname:'Carol'})
  expect(reconnect?.player).toMatchObject({currentCorrectStreak:1,longestCorrectStreak:1,totalScore:0})
  await g.submit({type:'typed-answer',value:'Alex'});expect(await g.stats()).toEqual([1,1]);await g.complete(true)
  expect(await g.stats()).toEqual([2,2]);expect((await g.host()).players[1]).toMatchObject({currentCorrectStreak:0,longestCorrectStreak:0})
  await g.action('restart');expect(await g.stats()).toEqual([0,0])
})
it.each(['wrong','missing','partial-matching','partial-multiple','connections-wrong'] as const)('%s breaks an existing run regardless of awarded points',async kind=>{
  let question=typed(),payload:PlayerAnswerPayload|undefined={type:'typed-answer',value:'Wrong',wagerPercent:100}
  if(kind==='missing')payload=undefined
  if(kind==='partial-matching'){
    const q=matchingFixture();q.scoringMode='partial';question=q
    payload={type:'matching',pairs:q.correctPairs.map((pair,i,a)=>({...pair,rightId:i<2?pair.rightId:a[i===2?3:2].rightId}))}
  }
  if(kind==='partial-multiple'){
    const q=allWagerQuestions().find(q=>q.type==='multiple-select')!;q.scoringMode='partial-wipeout';q.minimumSelections=1;question=q
    payload={type:'multiple-select',optionIds:[q.correctOptionIds[0]]}
  }
  if(kind==='connections-wrong'){question=connectionsFixture();payload={type:'connections',value:'Wrong'}}
  const g=await setup([typed(),{...question,id:'second'}]);await g.submit({type:'typed-answer',value:'Alex'});await g.complete()
  await g.action('next');await g.open();if(payload)await g.submit(payload)
  expect(await g.stats()).toEqual([1,1]);await g.complete(true);expect(await g.stats()).toEqual([0,1])
  if(kind.startsWith('partial'))expect((await g.host()).answers[0].pointsAwarded).toBeGreaterThan(0)
})
it.each(allWagerQuestions().map(q=>[q.type,q] as const))('%s full correctness advances exactly once with Wager',async(_type,question)=>{
  if(question.type==='pinpoint')question.target={kind:'circle',x:.5,y:.5,radius:.1}
  const g=await setup([question]);await g.submit({...correctPayload(question),wagerPercent:100});await g.complete(true)
  expect(await g.stats()).toEqual([1,1]);expect((await g.host()).answers[0].pointsAwarded).toBe(2000)
})
it('Progressive and Double amounts have no effect on streaks',async()=>{
  const g=await setup([{...progressiveQuestion(),doubleScore:true}]);await g.submit({type:'typed-answer',value:'Alex',wagerPercent:50});await g.complete(true)
  expect((await g.host()).answers[0].pointsAwarded).toBe(1750);expect(await g.stats()).toEqual([1,1])
})
it.each(['locked','reveal','leaderboard'] as const)('Typed Answer accept/undo during %s uses authoritative history',async phase=>{
  const g=await setup([typed(),{...typed(),id:'second'},{...typed(),id:'third'}])
  await g.submit({type:'typed-answer',value:'Alex'});await g.complete();await g.action('next');await g.open()
  await g.submit({type:'typed-answer',value:'Nearly',wagerPercent:50});await g.action('lock')
  if(phase!=='locked')await g.action('reveal');if(phase==='leaderboard')await g.action('leaderboard')
  const answer=(await g.host()).answers[0]
  await g.repo.setTypedAnswerOverride(g.session.id,answer.id,true)
  expect(await g.stats()).toEqual(phase==='leaderboard'?[2,2]:[1,1])
  expect((await g.host()).answers[0].pointsAwarded).toBe(1500)
  await g.repo.setTypedAnswerOverride(g.session.id,answer.id,null)
  expect(await g.stats()).toEqual(phase==='leaderboard'?[0,1]:[1,1]);expect((await g.host()).answers[0].pointsAwarded).toBe(-500)
  await g.repo.setTypedAnswerOverride(g.session.id,answer.id,true)
  if(phase==='locked')await g.action('reveal');if(phase!=='leaderboard')await g.action('leaderboard')
  expect(await g.stats()).toEqual([2,2])
})
it.each(['question','locked'] as const)('early finish from %s preserves prior completion only',async phase=>{
  const g=await setup([typed(),{...typed(),id:'second'}]);await g.submit({type:'typed-answer',value:'Alex'});await g.complete()
  await g.action('next');await g.open();await g.submit({type:'typed-answer',value:'Alex'})
  if(phase==='locked')await g.action('lock');await g.action('finish');expect(await g.stats()).toEqual([1,1])
})
it('legacy Demo players normalise missing stats without altering saved quiz v11',async()=>{
  const g=await setup([typed()]);const raw=JSON.parse(localStorage.getItem('katwed.demo.state.v2')!)
  delete raw.sessions[0].players[0].currentCorrectStreak;delete raw.sessions[0].players[0].longestCorrectStreak
  localStorage.setItem('katwed.demo.state.v2',JSON.stringify(raw));expect(await g.stats()).toEqual([0,0])
  expect(JSON.stringify((await g.repo.getQuiz(g.quiz.id)) as Quiz)).not.toMatch(/CorrectStreak/)
})
