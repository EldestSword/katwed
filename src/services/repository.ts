import { config } from '../lib/config'
import { DemoGameRepository } from '../lib/demo/DemoGameRepository'
import { supabase } from '../lib/supabase/client'
import { SupabaseGameRepository } from '../lib/supabase/SupabaseGameRepository'
import type { GameRepository, QuizDeleteResult, QuizSaveInput, RealtimeStatusCallback } from './gameRepository'
import { RepositoryError } from './gameRepository'
import type {
  BuzzClaimResult,
  GameSession,
  JoinResult,
  PlayerAnswerPayload,
  PlayerSession,
  Quiz,
  RoomJoinInfo,
  SafeGameState,
  Unsubscribe,
} from '../types/domain'
import type { StorageCleanupResult, StorageReport } from '../features/storage-manager/storageManager'

class UnconfiguredRepository implements GameRepository {
  readonly mode = 'unconfigured' as const
  private fail(): never {
    throw new RepositoryError(
      'configuration',
      'Katwed! needs Supabase configuration. For local development, explicitly enable demo mode.',
    )
  }
  listQuizzes(): Promise<Quiz[]> { return this.fail() }
  listArchivedQuizzes(): Promise<Quiz[]> { return this.fail() }
  getQuiz(_quizId: string): Promise<Quiz | null> { return this.fail() }
  saveQuiz(_input: QuizSaveInput): Promise<Quiz> { return this.fail() }
  duplicateQuiz(_quizId: string): Promise<Quiz> { return this.fail() }
  archiveQuiz(_quizId: string): Promise<void> { return this.fail() }
  restoreQuiz(_quizId: string): Promise<void> { return this.fail() }
  permanentlyDeleteQuiz(_quizId: string): Promise<QuizDeleteResult> { return this.fail() }
  getStorageReport(): Promise<StorageReport> { return this.fail() }
  cleanupUnusedImages(_paths: readonly string[]): Promise<StorageCleanupResult> { return this.fail() }
  launchGame(_quizId: string): Promise<GameSession> { return this.fail() }
  getHostSession(_sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> { return this.fail() }
  getHostLiveSession(_sessionId: string): Promise<GameSession | null> { return this.fail() }
  getActiveSessionForQuiz(_quizId: string): Promise<GameSession | null> { return this.fail() }
  getRoomJoinInfo(_roomCode: string): Promise<RoomJoinInfo | null> { return this.fail() }
  joinRoom(_roomCode: string, _nickname: string): Promise<JoinResult> { return this.fail() }
  assignPlayerTeam(_sessionId: string, _playerId: string, _teamId: string): Promise<void> { return this.fail() }
  balanceTeams(_sessionId: string): Promise<void> { return this.fail() }
  revealConnectionClue(_sessionId: string): Promise<void> { return this.fail() }
  joinHeadToHeadRoom(_roomCode: string, _competitorId: string): Promise<JoinResult> { return this.fail() }
  reconnectPlayer(_session: PlayerSession): Promise<JoinResult | null> { return this.fail() }
  setPlayerPresence(_session: PlayerSession, _connected: boolean): Promise<void> { return this.fail() }
  getSafeGameState(_roomCode: string): Promise<SafeGameState | null> { return this.fail() }
  claimBuzz(_roomCode: string, _playerId: string, _token: string): Promise<BuzzClaimResult> { return this.fail() }
  submitAnswer(_roomCode: string, _playerId: string, _token: string, _payload: PlayerAnswerPayload): Promise<void> { return this.fail() }
  startHeadToHead(_roomCode: string, _playerId: string, _token: string): Promise<void> { return this.fail() }
  skipHeadToHead(_roomCode: string, _playerId: string, _token: string, _questionId: string): Promise<void> { return this.fail() }
  continueHeadToHead(_roomCode: string, _playerId: string, _token: string, _questionId: string): Promise<void> { return this.fail() }
  setTypedAnswerOverride(_sessionId: string, _answerId: string, _correctOverride: true | null): Promise<void> { return this.fail() }
  resetBuzz(_sessionId: string): Promise<void> { return this.fail() }
  changePhase(_sessionId: string, _action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close'): Promise<void> { return this.fail() }
  subscribe(_subject: string, _callback: () => void, onStatus?: RealtimeStatusCallback): Unsubscribe {
    queueMicrotask(() => onStatus?.('CLOSED'))
    return () => undefined
  }
}

export const repository: GameRepository = config.demoMode
  ? new DemoGameRepository()
  : supabase
    ? new SupabaseGameRepository(supabase)
    : new UnconfiguredRepository()
