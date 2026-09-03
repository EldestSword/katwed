import { normalisePinpointQuestion } from '../../features/game/pinpointTargets'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
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
} from '../../types/domain'
import type { GameRepository, QuizDeleteResult, QuizSaveInput, RealtimeStatusCallback, RealtimeSubscriptionStatus } from '../../services/gameRepository'
import { RepositoryError } from '../../services/gameRepository'
import { removeQuestionImages } from '../../services/questionImages'
import { config } from '../config'
import { parseSafeGameState } from './safeGameState'
import { createDuplicateQuizInput } from '../../features/quiz-editor/duplicateQuiz'
import type { StorageCleanupResult, StorageReport } from '../../features/storage-manager/storageManager'
import { cleanupSupabaseUnusedImages, loadSupabaseStorageReport } from '../../services/storageManager'
import { normaliseQuizThemeId } from '../../features/themes/quizThemes'
import { normaliseQuizBackgroundId } from '../../features/themes/quizBackgrounds'
import { normaliseQuizHeadToHead } from '../../features/head-to-head/headToHead'
import { normaliseAnswerPalette } from '../../features/answer-palettes/answerPalettes'
import { doubleScoreVariantDurations, getSoundPack, normaliseSoundPackId } from '../../features/audio/soundPacks'
import { normaliseGameSessionSettings } from '../../features/game/launchSettings'
import { hostResponseRecordForAnswer } from '../../features/game/hostResponses'

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
  const answerPalette = normaliseAnswerPalette(
    (quiz as { answerPaletteId?: unknown }).answerPaletteId,
    (quiz as { customAnswerColours?: unknown }).customAnswerColours,
  )
  return normaliseQuizHeadToHead({
    ...quiz,
    questions: quiz.questions.map(normalisePinpointQuestion),
    ...answerPalette,
    soundPackId: normaliseSoundPackId((quiz as { soundPackId?: unknown }).soundPackId),
    themeId,
    backgroundId: normaliseQuizBackgroundId((quiz as { backgroundId?: unknown }).backgroundId, themeId),
  })
}

function normaliseGameSession(
  session: GameSession,
  fallbackSoundPackId: unknown = 'katwed',
  fallbackSettings?: Partial<LaunchGameSettings>,
): GameSession {
  const raw = session as GameSession & {
    settings?: GameSession['settings']
    questionOrder?: unknown
    hostResponses?: unknown
  }
  const answers = Array.isArray(session.answers) ? session.answers.map((answer) => ({
    ...answer,
    automaticCorrect: typeof answer.automaticCorrect === 'boolean' ? answer.automaticCorrect : answer.correct,
    hostCorrectOverride: typeof answer.hostCorrectOverride === 'boolean' ? answer.hostCorrectOverride : null,
  })) : []
  const hostResponses = Array.isArray(raw.hostResponses)
    ? raw.hostResponses.filter((response): response is GameSession['hostResponses'][number] => (
      typeof response === 'object' && response !== null &&
      typeof (response as { id?: unknown }).id === 'string' &&
      typeof (response as { sessionId?: unknown }).sessionId === 'string' &&
      typeof (response as { questionId?: unknown }).questionId === 'string' &&
      typeof (response as { playerId?: unknown }).playerId === 'string' &&
      typeof (response as { submittedAt?: unknown }).submittedAt === 'string'
    ))
    : answers.map(hostResponseRecordForAnswer)
  return {
    ...session,
    settings: normaliseGameSessionSettings(
      raw.settings ?? fallbackSettings,
      fallbackSettings?.soundPackId ?? fallbackSoundPackId,
      session.id,
    ),
    questionOrder: Array.isArray(raw.questionOrder)
      ? raw.questionOrder.filter((id): id is string => typeof id === 'string')
      : [],
    doubleScoreVariantOrder: Array.isArray(session.doubleScoreVariantOrder)
      ? session.doubleScoreVariantOrder.filter((index): index is number => Number.isInteger(index))
      : [0],
    doubleScoreVariantCursor: Number.isInteger(session.doubleScoreVariantCursor) ? session.doubleScoreVariantCursor : 0,
    currentDoubleScoreVariantIndex: Number.isInteger(session.currentDoubleScoreVariantIndex)
      ? session.currentDoubleScoreVariantIndex
      : null,
    hostResponses,
    answers,
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

  async launchGame(quizId: string, settings?: LaunchGameSettings): Promise<GameSession> {
    const pack = getSoundPack(settings?.soundPackId)
    const launchSettings = settings ? {
      ...settings,
      doubleScoreVariantDurationsMs: doubleScoreVariantDurations(pack),
    } : undefined
    return normaliseGameSession(
      await this.rpc<GameSession>('host_launch_game', { p_quiz_id: quizId, p_settings: launchSettings ?? {} }),
      launchSettings?.soundPackId,
      launchSettings,
    )
  }

  async getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> {
    const bundle = await this.rpc<{ session: GameSession; quiz: Quiz } | null>('host_get_game', { p_session_id: sessionId })
    if (!bundle) return null
    const quiz = normaliseQuiz(bundle.quiz)
    return { session: normaliseGameSession(bundle.session, quiz.soundPackId), quiz }
  }

  async getHostLiveSession(sessionId: string): Promise<GameSession | null> {
    const session = await this.rpc<GameSession | null>('host_get_live_session', { p_session_id: sessionId })
    return session ? normaliseGameSession(session) : null
  }

  async getActiveSessionForQuiz(quizId: string): Promise<GameSession | null> {
    const session = await this.rpc<GameSession | null>('host_get_active_game', { p_quiz_id: quizId })
    return session ? normaliseGameSession(session) : null
  }

  async getRoomJoinInfo(roomCode: string): Promise<RoomJoinInfo | null> {
    return this.rpc<RoomJoinInfo | null>('get_room_join_info', { p_room_code: roomCode })
  }

  async joinRoom(roomCode: string, nickname: string): Promise<JoinResult> {
    return this.rpc<JoinResult>('join_room', { p_room_code: roomCode, p_nickname: nickname })
  }

  async joinHeadToHeadRoom(roomCode: string, competitorId: string): Promise<JoinResult> {
    return this.rpc<JoinResult>('join_head_to_head_room', {
      p_room_code: roomCode,
      p_competitor_id: competitorId,
    })
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

  async startHeadToHead(roomCode: string, playerId: string, reconnectToken: string): Promise<void> {
    await this.rpc('start_head_to_head_game', {
      p_room_code: roomCode,
      p_player_id: playerId,
      p_reconnect_token: reconnectToken,
    })
  }

  async skipHeadToHead(
    roomCode: string,
    playerId: string,
    reconnectToken: string,
    expectedQuestionId: string,
  ): Promise<void> {
    await this.rpc('skip_head_to_head_answer', {
      p_room_code: roomCode,
      p_player_id: playerId,
      p_reconnect_token: reconnectToken,
      p_expected_question_id: expectedQuestionId,
    })
  }

  async continueHeadToHead(
    roomCode: string,
    playerId: string,
    reconnectToken: string,
    expectedQuestionId: string,
  ): Promise<void> {
    await this.rpc('continue_head_to_head_game', {
      p_room_code: roomCode,
      p_player_id: playerId,
      p_reconnect_token: reconnectToken,
      p_expected_question_id: expectedQuestionId,
    })
  }

  async setTypedAnswerOverride(sessionId: string, answerId: string, correctOverride: true | null): Promise<void> {
    await this.rpc('host_set_typed_answer_override', {
      p_session_id: sessionId,
      p_answer_id: answerId,
      p_correct_override: correctOverride,
    })
  }

  async changePhase(
    sessionId: string,
    action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close',
  ): Promise<void> {
    await this.rpc(`host_${action}_game`, { p_session_id: sessionId })
  }

  subscribe(subject: string, callback: () => void, onStatus?: RealtimeStatusCallback): Unsubscribe {
    let channel: RealtimeChannel = this.client.channel(`katwed:${subject}`, { config: { private: false } })
    channel = channel
      .on('broadcast', { event: 'game_changed' }, callback)
      .subscribe((status) => onStatus?.(status as RealtimeSubscriptionStatus))
    return () => {
      void this.client.removeChannel(channel)
    }
  }
}
