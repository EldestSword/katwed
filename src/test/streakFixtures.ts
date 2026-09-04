import type { GamePhase, Player, SafeGameState } from '../types/domain'
import { board, standingsState } from './leaderboardFixtures'

export function streakPlayer(nickname = 'Carol', currentCorrectStreak = 3): Player {
  return {id:nickname.toLowerCase(),nickname,sessionId:'standings-session',connected:true,joinedAt:'2026-09-04T12:00:00Z',
    totalScore:-1500,correctAnswerCount:currentCorrectStreak,totalCorrectResponseMs:1000,currentCorrectStreak,longestCorrectStreak:currentCorrectStreak}
}
export function streakState(phase: GamePhase, streak = 3, number = 3): SafeGameState {
  const players=[streakPlayer('Carol',streak),streakPlayer('Roger',0)]
  return {...standingsState(phase,board(['Carol','Roger'],[-1500,-2000]),number),players,
    questionOpenedAt:'2026-09-04T12:00:00Z',questionClosesAt:'2026-09-04T12:01:00Z'}
}
