import type {
  GameSession,
  JoinResult,
  LaunchGameSettings,
  PlayerAnswerPayload,
  PlayerSession,
  Quiz,
  RoomJoinInfo,
  SafeGameState,
  Unsubscribe,
} from '../types/domain'
import type { StorageCleanupResult, StorageReport } from '../features/storage-manager/storageManager'

export interface QuizSaveInput {
  id?: string
  title: string
  quizType: Quiz['quizType']
  headToHeadCompetitors: Quiz['headToHeadCompetitors']
  coverImagePath: string | null
  themeId: Quiz['themeId']
  backgroundId: Quiz['backgroundId']
  answerPaletteId?: Quiz['answerPaletteId']
  customAnswerColours?: Quiz['customAnswerColours']
  soundPackId?: Quiz['soundPackId']
  roster: Quiz['roster']
  questions: Quiz['questions']
}

export interface QuizDeleteResult {
  deletedMediaCount: number
  failedMediaCount: number
}

export interface GameRepository {
  readonly mode: 'demo' | 'supabase' | 'unconfigured'
  listQuizzes(): Promise<Quiz[]>
  listArchivedQuizzes(): Promise<Quiz[]>
  getQuiz(quizId: string): Promise<Quiz | null>
  saveQuiz(input: QuizSaveInput): Promise<Quiz>
  duplicateQuiz(quizId: string): Promise<Quiz>
  archiveQuiz(quizId: string): Promise<void>
  restoreQuiz(quizId: string): Promise<void>
  permanentlyDeleteQuiz(quizId: string): Promise<QuizDeleteResult>
  getStorageReport(): Promise<StorageReport>
  cleanupUnusedImages(paths: readonly string[]): Promise<StorageCleanupResult>
  launchGame(quizId: string, settings?: LaunchGameSettings): Promise<GameSession>
  getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null>
  getActiveSessionForQuiz(quizId: string): Promise<GameSession | null>
  getRoomJoinInfo(roomCode: string): Promise<RoomJoinInfo | null>
  joinRoom(roomCode: string, nickname: string): Promise<JoinResult>
  joinHeadToHeadRoom(roomCode: string, competitorId: string): Promise<JoinResult>
  reconnectPlayer(session: PlayerSession): Promise<JoinResult | null>
  setPlayerPresence(session: PlayerSession, connected: boolean): Promise<void>
  getSafeGameState(roomCode: string): Promise<SafeGameState | null>
  submitAnswer(roomCode: string, playerId: string, reconnectToken: string, payload: PlayerAnswerPayload): Promise<void>
  startHeadToHead(roomCode: string, playerId: string, reconnectToken: string): Promise<void>
  skipHeadToHead(roomCode: string, playerId: string, reconnectToken: string, expectedQuestionId: string): Promise<void>
  continueHeadToHead(roomCode: string, playerId: string, reconnectToken: string, expectedQuestionId: string): Promise<void>
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
