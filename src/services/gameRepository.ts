import type {
  GameSession,
  JoinResult,
  PlayerSession,
  Quiz,
  SafeGameState,
  Unsubscribe,
} from '../types/domain'

export interface QuizSaveInput {
  id?: string
  title: string
  roster: Quiz['roster']
  questions: Quiz['questions']
}

export interface GameRepository {
  readonly mode: 'demo' | 'supabase' | 'unconfigured'
  listQuizzes(): Promise<Quiz[]>
  getQuiz(quizId: string): Promise<Quiz | null>
  saveQuiz(input: QuizSaveInput): Promise<Quiz>
  deleteQuiz(quizId: string): Promise<void>
  launchGame(quizId: string): Promise<GameSession>
  getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null>
  getActiveSessionForQuiz(quizId: string): Promise<GameSession | null>
  joinRoom(roomCode: string, nickname: string): Promise<JoinResult>
  reconnectPlayer(session: PlayerSession): Promise<JoinResult | null>
  getSafeGameState(roomCode: string): Promise<SafeGameState | null>
  submitAnswer(roomCode: string, playerId: string, reconnectToken: string, selectedIds: readonly string[]): Promise<void>
  changePhase(sessionId: string, action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close'): Promise<void>
  subscribe(roomOrSessionId: string, callback: () => void): Unsubscribe
}

export class RepositoryError extends Error {
  constructor(
    public readonly code:
      | 'invalid-room'
      | 'expired-room'
      | 'game-started'
      | 'duplicate-nickname'
      | 'invalid-player'
      | 'invalid-phase'
      | 'late-submission'
      | 'duplicate-submission'
      | 'invalid-selection'
      | 'unauthorised'
      | 'configuration'
      | 'database',
    message: string,
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}
