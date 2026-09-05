import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allWagerQuestions, correctPayload, wagerQuiz } from '../../test/wagerFixtures'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import type { LaunchGameSettings, PlayerAnswerPayload, Question, SingleChoiceQuestion } from '../../types/domain'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { DemoGameRepository } from './DemoGameRepository'
import { teamStandings } from '../../features/teams/teams'

const base=():Question=>({...progressiveQuestion(),id:'q1',progressiveRevealEnabled:false,wagerEnabled:true,speedScoringEnabled:false,media:{type:'none'}})
const choice=():SingleChoiceQuestion=>({...allWagerQuestions().find(q=>q.type==='single-choice')!} as SingleChoiceQuestion)
async function game(questions:Question[]=[base()],settings:Partial<LaunchGameSettings>={}) {
  const repo=new DemoGameRepository(),quiz=await repo.saveQuiz(wagerQuiz(questions))
  const session=await repo.launchGame(quiz.id,{...defaultLaunchGameSettings(quiz),soundPackId:'none',autoLockWhenAllAnswered:false,powerUpsEnabled:true,automaticTieBreakersEnabled:false,...settings})
  const team=settings.teamAssignmentMode==='player-choice'?session.teams?.[0].id:undefined
  const a=await repo.joinRoom(session.roomCode,'Carol',team),b=await repo.joinRoom(session.roomCode,'Roger',team)
  const phase=(action:Parameters<DemoGameRepository['changePhase']>[1])=>repo.changePhase(session.id,action)
  const host=async()=>(await repo.getHostLiveSession(session.id))!
  await phase('start');vi.setSystemTime(new Date((await host()).questionOpenedAt!))
  const send=(payload:PlayerAnswerPayload,joined=a)=>repo.submitAnswer(session.roomCode,joined.player.id,joined.reconnectToken,payload)
  const reconnect=(joined=a)=>repo.reconnectPlayer({roomCode:session.roomCode,playerId:joined.player.id,nickname:joined.player.nickname,reconnectToken:joined.reconnectToken})
  return {repo,quiz,session,a,b,phase,host,send,reconnect}
}
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-04T23:00:00Z'))})
afterEach(()=>vi.useRealTimers())

describe('Demo Power-Up integration',()=>{
  it('serialises concurrent private activations and answers across repository instances',async()=>{
    const q=choice(),g=await game([q]),other=new DemoGameRepository()
    const results=await Promise.allSettled([
      g.repo.activateFiftyFifty(g.session.roomCode,g.a.player.id,g.a.reconnectToken,q.id),
      other.submitAnswer(g.session.roomCode,g.a.player.id,g.a.reconnectToken,{...correctPayload(q),powerUp:'double-up'}),
    ])
    expect(results.map(result=>result.status)).toEqual(['fulfilled','rejected'])
    expect((await g.reconnect())?.powerUps?.uses).toHaveLength(1)
    expect((await g.host()).answers).toHaveLength(0)
  })
  it.each([
    ['ordinary',{},true,0,2000],['authored double',{doubleScore:true},true,0,4000],
    ['wager win',{},true,50,3000],['wager loss',{},false,100,-1000],['wrong',{},false,0,0],
  ] as const)('Double Up preserves scoring order: %s',async(_name,settings,correct,wagerPercent,expected)=>{
    const g=await game([{...base(),...settings}]);const before=await g.reconnect()
    expect(before?.powerUps?.uses).toEqual([])
    await g.send({type:'typed-answer',value:correct?'Alex':'Wrong',wagerPercent,powerUp:'double-up'})
    expect((await g.host()).answers[0]).toMatchObject({pointsAwarded:expected,correct,responseTimeMs:0})
    expect((await g.reconnect())?.powerUps?.uses).toEqual([{questionId:'q1',powerUp:'double-up'}])
    expect((await g.reconnect(g.b))?.powerUps?.uses).toEqual([])
  })
  it('keeps Fast Five real response metrics and uses the same scoring order on host acceptance/undo',async()=>{
    const g=await game([{...base(),speedScoringEnabled:true,doubleScore:true}])
    vi.setSystemTime(new Date(Date.now()+8000))
    await g.send({type:'typed-answer',value:'Wrong',powerUp:'fast-five',wagerPercent:50})
    let answer=(await g.host()).answers[0];expect(answer).toMatchObject({pointsAwarded:-500,responseTimeMs:8000})
    await g.phase('lock');await g.repo.setTypedAnswerOverride(g.session.id,answer.id,true)
    answer=(await g.host()).answers[0];expect(answer).toMatchObject({pointsAwarded:2450,responseTimeMs:8000,correct:true})
    expect((await g.host()).players[0].totalCorrectResponseMs).toBe(8000)
    await g.repo.setTypedAnswerOverride(g.session.id,answer.id,null)
    expect((await g.host()).answers[0].pointsAwarded).toBe(-500)
  })
  it('keeps 50/50 personal, stable on reconnect, one per question, and restores inventory on restart',async()=>{
    const q=choice(),g=await game([q,{...base(),id:'q2',displayOrder:1}])
    const used=await g.repo.activateFiftyFifty(g.session.roomCode,g.a.player.id,g.a.reconnectToken,q.id)
    expect(used.uses[0].optionIds).toHaveLength(2);expect(used.uses[0].optionIds).toContain(q.correctOptionId)
    expect((await g.reconnect())?.powerUps).toEqual(used)
    expect((await g.reconnect(g.b))?.powerUps?.uses).toEqual([])
    const safe=(await g.repo.getSafeGameState(g.session.roomCode))!
    expect(safe.submittedCount).toBe(0);expect(JSON.stringify(safe)).not.toMatch(/powerUpUses|optionIds.*powerUp|"uses"/)
    await expect(g.repo.activateFiftyFifty(g.session.roomCode,g.a.player.id,g.a.reconnectToken,q.id)).rejects.toThrow(/already/)
    await expect(g.send({...correctPayload(q),powerUp:'double-up'})).rejects.toThrow(/already/)
    await g.send(correctPayload(q))
    await g.phase('lock');await g.phase('reveal');await g.phase('leaderboard');await g.phase('next')
    vi.setSystemTime(new Date((await g.host()).questionOpenedAt!))
    expect((await g.reconnect())?.powerUps?.uses).toHaveLength(1)
    await g.send({type:'typed-answer',value:'Alex',powerUp:'double-up'})
    await g.phase('finish');await g.phase('restart')
    expect((await g.reconnect())?.powerUps?.uses).toEqual([])
    expect((await g.reconnect())?.powerUps?.runId).not.toBe(used.runId)
  })
  it('consumes nothing on bad metadata, invalid core payload, wrong token, duplicate, late or disabled submissions',async()=>{
    const g=await game()
    for(const payload of [
      {type:'typed-answer',value:'',powerUp:'double-up'}, {type:'typed-answer',value:'Alex',powerUp:'unknown'},
      {type:'typed-answer',value:'Alex',powerUp:'double-up',extra:true}, {type:'typed-answer',value:'Alex',powerUp:'fast-five'},
    ]) await expect(g.send(payload as PlayerAnswerPayload)).rejects.toThrow()
    expect((await g.reconnect())?.powerUps?.uses).toEqual([])
    await expect(g.repo.submitAnswer(g.session.roomCode,g.a.player.id,'wrong',{type:'typed-answer',value:'Alex',powerUp:'double-up'})).rejects.toThrow()
    await g.send({type:'typed-answer',value:'Alex'})
    await expect(g.send({type:'typed-answer',value:'Alex',powerUp:'double-up'})).rejects.toThrow()
    vi.setSystemTime(new Date(Date.now()+70000))
    await expect(g.send({type:'typed-answer',value:'Alex',powerUp:'double-up'},g.b)).rejects.toThrow()
    expect((await g.reconnect())?.powerUps?.uses).toEqual([])
  })
  it('adds player points to Teams with independent inventory',async()=>{
    const g=await game(undefined,{playMode:'teams',teamAssignmentMode:'player-choice',teamNames:['Blue','Red']})
    await g.send({type:'typed-answer',value:'Alex',powerUp:'double-up'})
    await g.send({type:'typed-answer',value:'Alex'},g.b)
    await g.phase('lock');await g.phase('reveal');await g.phase('finish')
    expect((await g.repo.getSafeGameState(g.session.roomCode))?.players.map(p=>p.totalScore)).toEqual([2000,1000])
    const final=(await g.repo.getSafeGameState(g.session.roomCode))!
    expect(teamStandings(final.teams!,final.players,final.leaderboard)[0]).toMatchObject({totalScore:3000,memberCount:2})
    expect((await g.reconnect(g.b))?.powerUps?.uses).toEqual([])
  })
  it('keeps Survivor damage based on correctness with Double Up and 50/50',async()=>{
    const q=choice(),g=await game([{...base()}, {...q,displayOrder:1}],{competitionMode:'survivor',survivorStartingLives:3})
    await g.send({type:'typed-answer',value:'Wrong',powerUp:'double-up'})
    await g.send({type:'typed-answer',value:'Alex'},g.b)
    await g.phase('lock');await g.phase('reveal');await g.phase('leaderboard')
    expect((await g.host()).players.map(p=>p.survivorLivesRemaining)).toEqual([2,3])
    await g.phase('next');vi.setSystemTime(new Date((await g.host()).questionOpenedAt!))
    await g.repo.activateFiftyFifty(g.session.roomCode,g.a.player.id,g.a.reconnectToken,q.id)
    await g.send(correctPayload(q));await g.phase('lock');await g.phase('reveal');await g.phase('finish')
    expect((await g.host()).players[0].survivorLivesRemaining).toBe(2)
  })
  it.each(['progressive','connections','matching'] as const)('doubles positive %s points without changing correctness',async type=>{
    let q:Question=type==='progressive'?{...progressiveQuestion(),speedScoringEnabled:false}:allWagerQuestions().find(q=>q.type===type)!
    q={...q,doubleScore:false,wagerEnabled:false}
    const g=await game([q]);let payload=correctPayload(q)
    if(q.type==='matching') payload={type:'matching',pairs:q.correctPairs.map((p,i)=>i<2?p:{...p,rightId:q.correctPairs[i===2?3:2].rightId})}
    await g.send({...payload,powerUp:'double-up'})
    const a=(await g.host()).answers[0]
    expect(a.pointsAwarded).toBe(q.type==='matching'?1000:2000)
    expect(a.correct).toBe(q.type!=='matching')
  })
  it('rejects Buzz and disabled sessions without consuming inventory',async()=>{
    const g=await game([{...choice(),buzzInEnabled:true}])
    await expect(g.repo.activateFiftyFifty(g.session.roomCode,g.a.player.id,g.a.reconnectToken,g.quiz.questions[0].id)).rejects.toThrow(/Buzz/)
    await g.repo.claimBuzz(g.session.roomCode,g.a.player.id,g.a.reconnectToken)
    await expect(g.send({...correctPayload(g.quiz.questions[0]),powerUp:'double-up'})).rejects.toThrow(/Buzz/)
    expect((await g.reconnect())?.powerUps?.uses).toEqual([])
    await g.phase('close')
    const off=await game(undefined,{powerUpsEnabled:false})
    await expect(off.send({type:'typed-answer',value:'Alex',powerUp:'double-up'})).rejects.toThrow(/not enabled/)
    await off.send({type:'typed-answer',value:'Alex'})
  })
})
