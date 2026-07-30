export type GamePhase = 'lobby' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'finished'
export type SessionStatus = 'active' | 'closed'

export interface RosterMember {
  id: string
  quizId: string
  displayName: string
  shortName: string
  active: boolean
  displayOrder: number
}

export interface Question {
  id: string
  quizId: string
  imagePath: string
  correctMemberIds: readonly [string, string]
  timeLimitSeconds: number
  displayOrder: number
  revealCaption: string
}

export interface Quiz {
  id: string
  title: string
  roster: RosterMember[]
  questions: Question[]
  createdAt: string
  updatedAt: string
}

export interface Player {
  id: string
  sessionId: string
  nickname: string
  connected: boolean
  joinedAt: string
  totalScore: number
  correctAnswerCount: number
  totalCorrectResponseMs: number
}

export interface PlayerAnswer {
  id: string
  sessionId: string
  questionId: string
  playerId: string
  selectedMemberIds: readonly [string, string]
  submittedAt: string
  responseTimeMs: number
  correct: boolean
  pointsAwarded: 0 | 1
}

export interface GameSession {
  id: string
  quizId: string
  roomCode: string
  status: SessionStatus
  phase: GamePhase
  currentQuestionIndex: number
  questionOpenedAt: string | null
  questionClosesAt: string | null
  startedAt: string | null
  endedAt: string | null
  players: Player[]
  answers: PlayerAnswer[]
}

export interface SafeQuestion {
  id: string
  imagePath: string
  questionNumber: number
  totalQuestions: number
  timeLimitSeconds: number
}

export interface LeaderboardEntry {
  playerId: string
  nickname: string
  totalScore: number
  correctAnswerCount: number
  totalCorrectResponseMs: number
  rank: number
}

export interface SafeGameState {
  sessionId: string
  quizTitle: string
  roomCode: string
  status: SessionStatus
  phase: GamePhase
  currentQuestion: SafeQuestion | null
  roster: RosterMember[]
  players: Player[]
  submittedCount: number
  leaderboard: LeaderboardEntry[]
  reveal:
    | {
        correctMemberIds: readonly [string, string]
        correctNames: readonly [string, string]
        caption: string
      }
    | null
  questionOpenedAt: string | null
  questionClosesAt: string | null
}

export interface PlayerSession {
  playerId: string
  roomCode: string
  nickname: string
  reconnectToken: string
}

export interface JoinResult {
  player: Player
  reconnectToken: string
}

export type Unsubscribe = () => void
