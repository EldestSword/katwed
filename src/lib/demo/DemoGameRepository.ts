import type {
  GameSession,
  JoinResult,
  Player,
  PlayerAnswer,
  PlayerAnswerPayload,
  PlayerSession,
  Question,
  Quiz,
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

interface DemoState {
  quizzes: Quiz[]
  sessions: GameSession[]
  reconnectTokens: Record<string, string>
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
  return { quizzes: clone(sampleQuizzes), sessions: [], reconnectTokens: {} }
}

function normaliseState(state: DemoState): DemoState {
  return {
    ...state,
    quizzes: state.quizzes.map((quiz) => ({
      ...quiz,
      coverImagePath: quiz.coverImagePath ?? null,
      archivedAt: quiz.archivedAt ?? null,
    })),
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
    if (notify) this.channel?.postMessage({ subject, at: Date.now() })
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
        coverImagePath: input.coverImagePath?.trim() || null,
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

  async joinRoom(rawRoomCode: string, rawNickname: string): Promise<JoinResult> {
    return this.withMutation(() => {
      const state = this.read()
      const roomCode = rawRoomCode.replace(/\D/g, '')
      const nickname = rawNickname.trim().replace(/\s+/g, ' ')
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
      if (!session) throw new RepositoryError('invalid-room', 'We could not find that room.')
      if (session.status !== 'active') throw new RepositoryError('expired-room', 'That room has closed.')
      if (session.phase !== 'lobby') throw new RepositoryError('game-started', 'That game has already started.')
      if (!nickname || nickname.length > 30) throw new RepositoryError('database', 'Enter a nickname of 1–30 characters.')
      if (session.players.some((player) =>
        player.nickname.localeCompare(nickname, 'en-GB', { sensitivity: 'base' }) === 0
      )) throw new RepositoryError('duplicate-nickname', 'That nickname is already in this game.')
      const player: Player = {
        id: uid('player'),
        sessionId: session.id,
        nickname,
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
      return clone({
        player: scoresVisible ? player : {
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
    const mayReveal = ['reveal', 'leaderboard', 'finished'].includes(session.phase)
    const scoresVisible = ['leaderboard', 'finished'].includes(session.phase)
    const currentAnswers = question
      ? session.answers.filter((answer) => answer.questionId === question.id)
      : []
    return clone({
      sessionId: session.id,
      quizTitle: quiz.title,
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
      submittedCount: currentAnswers.length,
      leaderboard: scoresVisible ? sortLeaderboard(session.players) : [],
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
      const closesAt = session.questionClosesAt ? new Date(session.questionClosesAt).getTime() : 0
      if (!closesAt || Date.now() > closesAt) throw new RepositoryError('late-submission', 'Time is up for this question.')
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      const question = quiz?.questions[session.currentQuestionIndex]
      if (!quiz || !question) throw new RepositoryError('database', 'The current question could not be loaded.')
      if (session.answers.some((answer) => answer.playerId === playerId && answer.questionId === question.id)) {
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
      session.answers.push({
        id: uid('answer'),
        sessionId: session.id,
        questionId: question.id,
        playerId,
        payload,
        submittedAt: new Date().toISOString(),
        responseTimeMs,
        correct: score.correct,
        pointsAwarded: score.points,
      })
      player.totalScore += score.points
      if (score.correct) {
        player.correctAnswerCount += 1
        player.totalCorrectResponseMs += responseTimeMs
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
