import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { progressiveState } from '../../test/progressiveFixtures'
import { KATWED_QUIZ_FORMAT_VERSION, exportQuizToPortable } from '../../features/quiz-transfer/katwedQuizFormat'
import { wagerQuiz } from '../../test/wagerFixtures'
import { SupabaseGameRepository } from './SupabaseGameRepository'
import { parseSafeGameState } from './safeGameState'

const survivorState = () => {
  const base = progressiveState()
  const players = ['Carol', 'Roger'].map((nickname, index) => ({
    id: nickname.toLowerCase(), sessionId: base.sessionId, nickname, connected: true, joinedAt: '',
    totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
    survivorLivesRemaining: index ? 0 : 2, survivorEliminatedAtQuestion: index ? 3 : null,
  }))
  return {
    ...base,
    sessionSettings: {
      competitionMode: 'survivor', survivorStartingLives: 3, playMode: 'individual', soundPackId: 'none',
      shuffleQuestionOrder: false, shuffleAnswerOptions: false, autoLockWhenAllAnswered: true,
      showPlayerAnswersToHost: true, doubleScoreIntroMs: 5000, questionTypeIntrosEnabled: false,
      answerOptionSeed: 'session',
    },
    players,
    survivorAliveCount: 1,
    eligibleResponderCount: 1,
  }
}

it('normalises legacy Points state and validates authoritative Survivor lives/counts', () => {
  const points = parseSafeGameState(progressiveState())
  expect(points.sessionSettings).toMatchObject({ competitionMode: 'points', survivorStartingLives: null })
  expect(points.players.every(player => player.survivorLivesRemaining === 0 && player.survivorEliminatedAtQuestion === null)).toBe(true)
  const survivor = parseSafeGameState(survivorState())
  expect(survivor).toMatchObject({ survivorAliveCount: 1, eligibleResponderCount: 1 })
  expect(survivor.players[1]).toMatchObject({ survivorLivesRemaining: 0, survivorEliminatedAtQuestion: 3 })
})

it('rejects malformed Survivor state and incompatible Team or Head-to-Head payloads', () => {
  const state = survivorState()
  expect(() => parseSafeGameState({ ...state, players: state.players.map(player => ({ ...player, survivorLivesRemaining: undefined })) })).toThrow(/Survivor player/)
  expect(() => parseSafeGameState({ ...state, survivorAliveCount: 2 })).toThrow(/alive count/)
  expect(() => parseSafeGameState({ ...state, eligibleResponderCount: 2 })).toThrow(/eligible responder/)
  expect(() => parseSafeGameState({ ...state, sessionSettings: { ...state.sessionSettings, playMode: 'teams' } })).toThrow(/Survivor session/)
  expect(() => parseSafeGameState({ ...state, quizType: 'head-to-head' })).toThrow(/Survivor session/)
})

it('normalises Room Join mode without another request and leaves portable quizzes at v12', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: {
    roomCode: '123456', quizTitle: 'Quiz', quizType: 'standard', status: 'active', phase: 'lobby',
    playMode: 'individual', competitionMode: 'survivor', survivorStartingLives: 1,
    teams: [], headToHeadCompetitors: [],
  }, error: null })
  const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)
  expect(await repository.getRoomJoinInfo('123456')).toMatchObject({ competitionMode: 'survivor', survivorStartingLives: 1 })
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(KATWED_QUIZ_FORMAT_VERSION).toBe(12)
  expect(JSON.stringify(exportQuizToPortable(wagerQuiz()))).not.toMatch(/survivor|competitionMode|livesRemaining/i)
})
