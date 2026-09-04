import { expect, it } from 'vitest'
import { board } from '../../test/leaderboardFixtures'
import { streakPlayer } from '../../test/streakFixtures'
import { selectLiveCommentary, selectStreakMilestone, type StreakCommentary } from './streakCommentary'

it.each([3,5,10,15,20,25,100])('announces a witnessed %i milestone', streak => {
  expect(selectStreakMilestone(new Map([['carol',streak-1]]),[streakPlayer('Carol',streak)])).toMatchObject({kind:'streak',streak,playerId:'carol'})
})
it.each([0,1,2,4,6,7,8,9,11,14])('keeps ordinary streak %i quiet', streak => {
  expect(selectStreakMilestone(new Map([['carol',streak-1]]),[streakPlayer('Carol',streak)])).toBeNull()
})
it('requires a previous value and exactly one increment', () => {
  for (const before of [null,new Map<string,number>(),new Map([['carol',5]]),new Map([['carol',2]])])
    expect(selectStreakMilestone(before,[streakPlayer('Carol',5)])).toBeNull()
})
it('chooses highest milestone, then individual rank, then stable nickname/ID without mutation', () => {
  const players=[streakPlayer('Zoe',5),streakPlayer('Carol',5),streakPlayer('Roger',10)]
  const before=new Map(players.map(p=>[p.id,p.currentCorrectStreak!-1]))
  const copy=structuredClone(players)
  expect(selectStreakMilestone(before,players)?.playerId).toBe('roger')
  expect(selectStreakMilestone(before,players.slice(0,2),board(['Zoe','Carol']))?.playerId).toBe('zoe')
  expect(selectStreakMilestone(before,players.slice(0,2))?.playerId).toBe('carol')
  expect(players).toEqual(copy)
})
const milestone=(streak:number):StreakCommentary=>({kind:'streak',playerId:'carol',streak,message:`Carol ${streak}`})
it.each([
  [['A','B','C','D'],['B','A','C','D'],10,'new-leader'],
  [['A','B','C','D'],['A','D','B','C'],10,'top-three'],
  [['A','B','C','D','E','F','G'],['A','B','C','G','D','E','F'],10,'streak'],
  [['A','B','C','D','E','F','G'],['A','B','C','G','D','E','F'],3,'major-climb'],
  [['A','B','C','D','E'],['A','B','C','E','D'],3,'streak'],
] as const)('merges priority into one event %s', (before,after,streak,kind) => {
  expect(selectLiveCommentary(board([...before]),board([...after]),milestone(streak))?.kind).toBe(kind)
})
it('keeps the existing movement fallback when no milestone qualifies',()=>{
  expect(selectLiveCommentary(board(['A','B','C','D','E']),board(['A','B','C','E','D']),null)?.kind).toBe('overtake')
  expect(selectLiveCommentary(null,board(['A']),null)).toBeNull()
})
