import { config } from '../lib/config'
import { DemoGameRepository } from '../lib/demo/DemoGameRepository'
import { supabase } from '../lib/supabase/client'
import { SupabaseGameRepository } from '../lib/supabase/SupabaseGameRepository'
import type { GameRepository, QuizSaveInput } from './gameRepository'
import { RepositoryError } from './gameRepository'
import type {
  GameSession,
  JoinResult,
  PlayerSession,
  Quiz,
  SafeGameState,
  Unsubscribe,
} from '../types/domain'

class UnconfiguredRepository implements GameRepository {
  readonly mode = 'unconfigured' as const
  private fail(): never {
    throw new RepositoryError(
      'configuration',
      'Katwed! needs Supabase configuration. For local development, explicitly enable demo mode.',
    )
  }
  listQuizzes(): Promise<Quiz[]> { return this.fail() }
  getQuiz(_quizId: string): Promise<Quiz | null> { return this.fail() }
  saveQuiz(_input: QuizSaveInput): Promise<Quiz> { return this.fail() }
  deleteQuiz(_quizId: string): Promise<void> { return this.fail() }
  launchGame(_quizId: string): Promise<GameSession> { return this.fail() }
  getHostSession(_sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> { return this.fail() }
  getActiveSessionForQuiz(_quizId: string): Promise<GameSession | null> { return this.fail() }
  joinRoom(_roomCode: string, _nickname: string): Promise<JoinResult> { return this.fail() }
  reconnectPlayer(_session: PlayerSession): Promise<JoinResult | null> { return this.fail() }
  setPlayerPresence(_session: PlayerSession, _connected: boolean): Promise<void> { return this.fail() }
  getSafeGameState(_roomCode: string): Promise<SafeGameState | null> { return this.fail() }
  submitAnswer(_roomCode: string, _playerId: string, _token: string, _ids: readonly string[]): Promise<void> { return this.fail() }
  changePhase(_sessionId: string, _action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close'): Promise<void> { return this.fail() }
  subscribe(_subject: string, _callback: () => void): Unsubscribe { return () => undefined }
}

export const repository: GameRepository = config.demoMode
  ? new DemoGameRepository()
  : supabase
    ? new SupabaseGameRepository(supabase)
    : new UnconfiguredRepository()
