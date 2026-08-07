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
import type { GameRepository, QuizDeleteResult, QuizSaveInput } from '../../services/gameRepository'
import { RepositoryError } from '../../services/gameRepository'
import { removeQuestionImages } from '../../services/questionImages'
import { config } from '../config'
import { parseSafeGameState } from './safeGameState'
import { createDuplicateQuizInput } from '../../features/quiz-editor/duplicateQuiz'
import type { StorageCleanupResult, StorageReport } from '../../features/storage-manager/storageManager'
import { cleanupSupabaseUnusedImages, loadSupabaseStorageReport } from '../../services/storageManager'
import { normaliseQuizThemeId } from '../../features/themes/quizThemes'
import { normaliseQuizBackgroundId } from '../../features/themes/quizBackgrounds'

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

function normaliseQuiz(quiz: Quiz): Quiz {
  const themeId = normaliseQuizThemeId((quiz as { themeId?: unknown }).themeId)
  return {
    ...quiz,
    themeId,
    backgroundId: normaliseQuizBackgroundId((quiz as { backgroundId?: unknown }).backgroundId, themeId),
  }
}

export class SupabaseGameRepository implements GameRepository {
  readonly mode = 'supabase' as const

  constructor(
    private readonly client: SupabaseClient,
    private readonly projectUrl = config.supabaseUrl,
  ) {}

  private async rpc<T>(name: string, args: JsonObject = {}): Promise<T> {
    const result = await this.client.rpc(name, args)
    if (result.error) throw normaliseError(result.error)
    return result.data as unknown as T
  }

  async listQuizzes(): Promise<Quiz[]> {
    return (await this.rpc<Quiz[]>('host_list_quizzes')).map(normaliseQuiz)
  }

  async listArchivedQuizzes(): Promise<Quiz[]> {
    return (await this.rpc<Quiz[]>('host_list_archived_quizzes')).map(normaliseQuiz)
  }

  async getQuiz(quizId: string): Promise<Quiz | null> {
    const quiz = await this.rpc<Quiz | null>('host_get_quiz', { p_quiz_id: quizId })
    return quiz ? normaliseQuiz(quiz) : null
  }

  async saveQuiz(input: QuizSaveInput): Promise<Quiz> {
    return normaliseQuiz(await this.rpc<Quiz>('host_save_quiz', { p_quiz: input }))
  }

  async duplicateQuiz(quizId: string): Promise<Quiz> {
    const source = await this.getQuiz(quizId)
    if (!source) throw new RepositoryError('database', 'That quiz could not be found.')
    if (source.archivedAt !== null) {
      throw new RepositoryError('database', 'Restore this quiz before duplicating it.')
    }
    return this.saveQuiz(createDuplicateQuizInput(source))
  }

  async archiveQuiz(quizId: string): Promise<void> {
    await this.rpc('host_archive_quiz', { p_quiz_id: quizId })
  }

  async restoreQuiz(quizId: string): Promise<void> {
    await this.rpc('host_restore_quiz', { p_quiz_id: quizId })
  }

  async permanentlyDeleteQuiz(quizId: string): Promise<QuizDeleteResult> {
    const result = await this.rpc<{ mediaPaths?: unknown }>('host_permanently_delete_quiz', { p_quiz_id: quizId })
    const references = Array.isArray(result?.mediaPaths)
      ? result.mediaPaths.filter((value): value is string => typeof value === 'string')
      : []
    return removeQuestionImages(references, this.client, this.projectUrl)
  }

  getStorageReport(): Promise<StorageReport> {
    return loadSupabaseStorageReport(this.client)
  }

  cleanupUnusedImages(paths: readonly string[]): Promise<StorageCleanupResult> {
    return cleanupSupabaseUnusedImages(this.client, paths)
  }

  async launchGame(quizId: string): Promise<GameSession> {
    return this.rpc<GameSession>('host_launch_game', { p_quiz_id: quizId })
  }

  async getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> {
    const bundle = await this.rpc<{ session: GameSession; quiz: Quiz } | null>('host_get_game', { p_session_id: sessionId })
    return bundle ? { ...bundle, quiz: normaliseQuiz(bundle.quiz) } : null
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
