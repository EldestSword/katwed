import type {
  GameSession,
  JoinResult,
  Player,
  PlayerAnswer,
  PlayerAnswerPayload,
  PlayerSession,
  Question,
  Quiz,
  RoomJoinInfo,
  RevealPayload,
  SafeGameState,
  SafeQuestion,
  Unsubscribe,
} from '../../types/domain'
import { scoreQuestion, sortLeaderboard } from '../../utils/scoring'
import type { GameRepository, QuizDeleteResult, QuizSaveInput } from '../../services/gameRepository'
import { RepositoryError } from '../../services/gameRepository'
import { sampleQuizzes } from './sampleData'
import { validateQuizSave } from '../../features/quiz-editor/validation'
import { createDuplicateQuizInput } from '../../features/quiz-editor/duplicateQuiz'
import {
  buildStorageReport,
  classifyDemoInventory,
  collectQuizImageReferences,
  type StorageCleanupResult,
  type StorageReport,
} from '../../features/storage-manager/storageManager'
import { listDemoStoredImages, removeDemoStoredImages } from '../../services/questionImages'
import { normaliseQuizThemeId } from '../../features/themes/quizThemes'
import { normaliseQuizBackgroundId } from '../../features/themes/quizBackgrounds'
import { normaliseQuizHeadToHead } from '../../features/head-to-head/headToHead'

interface DemoHeadToHeadSkip {
  sessionId: string
  questionId: string
  playerId: string
}

interface DemoState {
  quizzes: Quiz[]
  sessions: GameSession[]
  reconnectTokens: Record<string, string>
  headToHeadSkips: DemoHeadToHeadSkip[]
}

const STORAGE_KEY = 'katwed.demo.state.v2'
const CHANNEL_NAME = 'katwed-demo-realtime-v2'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function freshState(): DemoState {
  return { quizzes: clone(sampleQuizzes), sessions: [], reconnectTokens: {}, headToHeadSkips: [] }
}

function normaliseState(state: DemoState): DemoState {
  return {
    ...state,
    headToHeadSkips: state.headToHeadSkips ?? [],
    quizzes: state.quizzes.map((quiz) => {
      const themeId = normaliseQuizThemeId((quiz as { themeId?: unknown }).themeId)
      return normaliseQuizHeadToHead({
        ...quiz,
        coverImagePath: quiz.coverImagePath ?? null,
        themeId,
        backgroundId: normaliseQuizBackgroundId((quiz as { backgroundId?: unknown }).backgroundId, themeId),
        archivedAt: quiz.archivedAt ?? null,
      })
    }),
  }
}

function isDemoState(value: unknown): value is DemoState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { quizzes?: unknown }).quizzes) &&
    Array.isArray((value as { sessions?: unknown }).sessions) &&
    typeof (value as { reconnectTokens?: unknown }).reconnectTokens === 'object'
  )
}

function safeBase(question: Question, questionNumber: number, totalQuestions: number) {
  return {
    id: question.id,
    assignedCompetitorId: question.assignedCompetitorId,
    prompt: question.prompt,
    supportingText: question.supportingText,
    timeLimitSeconds: question.timeLimitSeconds,
    points: question.points,
    displayOrder: question.displayOrder,
    media: question.media,
    mediaVisibility: question.mediaVisibility,
    presentationChoiceVisibility: question.presentationChoiceVisibility,
    questionNumber,
    totalQuestions,
  }
}

function isHeadToHeadResolved(state: DemoState, session: GameSession, questionId: string, playerId: string): boolean {
  return session.answers.some((answer) => answer.questionId === questionId && answer.playerId === playerId) ||
    state.headToHeadSkips.some((skip) => skip.sessionId === session.id && skip.questionId === questionId && skip.playerId === playerId)
}

function revealHeadToHeadWhenComplete(state: DemoState, session: GameSession, question: Question): void {
  if (session.players.length !== 2 || !session.players.every((player) => isHeadToHeadResolved(state, session, question.id, player.id))) return
  session.phase = 'reveal'
}

function toSafeQuestion(question: Question, questionNumber: number, totalQuestions: number): SafeQuestion {
  const base = safeBase(question, questionNumber, totalQuestions)
  switch (question.type) {
    case 'single-choice':
      return { ...base, type: question.type, options: question.options, randomiseOptions: question.randomiseOptions }
    case 'multiple-select':
      return {
        ...base,
        type: question.type,
        options: question.options,
        minimumSelections: question.minimumSelections,
        maximumSelections: question.maximumSelections,
        randomiseOptions: question.randomiseOptions,
      }
    case 'true-false':
      return { ...base, type: question.type }
    case 'slider':
      return {
        ...base,
        type: question.type,
        minimum: question.minimum,
        maximum: question.maximum,
        step: question.step,
        prefix: question.prefix,
        suffix: question.suffix,
        unitLabel: question.unitLabel,
      }
    case 'pinpoint':
      return { ...base, type: question.type, media: question.media }
    case 'typed-answer':
      return { ...base, type: question.type }
    case 'mashup':
      return { ...base, type: question.type, media: question.media }
  }
}

function revealFor(question: Question, answers: readonly PlayerAnswer[], quiz: Quiz): RevealPayload {
  switch (question.type) {
    case 'single-choice': {
      const optionCounts = Object.fromEntries(question.options.map((option) => [option.id, 0]))
      answers.forEach((answer) => {
        if (answer.payload.type === 'single-choice') {
          optionCounts[answer.payload.optionId] = (optionCounts[answer.payload.optionId] ?? 0) + 1
        }
      })
      return { type: question.type, correctOptionId: question.correctOptionId, caption: question.revealCaption, optionCounts }
    }
    case 'multiple-select': {
      const optionCounts = Object.fromEntries(question.options.map((option) => [option.id, 0]))
      answers.forEach((answer) => {
        if (answer.payload.type === 'multiple-select') {
          answer.payload.optionIds.forEach((id) => {
            optionCounts[id] = (optionCounts[id] ?? 0) + 1
          })
        }
      })
      return {
        type: question.type,
        correctOptionIds: question.correctOptionIds,
        scoringMode: question.scoringMode,
        caption: question.revealCaption,
        optionCounts,
      }
    }
    case 'true-false': {
      const counts = { true: 0, false: 0 }
      answers.forEach((answer) => {
        if (answer.payload.type === 'true-false') counts[String(answer.payload.value) as 'true' | 'false'] += 1
      })
      return { type: question.type, correctValue: question.correctValue, caption: question.revealCaption, counts }
    }
    case 'slider':
      return {
        type: question.type,
        correctValue: question.correctValue,
        tolerance: question.tolerance,
        caption: question.revealCaption,
        values: answers.flatMap((answer) => answer.payload.type === 'slider' ? [answer.payload.value] : []),
      }
    case 'pinpoint':
      return {
        type: question.type,
        targetX: question.targetX,
        targetY: question.targetY,
        targetRadius: question.targetRadius,
        caption: question.revealCaption,
        points: answers.flatMap((answer) => answer.payload.type === 'pinpoint'
          ? [{ x: answer.payload.x, y: answer.payload.y }]
          : []),
      }
    case 'typed-answer':
      return {
        type: question.type,
        correctAnswer: question.correctAnswer,
        caption: question.revealCaption,
      }
    case 'mashup':
      return {
        type: question.type,
        correctMemberIds: question.correctMemberIds,
        correctNames: question.correctMemberIds.map(
          (id) => quiz.roster.find((member) => member.id === id)?.displayName ?? 'Unknown',
        ) as [string, string],
        caption: question.revealCaption,
      }
  }
}

export class DemoGameRepository implements GameRepository {
  readonly mode = 'demo' as const
  private readonly channel: BroadcastChannel | null

  constructor() {
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
  }

  private read(): DemoState {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      const state = freshState()
      this.write(state, false)
      return state
    }
    try {
      const value: unknown = JSON.parse(stored)
      return isDemoState(value) ? normaliseState(value) : freshState()
    } catch {
      return freshState()
    }
  }

  private write(state: DemoState, notify = true, subject = '*'): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (notify) {
      const at = Date.now()
      this.channel?.postMessage({ subject, at })
      const session = state.sessions.find((candidate) => candidate.id === subject || candidate.roomCode === subject)
      if (session && session.id !== subject) this.channel?.postMessage({ subject: session.id, at })
      if (session && session.roomCode !== subject) this.channel?.postMessage({ subject: session.roomCode, at })
    }
  }

  private async withMutation<T>(operation: () => T): Promise<T> {
    if (navigator.locks) {
      return navigator.locks.request('katwed-demo-state-write-v2', operation) as Promise<T>
    }
    return operation()
  }

  async listQuizzes(): Promise<Quiz[]> {
    return clone(this.read().quizzes.filter((quiz) => quiz.archivedAt === null))
  }

  async listArchivedQuizzes(): Promise<Quiz[]> {
    return clone(this.read().quizzes.filter((quiz) => quiz.archivedAt !== null))
  }

  async getQuiz(quizId: string): Promise<Quiz | null> {
    return clone(this.read().quizzes.find((quiz) => quiz.id === quizId) ?? null)
  }

  async saveQuiz(input: QuizSaveInput): Promise<Quiz> {
    const validationMessages = validateQuizSave(input)
    if (validationMessages.length) throw new RepositoryError('database', validationMessages[0])
    return this.withMutation(() => {
      const state = this.read()
      const now = new Date().toISOString()
      const existing = input.id ? state.quizzes.find((quiz) => quiz.id === input.id) : undefined
      const quizId = existing?.id ?? uid('quiz')
      const quiz: Quiz = {
        id: quizId,
        title: input.title.trim() || 'Untitled quiz',
        quizType: input.quizType,
        headToHeadCompetitors: input.headToHeadCompetitors.map((competitor, displayOrder) => ({
          ...competitor,
          quizId,
          displayName: competitor.displayName.trim(),
          displayOrder: displayOrder as 0 | 1,
        })),
        coverImagePath: input.coverImagePath?.trim() || null,
        themeId: input.themeId,
        backgroundId: input.backgroundId,
        roster: input.roster.map((member, index) => ({
          ...member,
          id: member.id || uid('member'),
          quizId,
          displayOrder: index,
        })),
        questions: input.questions.map((question, index) => ({
          ...question,
          id: question.id || uid('question'),
          quizId,
          displayOrder: index,
        })),
        archivedAt: existing?.archivedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      state.quizzes = existing
        ? state.quizzes.map((candidate) => candidate.id === quiz.id ? quiz : candidate)
        : [...state.quizzes, quiz]
      this.write(state, true, quiz.id)
      return clone(quiz)
    })
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
    return this.withMutation(() => {
      const state = this.read()
      const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
      if (!quiz) throw new RepositoryError('database', 'That quiz could not be found.')
      if (quiz.archivedAt !== null) throw new RepositoryError('database', 'That quiz is already archived.')
      if (state.sessions.some((session) => session.quizId === quizId && session.status === 'active')) {
        throw new RepositoryError('database', 'Close the active game before archiving this quiz.')
      }
      quiz.archivedAt = new Date().toISOString()
      quiz.updatedAt = quiz.archivedAt
      this.write(state, true, quizId)
    })
  }

  async restoreQuiz(quizId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
      if (!quiz) throw new RepositoryError('database', 'That quiz could not be found.')
      if (quiz.archivedAt === null) throw new RepositoryError('database', 'That quiz is not archived.')
      quiz.archivedAt = null
      quiz.updatedAt = new Date().toISOString()
      this.write(state, true, quizId)
    })
  }

  async permanentlyDeleteQuiz(quizId: string): Promise<QuizDeleteResult> {
    return this.withMutation(() => {
      const state = this.read()
      const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
      if (!quiz) throw new RepositoryError('database', 'That quiz could not be found.')
      if (quiz.archivedAt === null) {
        throw new RepositoryError('database', 'Archive this quiz before permanently deleting it.')
      }
      if (state.sessions.some((session) => session.quizId === quizId && session.status === 'active')) {
        throw new RepositoryError('database', 'Close the active game before permanently deleting this quiz.')
      }
      state.quizzes = state.quizzes.filter((quiz) => quiz.id !== quizId)
      state.sessions = state.sessions.filter((session) => session.quizId !== quizId)
      this.write(state, true, quizId)
      return { deletedMediaCount: 0, failedMediaCount: 0 }
    })
  }

  async getStorageReport(): Promise<StorageReport> {
    const inventory = await listDemoStoredImages()
    const classification = classifyDemoInventory(inventory, collectQuizImageReferences(this.read().quizzes))
    return buildStorageReport(inventory, classification)
  }

  async cleanupUnusedImages(paths: readonly string[]): Promise<StorageCleanupResult> {
    const inventory = await listDemoStoredImages()
    const inventoryPaths = new Set(inventory.map((object) => object.path))
    const uniquePaths = [...new Set(paths)]
    const requested = uniquePaths.filter((path) => inventoryPaths.has(path))
    const classification = classifyDemoInventory(inventory, collectQuizImageReferences(this.read().quizzes))
    const referenced = new Set(classification.referencedPaths)
    const unused = new Set(classification.unusedPaths)
    const ignored = new Set(classification.ignoredPaths)
    const stillUnused = requested.filter((path) => unused.has(path))
    const uncertainCount = requested.filter((path) => (
      ignored.has(path) || (!referenced.has(path) && !unused.has(path))
    )).length
    const removal = stillUnused.length
      ? await removeDemoStoredImages(stillUnused)
      : { deletedMediaCount: 0, failedMediaCount: 0 }
    return {
      removedCount: removal.deletedMediaCount,
      preservedCount: requested.filter((path) => referenced.has(path)).length,
      failedCount: uniquePaths.length - requested.length + uncertainCount + removal.failedMediaCount,
    }
  }

  async launchGame(quizId: string): Promise<GameSession> {
    return this.withMutation(() => {
      const state = this.read()
      const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
      if (!quiz) throw new RepositoryError('database', 'That quiz could not be found.')
      if (quiz.archivedAt !== null) throw new RepositoryError('database', 'Restore this quiz before launching it.')
      if (quiz.quizType === 'head-to-head') {
        const competitorIds = new Set(quiz.headToHeadCompetitors.map((competitor) => competitor.id))
        if (quiz.headToHeadCompetitors.length !== 2 || !quiz.questions.length ||
          quiz.questions.some((question) => !question.assignedCompetitorId || !competitorIds.has(question.assignedCompetitorId))) {
          throw new RepositoryError('database', 'Complete both competitors and every question assignment before launching.')
        }
      }
      const active = state.sessions.find((session) => session.quizId === quizId && session.status === 'active')
      if (active) return clone(active)
      const usedCodes = new Set(state.sessions.map((session) => session.roomCode))
      let roomCode: string
      do roomCode = String(100000 + Math.floor(Math.random() * 900000))
      while (usedCodes.has(roomCode))
      const session: GameSession = {
        id: uid('game'),
        quizId,
        roomCode,
        status: 'active',
        phase: 'lobby',
        currentQuestionIndex: 0,
        questionOpenedAt: null,
        questionClosesAt: null,
        startedAt: null,
        endedAt: null,
        players: [],
        answers: [],
      }
      state.sessions.push(session)
      this.write(state, true, session.id)
      return clone(session)
    })
  }

  async getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    return quiz ? clone({ session, quiz }) : null
  }

  async getActiveSessionForQuiz(quizId: string): Promise<GameSession | null> {
    return clone(this.read().sessions.find(
      (session) => session.quizId === quizId && session.status === 'active',
    ) ?? null)
  }

  async getRoomJoinInfo(rawRoomCode: string): Promise<RoomJoinInfo | null> {
    const state = this.read()
    const roomCode = rawRoomCode.replace(/\D/g, '')
    const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    if (!quiz) return null
    return clone({
      roomCode,
      quizTitle: quiz.title,
      quizType: quiz.quizType,
      status: session.status,
      phase: session.phase,
      headToHeadCompetitors: quiz.headToHeadCompetitors.map((competitor) => {
        const player = session.players.find((candidate) => candidate.competitorId === competitor.id)
        return {
          competitorId: competitor.id,
          displayName: competitor.displayName,
          displayOrder: competitor.displayOrder,
          claimed: Boolean(player),
          connected: player?.connected ?? false,
        }
      }),
    })
  }

  async joinRoom(rawRoomCode: string, rawNickname: string): Promise<JoinResult> {
    return this.withMutation(() => {
      const state = this.read()
      const roomCode = rawRoomCode.replace(/\D/g, '')
      const nickname = rawNickname.trim().replace(/\s+/g, ' ')
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
      if (!session) throw new RepositoryError('invalid-room', 'We could not find that room.')
      if (session.status !== 'active') throw new RepositoryError('expired-room', 'That room has closed.')
      if (session.phase !== 'lobby') throw new RepositoryError('game-started', 'That game has already started.')
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      if (quiz?.quizType === 'head-to-head') {
        throw new RepositoryError('invalid-selection', 'Choose one of the two Head-to-Head competitors instead.')
      }
      if (!nickname || nickname.length > 30) throw new RepositoryError('database', 'Enter a nickname of 1–30 characters.')
      if (session.players.some((player) =>
        player.nickname.localeCompare(nickname, 'en-GB', { sensitivity: 'base' }) === 0
      )) throw new RepositoryError('duplicate-nickname', 'That nickname is already in this game.')
      const player: Player = {
        id: uid('player'),
        sessionId: session.id,
        nickname,
        competitorId: null,
        connected: true,
        joinedAt: new Date().toISOString(),
        totalScore: 0,
        correctAnswerCount: 0,
        totalCorrectResponseMs: 0,
      }
      const reconnectToken = `${crypto.randomUUID()}${crypto.randomUUID()}`
      session.players.push(player)
      state.reconnectTokens[player.id] = reconnectToken
      this.write(state, true, session.id)
      return clone({ player, reconnectToken })
    })
  }


  async joinHeadToHeadRoom(rawRoomCode: string, competitorId: string): Promise<JoinResult> {
    return this.withMutation(() => {
      const state = this.read()
      const roomCode = rawRoomCode.replace(/\D/g, '')
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
      if (!session) throw new RepositoryError('invalid-room', 'We could not find that room.')
      if (session.status !== 'active') throw new RepositoryError('expired-room', 'That room has closed.')
      if (session.phase !== 'lobby') throw new RepositoryError('game-started', 'That game has already started.')
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      if (!quiz || quiz.quizType !== 'head-to-head') {
        throw new RepositoryError('invalid-selection', 'This room uses ordinary nickname joining.')
      }
      const competitor = quiz.headToHeadCompetitors.find((candidate) => candidate.id === competitorId)
      if (!competitor) throw new RepositoryError('invalid-selection', 'Choose a valid competitor.')
      if (session.players.some((player) => player.competitorId === competitorId)) {
        throw new RepositoryError('duplicate-nickname', `${competitor.displayName} has already joined this game.`)
      }
      const player: Player = {
        id: uid('player'),
        sessionId: session.id,
        nickname: competitor.displayName,
        competitorId,
        connected: true,
        joinedAt: new Date().toISOString(),
        totalScore: 0,
        correctAnswerCount: 0,
        totalCorrectResponseMs: 0,
      }
      const reconnectToken = `${crypto.randomUUID()}${crypto.randomUUID()}`
      session.players.push(player)
      state.reconnectTokens[player.id] = reconnectToken
      this.write(state, true, session.id)
      return clone({ player, reconnectToken })
    })
  }

  async reconnectPlayer(saved: PlayerSession): Promise<JoinResult | null> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find(
        (candidate) => candidate.roomCode === saved.roomCode && candidate.status === 'active',
      )
      if (!session) return null
      const player = session.players.find((candidate) => candidate.id === saved.playerId)
      if (!player || state.reconnectTokens[player.id] !== saved.reconnectToken) return null
      player.connected = true
      this.write(state, true, session.id)
      const scoresVisible = ['leaderboard', 'finished'].includes(session.phase)
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      const headToHead = quiz?.quizType === 'head-to-head'
      return clone({
        player: scoresVisible || headToHead ? player : {
          ...player,
          totalScore: 0,
          correctAnswerCount: 0,
          totalCorrectResponseMs: 0,
        },
        reconnectToken: saved.reconnectToken,
      })
    })
  }

  async setPlayerPresence(saved: PlayerSession, connected: boolean): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find(
        (candidate) => candidate.roomCode === saved.roomCode && candidate.status === 'active',
      )
      const player = session?.players.find((candidate) => candidate.id === saved.playerId)
      if (!session || !player || state.reconnectTokens[player.id] !== saved.reconnectToken) {
        throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      }
      if (player.connected === connected) return
      player.connected = connected
      this.write(state, true, session.id)
    })
  }

  async getSafeGameState(rawRoomCode: string): Promise<SafeGameState | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.roomCode === rawRoomCode)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    if (!quiz) return null
      const question = quiz.questions[session.currentQuestionIndex] ?? null
    const headToHead = quiz.quizType === 'head-to-head'
    const mayReveal = ['reveal', 'leaderboard', 'finished'].includes(session.phase)
    const scoresVisible = headToHead || ['leaderboard', 'finished'].includes(session.phase)
    const currentAnswers = question
      ? session.answers.filter((answer) => answer.questionId === question.id)
      : []
    return clone({
      sessionId: session.id,
      quizTitle: quiz.title,
      quizType: quiz.quizType,
      themeId: quiz.themeId,
      backgroundId: quiz.backgroundId,
      roomCode: session.roomCode,
      status: session.status,
      phase: session.phase,
      currentQuestion: question
        ? toSafeQuestion(question, session.currentQuestionIndex + 1, quiz.questions.length)
        : null,
      roster: question?.type === 'mashup'
        ? quiz.roster.filter((member) => member.active).sort((a, b) => a.displayOrder - b.displayOrder)
        : [],
      players: session.players.map((player) => scoresVisible ? player : {
        ...player,
        totalScore: 0,
        correctAnswerCount: 0,
        totalCorrectResponseMs: 0,
      }),
      headToHeadCompetitors: headToHead ? quiz.headToHeadCompetitors.map((competitor) => {
        const player = session.players.find((candidate) => candidate.competitorId === competitor.id)
        return {
          competitorId: competitor.id,
          displayName: competitor.displayName,
          displayOrder: competitor.displayOrder,
          claimed: Boolean(player),
          connected: player?.connected ?? false,
          playerId: player?.id ?? null,
          totalScore: player?.totalScore ?? 0,
          correctAnswerCount: player?.correctAnswerCount ?? 0,
        }
      }) : [],
      headToHeadResolutions: headToHead && question ? session.players.flatMap((player) => {
        const answer = currentAnswers.find((candidate) => candidate.playerId === player.id)
        const skipped = state.headToHeadSkips.some((skip) => skip.sessionId === session.id && skip.questionId === question.id && skip.playerId === player.id)
        return answer || skipped ? [{
          playerId: player.id,
          competitorId: player.competitorId!,
          status: skipped ? 'skipped' as const : 'answered' as const,
        }] : []
      }) : [],
      headToHeadResults: headToHead && mayReveal && question ? session.players.map((player) => {
        const answer = currentAnswers.find((candidate) => candidate.playerId === player.id)
        const assigned = player.competitorId === question.assignedCompetitorId
        return {
          competitorId: player.competitorId!,
          assigned,
          status: answer ? (answer.correct ? 'correct' as const : 'incorrect' as const) : 'skipped' as const,
          pointsAwarded: (answer?.pointsAwarded ?? 0) as 0 | 1,
        }
      }) : [],
      submittedCount: currentAnswers.length + (question ? state.headToHeadSkips.filter((skip) => skip.sessionId === session.id && skip.questionId === question.id).length : 0),
      leaderboard: !headToHead && scoresVisible ? sortLeaderboard(session.players) : [],
      reveal: mayReveal && question ? revealFor(question, currentAnswers, quiz) : null,
      questionOpenedAt: session.questionOpenedAt,
      questionClosesAt: session.questionClosesAt,
    })
  }

  async submitAnswer(
    roomCode: string,
    playerId: string,
    reconnectToken: string,
    payload: PlayerAnswerPayload,
  ): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
      if (!session || session.status !== 'active') throw new RepositoryError('invalid-room', 'This room is not active.')
      const player = session.players.find((candidate) => candidate.id === playerId)
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) {
        throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      }
      if (session.phase !== 'question') throw new RepositoryError('invalid-phase', 'Answers are not open.')
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      const question = quiz?.questions[session.currentQuestionIndex]
      if (!quiz || !question) throw new RepositoryError('database', 'The current question could not be loaded.')
      if (quiz.quizType === 'standard') {
        const closesAt = session.questionClosesAt ? new Date(session.questionClosesAt).getTime() : 0
        if (!closesAt || Date.now() > closesAt) throw new RepositoryError('late-submission', 'Time is up for this question.')
      }
      if (isHeadToHeadResolved(state, session, question.id, playerId)) {
        throw new RepositoryError('duplicate-submission', 'You have already answered this question.')
      }
      if (question.type === 'mashup' && payload.type === 'mashup') {
        const activeIds = new Set(quiz.roster.filter((member) => member.active).map((member) => member.id))
        if (payload.memberIds.some((id) => !activeIds.has(id))) {
          throw new RepositoryError('invalid-selection', 'Select exactly two different active people.')
        }
      }
      const score = scoreQuestion(question, payload)
      if (!score.valid) throw new RepositoryError('invalid-selection', 'That answer is not valid for this question.')
      const openedAt = session.questionOpenedAt ? new Date(session.questionOpenedAt).getTime() : Date.now()
      const responseTimeMs = Math.max(0, Date.now() - openedAt)
      const assigned = quiz.quizType === 'head-to-head' && player.competitorId === question.assignedCompetitorId
      const pointsAwarded = quiz.quizType === 'head-to-head' ? (assigned && score.correct ? 1 : 0) : score.points
      session.answers.push({
        id: uid('answer'),
        sessionId: session.id,
        questionId: question.id,
        playerId,
        payload,
        resolutionStatus: 'answered',
        submittedAt: new Date().toISOString(),
        responseTimeMs,
        correct: score.correct,
        pointsAwarded,
      })
      player.totalScore += pointsAwarded
      if (score.correct && (quiz.quizType === 'standard' || assigned)) {
        player.correctAnswerCount += 1
        if (quiz.quizType === 'standard') player.totalCorrectResponseMs += responseTimeMs
      }
      if (quiz.quizType === 'head-to-head') revealHeadToHeadWhenComplete(state, session, question)
      this.write(state, true, session.id)
    })
  }

  async startHeadToHead(roomCode: string, playerId: string, reconnectToken: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode && candidate.status === 'active')
      const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
      const player = session?.players.find((candidate) => candidate.id === playerId)
      if (!session || !quiz || quiz.quizType !== 'head-to-head') throw new RepositoryError('invalid-room', 'This Head-to-Head room is not active.')
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      if (session.phase !== 'lobby') return
      if (session.players.length !== 2 || quiz.headToHeadCompetitors.some((competitor) => !session.players.some((candidate) => candidate.competitorId === competitor.id))) {
        throw new RepositoryError('invalid-phase', 'Both competitors must join before the game can start.')
      }
      const question = quiz.questions[0]
      if (!question) throw new RepositoryError('database', 'This quiz has no questions.')
      const now = new Date().toISOString()
      session.phase = 'question'
      session.currentQuestionIndex = 0
      session.questionOpenedAt = now
      session.questionClosesAt = null
      session.startedAt = now
      this.write(state, true, session.id)
    })
  }

  async skipHeadToHead(roomCode: string, playerId: string, reconnectToken: string, expectedQuestionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode && candidate.status === 'active')
      const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
      const player = session?.players.find((candidate) => candidate.id === playerId)
      const question = quiz && session ? quiz.questions[session.currentQuestionIndex] : undefined
      if (!session || !quiz || quiz.quizType !== 'head-to-head') throw new RepositoryError('invalid-room', 'This Head-to-Head room is not active.')
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      if (session.phase !== 'question' || !question || question.id !== expectedQuestionId) throw new RepositoryError('invalid-phase', 'That question is no longer open.')
      if (player.competitorId === question.assignedCompetitorId) throw new RepositoryError('invalid-selection', 'The assigned competitor must answer this question.')
      if (isHeadToHeadResolved(state, session, question.id, playerId)) throw new RepositoryError('duplicate-submission', 'You have already resolved this question.')
      state.headToHeadSkips.push({ sessionId: session.id, questionId: question.id, playerId })
      revealHeadToHeadWhenComplete(state, session, question)
      this.write(state, true, session.id)
    })
  }

  async continueHeadToHead(roomCode: string, playerId: string, reconnectToken: string, expectedQuestionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode && candidate.status === 'active')
      const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
      const player = session?.players.find((candidate) => candidate.id === playerId)
      if (!session || !quiz || quiz.quizType !== 'head-to-head') throw new RepositoryError('invalid-room', 'This Head-to-Head room is not active.')
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      const question = quiz.questions[session.currentQuestionIndex]
      if (session.phase === 'finished') return
      if (!question || question.id !== expectedQuestionId) return
      if (session.phase !== 'reveal') throw new RepositoryError('invalid-phase', 'Wait for both competitors to resolve the question.')
      if (session.currentQuestionIndex + 1 >= quiz.questions.length) {
        session.phase = 'finished'
        session.endedAt = new Date().toISOString()
      } else {
        session.currentQuestionIndex += 1
        session.phase = 'question'
        session.questionOpenedAt = new Date().toISOString()
        session.questionClosesAt = null
      }
      this.write(state, true, session.id)
    })
  }

  async changePhase(
    sessionId: string,
    action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close',
  ): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.id === sessionId)
      const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
      if (!session || !quiz) throw new RepositoryError('database', 'The game could not be found.')
      if (session.status !== 'active') throw new RepositoryError('expired-room', 'This room is closed.')
      if (quiz.quizType === 'head-to-head' && action !== 'close') {
        throw new RepositoryError('invalid-phase', 'Head-to-Head progression is controlled by the competitors.')
      }
      const now = new Date()
      const openCurrentQuestion = (): void => {
        const question = quiz.questions[session.currentQuestionIndex]
        if (!question) throw new RepositoryError('database', 'This quiz has no question to open.')
        session.phase = 'question'
        session.questionOpenedAt = now.toISOString()
        session.questionClosesAt = new Date(now.getTime() + question.timeLimitSeconds * 1000).toISOString()
      }
      switch (action) {
        case 'start':
          if (session.phase !== 'lobby') throw new RepositoryError('invalid-phase', 'The game has already started.')
          if (!quiz.questions.length) throw new RepositoryError('database', 'Add at least one question before starting.')
          session.startedAt = now.toISOString()
          session.currentQuestionIndex = 0
          openCurrentQuestion()
          break
        case 'lock':
          if (session.phase !== 'question') throw new RepositoryError('invalid-phase', 'Answers are not currently open.')
          session.phase = 'locked'
          session.questionClosesAt = now.toISOString()
          break
        case 'reveal':
          if (session.phase !== 'locked') throw new RepositoryError('invalid-phase', 'Lock answers before the reveal.')
          session.phase = 'reveal'
          break
        case 'leaderboard':
          if (session.phase !== 'reveal') throw new RepositoryError('invalid-phase', 'Reveal the answer first.')
          if (session.currentQuestionIndex + 1 >= quiz.questions.length) {
            throw new RepositoryError('invalid-phase', 'Reveal the final results instead.')
          }
          session.phase = 'leaderboard'
          break
        case 'next':
          if (session.phase !== 'leaderboard') throw new RepositoryError('invalid-phase', 'Show the leaderboard first.')
          if (session.currentQuestionIndex + 1 >= quiz.questions.length) {
            throw new RepositoryError('invalid-phase', 'There is no next question.')
          }
          session.currentQuestionIndex += 1
          openCurrentQuestion()
          break
        case 'finish':
          if (session.phase === 'reveal' && session.currentQuestionIndex + 1 < quiz.questions.length) {
            throw new RepositoryError('invalid-phase', 'Show the leaderboard before continuing.')
          }
          if (session.phase === 'reveal' && session.currentQuestionIndex + 1 >= quiz.questions.length) {
            session.phase = 'finished'
            session.endedAt = now.toISOString()
            session.questionClosesAt = now.toISOString()
            break
          }
          if (!['question', 'locked'].includes(session.phase)) {
            throw new RepositoryError('invalid-phase', 'The game cannot be finished from this phase.')
          }
          session.phase = 'finished'
          session.endedAt = now.toISOString()
          session.questionClosesAt = now.toISOString()
          break
        case 'restart':
          if (session.phase !== 'finished') throw new RepositoryError('invalid-phase', 'Finish the game before restarting it.')
          session.phase = 'lobby'
          session.currentQuestionIndex = 0
          session.questionOpenedAt = null
          session.questionClosesAt = null
          session.startedAt = null
          session.endedAt = null
          session.answers = []
          session.players.forEach((player) => {
            player.totalScore = 0
            player.correctAnswerCount = 0
            player.totalCorrectResponseMs = 0
          })
          break
        case 'close':
          session.status = 'closed'
          session.phase = 'finished'
          session.endedAt = now.toISOString()
          break
      }
      this.write(state, true, session.id)
    })
  }

  subscribe(subject: string, callback: () => void): Unsubscribe {
    const handleMessage = (event: MessageEvent<{ subject?: string }>): void => {
      if (event.data.subject === '*' || event.data.subject === subject) callback()
    }
    const handleStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY) callback()
    }
    this.channel?.addEventListener('message', handleMessage)
    window.addEventListener('storage', handleStorage)
    return () => {
      this.channel?.removeEventListener('message', handleMessage)
      window.removeEventListener('storage', handleStorage)
    }
  }
}
