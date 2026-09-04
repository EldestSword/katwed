import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AnimatedLeaderboard } from './AnimatedLeaderboard'
import { sortLeaderboard } from '../utils/scoring'
import { calculateFinalAwards } from '../features/game/finalAwards'
import { teamStandings } from '../features/teams/teams'
import { parseSafeGameState } from '../lib/supabase/safeGameState'
import { connectionsState } from '../test/connectionsFixtures'
import type { Player } from '../types/domain'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it.each([false,true])('sorts and formats negative totals through movement, reduced motion=%s', reduced => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
  const players: Player[] = [0,-1000,100,-500].map((totalScore,i) => ({id:`p${i}`,sessionId:'s',nickname:`Player ${i}`,connected:true,joinedAt:'',totalScore,correctAnswerCount:3,totalCorrectResponseMs:3000,teamId:'blue'}))
  const entries = sortLeaderboard(players)
  expect(entries.map(e=>e.totalScore)).toEqual([100,0,-500,-1000])
  const previous = entries.map((e,i)=>({...e,totalScore:1000-i*100}))
  const view = render(<AnimatedLeaderboard reveal={{id:1,previous,entries}} onSettled={vi.fn()} />)
  act(()=> { vi.advanceTimersByTime(2500) })
  expect(view.container.querySelector('[data-player-id="p1"] .leaderboard__points')).toHaveTextContent('-1,000 points')
  expect(view.container.querySelector('[data-player-id="p3"] .leaderboard__points')).toHaveTextContent('-500 points')
  expect(screen.queryByText('0-500 points')).toBeNull()
  expect(calculateFinalAwards(entries).map(a=>a.kind)).toEqual(['most-correct','quickest-thinker'])
  expect(teamStandings([{id:'blue',name:'Blue',sessionId:'s',displayOrder:0}],players,entries)[0].totalScore).toBe(-1400)
  const safe = parseSafeGameState({...connectionsState(),phase:'leaderboard',currentQuestion:null,players:players.map(p=>({...p,teamId:null})),leaderboard:entries})
  expect(safe.leaderboard).toEqual(entries)
})
