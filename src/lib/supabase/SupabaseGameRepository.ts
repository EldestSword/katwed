import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type {
  GameSession,
  JoinResult,
  PlayerAnswerPayload,
  PlayerSession,
  Quiz,
  SafeGameState,
  Unsubscribe,
} from '../../types/domain'
import type { GameRepository, QuizSaveInput } from '../../services/gameRepository'
import { RepositoryError } from '../../services/gameRepository'
import { parseSafeGameState } from './safeGameState'

type JsonObject = Record<string, unknown>

function normaliseError(error: { message: string; code?: string } | null): RepositoryError {
  if (!error) return new RepositoryError('database', 'The database operation failed.')
  const codeMap: Record<string, RepositoryError['code']> = {
    P0001: 'database',
    '23505': 'duplicate-submission',
    '42501': 'unauthorised',
  }
  return new RepositoryError(codeMap[error.code ?? ''] ?? 'database', error.message)
}

export class SupabaseGameRepository implements GameRepository {
  readonly mode = 'supabase' as const

  constructor(private readonly client: SupabaseClient) {}

  private async rpc<T>(name: string, args: JsonObject = {}): Promise<T> {
    const result = await this.client.rpc(name, args)
    if (result.error) throw normaliseError(result.error)
    return result.data as unknown as T
  }

  async listQuizzes(): Promise<Quiz[]> {
    return this.rpc<Quiz[]>('host_list_quizzes')
  }

  async getQuiz(quizId: string): Promise<Quiz | null> {
    return this.rpc<Quiz | null>('host_get_quiz', { p_quiz_id: quizId })
  }

  async saveQuiz(input: QuizSaveInput): Promise<Quiz> {
    return this.rpc<Quiz>('host_save_quiz', { p_quiz: input })
  }

  async deleteQuiz(quizId: string): Promise<void> {
    await this.rpc('host_delete_quiz', { p_quiz_id: quizId })
  }

  async launchGame(quizId: string): Promise<GameSession> {
    return this.rpc<GameSession>('host_launch_game', { p_quiz_id: quizId })
  }

  async getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> {
    return this.rpc('host_get_game', { p_session_id: sessionId })
  }

  async getActiveSessionForQuiz(quizId: string): Promise<GameSession | null> {
    return this.rpc('host_get_active_game', { p_quiz_id: quizId })
  }

  async joinRoom(roomCode: string, nickname: string): Promise<JoinResult> {
    return this.rpc<JoinResult>('join_room', { p_room_code: roomCode, p_nickname: nickname })
  }

  async reconnectPlayer(session: PlayerSession): Promise<JoinResult | null> {
    return this.rpc<JoinResult | null>('reconnect_player', {
      p_room_code: session.roomCode,
      p_player_id: session.playerId,
      p_reconnect_token: session.reconnectToken,
    })
  }

  async setPlayerPresence(session: PlayerSession, connected: boolean): Promise<void> {
    await this.rpc('set_player_presence', {
      p_room_code: session.roomCode,
      p_player_id: session.playerId,
      p_reconnect_token: session.reconnectToken,
      p_connected: connected,
    })
  }

  async getSafeGameState(roomCode: string): Promise<SafeGameState | null> {
    const state = await this.rpc<unknown>('get_player_game_state', { p_room_code: roomCode })
    return state === null ? null : parseSafeGameState(state)
  }

  async submitAnswer(
    roomCode: string,
    playerId: string,
    reconnectToken: string,
    payload: PlayerAnswerPayload,
  ): Promise<void> {
    await this.rpc('submit_answer', {
      p_room_code: roomCode,
      p_player_id: playerId,
      p_reconnect_token: reconnectToken,
      p_answer: payload,
    })
  }

  async changePhase(
    sessionId: string,
    action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close',
  ): Promise<void> {
    await this.rpc(`host_${action}_game`, { p_session_id: sessionId })
  }

  subscribe(subject: string, callback: () => void): Unsubscribe {
    let channel: RealtimeChannel = this.client.channel(`katwed:${subject}`, { config: { private: false } })
    channel = channel
      .on('broadcast', { event: 'game_changed' }, callback)
      .subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }
}
