import type { GamePhase, LeaderboardEntry, SafeGameState } from '../types/domain'

export function board(names: string[], scores?: number[]): LeaderboardEntry[] {
  return names.map((nickname, index) => ({ playerId: nickname.toLowerCase(), nickname, rank: index + 1,
    totalScore: scores?.[index] ?? (names.length - index) * 100, correctAnswerCount: 1, totalCorrectResponseMs: 1000 }))
}

export const previousBoard = board(['Roger', 'Carol', 'Jaki', 'Ross'], [4800, 4600, 4400, 4100])
export const currentBoard = board(['Jaki', 'Roger', 'Carol', 'Ross'], [5000, 4800, 4700, 4500])

export function standingsState(phase: GamePhase, leaderboard = previousBoard, questionNumber = 1): SafeGameState {
  return {
    sessionId: 'standings-session', quizTitle: 'Standings quiz', quizType: 'standard', themeId: 'katwed', backgroundId: null,
    roomCode: '123456', status: 'active', phase, leaderboard: phase === 'leaderboard' || phase === 'finished' ? leaderboard : [],
    players: [], roster: [], submittedCount: 0, reveal: null, questionOpenedAt: null, questionClosesAt: null,
    currentQuestion: {
      id: `q${questionNumber}`, questionNumber, totalQuestions: 5, type: 'true-false', prompt: `Question ${questionNumber}`,
      supportingText: '', media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      timeLimitSeconds: 30, points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: questionNumber - 1,
    },
  }
}
