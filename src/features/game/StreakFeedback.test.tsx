import {StrictMode} from 'react'
import {act,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {PresentationStage} from './PresentationStage'
import {PlayerLeaderboard} from './PlayerLeaderboard'
import {FinalResults} from './FinalResults'
import {streakState,streakPlayer} from '../../test/streakFixtures'
import {board,previousBoard,currentBoard} from '../../test/leaderboardFixtures'
import {AnimatedLeaderboard} from '../../components/AnimatedLeaderboard'
import type {SafeGameState} from '../../types/domain'
import {competitionState} from '../teams/teams'

afterEach(()=>vi.useRealTimers())
it('keeps streak badges on the same row through score counting and FLIP movement',async()=>{
  vi.useFakeTimers()
  const {container}=render(<AnimatedLeaderboard reveal={{id:1,previous:previousBoard,entries:currentBoard}} players={[streakPlayer('Jaki',3)]} onSettled={()=>{}}/> )
  const row=container.querySelector('[data-player-id="jaki"]')
  expect(row).toHaveTextContent('3 in a row')
  await act(async()=>vi.advanceTimersByTime(2100))
  expect(container.querySelector('[data-player-id="jaki"]')).toBe(row)
  expect(row).toHaveAttribute('data-rank','1');expect(row).toHaveTextContent('5,000 points')
  await act(async()=>vi.advanceTimersByTime(600));expect(container.querySelector('.leaderboard__movement')).toBeNull()
})
it.each([0,1,2,5])('phone only celebrates personal streak %i at two or above',streak=>{
  const entries=board(['Carol']);entries[0].currentCorrectStreak=streak
  const {container}=render(<PlayerLeaderboard reveal={{id:1,entries,previous:null}} currentPlayerId="carol" personalStreak={streak} onSettled={()=>{}} />)
  expect(container.querySelectorAll('.player-streak')).toHaveLength(streak>=2?1:0)
  expect(container.querySelectorAll('.streak-badge')).toHaveLength(streak>=2?1:0)
})
it('updates personal/row streak after correction while preserving stable row identity',()=>{
  const entries=board(['Carol']),reveal={id:1,entries,previous:null},settle=()=>{}
  const {container,rerender}=render(<PlayerLeaderboard reveal={reveal} currentPlayerId="carol" personalStreak={3} players={[streakPlayer()]} onSettled={settle}/> )
  const row=container.querySelector('li')
  rerender(<PlayerLeaderboard reveal={reveal} currentPlayerId="carol" personalStreak={0} players={[streakPlayer('Carol',0)]} onSettled={settle}/> )
  expect(container.querySelector('li')).toBe(row);expect(container.querySelector('.streak-badge')).toBeNull();expect(container.querySelector('.player-streak')).toBeNull()
})
it.each([false,true])('presentation milestone, one callout, compact=%s, no duplicate/refresh replay',async compact=>{
  vi.useFakeTimers()
  const {container,rerender,unmount}=render(<StrictMode><PresentationStage state={streakState('question',2)} compact={compact}/></StrictMode>)
  rerender(<StrictMode><PresentationStage state={streakState('leaderboard',3)} compact={compact}/></StrictMode>)
  await act(async()=>vi.advanceTimersByTime(2100))
  expect(container.querySelector('.leaderboard-commentary')).toHaveTextContent('Carol is on a 3-answer streak!')
  expect(screen.getByLabelText('3 correct answers in a row')).toBeVisible()
  const callout=container.querySelector('.leaderboard-commentary p')
  rerender(<StrictMode><PresentationStage state={structuredClone(streakState('leaderboard',3))} compact={compact}/></StrictMode>)
  expect(container.querySelector('.leaderboard-commentary p')).toBe(callout)
  unmount();const refreshed=render(<PresentationStage state={streakState('leaderboard',3)} compact={compact}/> )
  expect(refreshed.container.querySelector('.leaderboard-commentary')).toBeEmptyDOMElement()
})
function teamState(phase:SafeGameState['phase'],streak:number,swap=false):SafeGameState{
  const s=streakState(phase,streak)
  return {...s,teams:[{id:'blue',name:'Blue',sessionId:s.sessionId,displayOrder:0},{id:'red',name:'Red',sessionId:s.sessionId,displayOrder:1}],
    sessionSettings:{...s.sessionSettings,playMode:'teams'} as SafeGameState['sessionSettings'],
    players:s.players.map((p,i)=>({...p,teamId:i?'red':'blue'})),
    leaderboard:phase==='leaderboard'?board(swap?['Roger','Carol']:['Carol','Roger']):[]}
}
it('Team movement beats personal milestone, without adding Team streak values',async()=>{
  vi.useFakeTimers();const {container,rerender}=render(<PresentationStage state={teamState('leaderboard',4)}/>)
  const question=teamState('question',4);question.currentQuestion={...question.currentQuestion!,id:'next',questionNumber:4}
  rerender(<PresentationStage state={question}/> )
  const after=teamState('leaderboard',5,true);after.currentQuestion=question.currentQuestion
  rerender(<PresentationStage state={after}/> );await act(async()=>vi.advanceTimersByTime(2100))
  expect(container.querySelector('.leaderboard-commentary')).toHaveTextContent('Red takes the lead!')
  expect(container.querySelectorAll('.streak-badge')).toHaveLength(0)
  expect(competitionState(after)!.leaderboard.every(e=>e.currentCorrectStreak===undefined)).toBe(true)
})
it('Team commentary falls back to individual milestone, with Team phone rank retained',()=>{
  const {container,rerender}=render(<PresentationStage state={teamState('question',4)}/>)
  rerender(<PresentationStage state={teamState('leaderboard',5)}/> )
  expect(container.querySelector('.leaderboard-commentary')).toHaveTextContent('Carol is on a 5-answer streak!')
  render(<PlayerLeaderboard reveal={{id:1,previous:board(['Red','Blue']),entries:board(['Blue','Red'])}} currentPlayerId="blue" teamName="Blue" personalStreak={5} onSettled={()=>{}}/> )
  expect(screen.getByText('Blue is now 1st')).toBeVisible();expect(screen.getByText('5 correct in a row')).toBeVisible()
})
it('Final Results keeps its existing structure and adds no fourth award or badges',()=>{
  const entries=board(['Carol','Roger','Jaki','Ross'],[100,0,-500,-1000]).map(e=>({...e,currentCorrectStreak:10,longestCorrectStreak:10,correctAnswerCount:3}))
  const {container}=render(<FinalResults entries={entries} variant="player"/> )
  expect(container.querySelector('.final-podium')).toBeInTheDocument()
  expect(screen.getByText('Most Correct')).toBeVisible();expect(screen.getByText('Quickest Thinker')).toBeVisible()
  expect(container.querySelectorAll('.streak-badge,.player-streak')).toHaveLength(0)
  expect(container.textContent).not.toMatch(/Longest Streak|Hottest Player/)
  expect(container.textContent).toContain('-1,000')
})
