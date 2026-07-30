import type {
  GameSession,
  JoinResult,
  Player,
  PlayerSession,
  Quiz,
  SafeGameState,
  Unsubscribe,
} from '../../types/domain'
import { scoreExactPair, sortLeaderboard } from '../../utils/scoring'
import type { GameRepository, QuizSaveInput } from '../../services/gameRepository'
import { RepositoryError } from '../../services/gameRepository'
import { sampleQuiz } from './sampleData'

interface DemoState {
  quizzes: Quiz[]
  sessions: GameSession[]
  reconnectTokens: Record<string, string>
}

const STORAGE_KEY = 'katwed.demo.state.v1'
const CHANNEL_NAME = 'katwed-demo-realtime'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function freshState(): DemoState {
  return { quizzes: [clone(sampleQuiz)], sessions: [], reconnectTokens: {} }
}

function isDemoState(value: unknown): value is DemoState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { quizzes?: unknown }).quizzes) &&
    Array.isArray((value as { sessions?: unknown }).sessions)
  )
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
      return isDemoState(value) ? value : freshState()
    } catch {
      return freshState()
    }
  }

  private write(state: DemoState, notify = true, subject = '*'): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (notify) this.channel?.postMessage({ subject, at: Date.now() })
  }

  async listQuizzes(): Promise<Quiz[]> {
    return clone(this.read().quizzes)
  }

  async getQuiz(quizId: string): Promise<Quiz | null> {
    return clone(this.read().quizzes.find((quiz) => quiz.id === quizId) ?? null)
  }

  async saveQuiz(input: QuizSaveInput): Promise<Quiz> {
    const state = this.read()
    const now = new Date().toISOString()
    const existing = input.id ? state.quizzes.find((quiz) => quiz.id === input.id) : undefined
    const quizId = existing?.id ?? uid('quiz')
    const quiz: Quiz = {
      id: quizId,
      title: input.title.trim() || 'Untitled quiz',
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
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    state.quizzes = existing
      ? state.quizzes.map((candidate) => (candidate.id === quiz.id ? quiz : candidate))
      : [...state.quizzes, quiz]
    this.write(state, true, quiz.id)
    return clone(quiz)
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const state = this.read()
    state.quizzes = state.quizzes.filter((quiz) => quiz.id !== quizId)
    state.sessions = state.sessions.filter((session) => session.quizId !== quizId)
    this.write(state, true, quizId)
  }

  async launchGame(quizId: string): Promise<GameSession> {
    const state = this.read()
    const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
    if (!quiz) throw new RepositoryError('database', 'That quiz could not be found.')
    const active = state.sessions.find((session) => session.quizId === quizId && session.status === 'active')
    if (active) return clone(active)

    const usedCodes = new Set(state.sessions.filter((session) => session.status === 'active').map((session) => session.roomCode))
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
  }

  async getHostSession(sessionId: string): Promise<{ session: GameSession; quiz: Quiz } | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    return quiz ? clone({ session, quiz }) : null
  }

  async getActiveSessionForQuiz(quizId: string): Promise<GameSession | null> {
    return clone(
      this.read().sessions.find((session) => session.quizId === quizId && session.status === 'active') ?? null,
    )
  }

  async joinRoom(rawRoomCode: string, rawNickname: string): Promise<JoinResult> {
    const state = this.read()
    const roomCode = rawRoomCode.replace(/\D/g, '')
    const nickname = rawNickname.trim().replace(/\s+/g, ' ')
    const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
    if (!session) throw new RepositoryError('invalid-room', 'We could not find that room.')
    if (session.status !== 'active') throw new RepositoryError('expired-room', 'That room has closed.')
    if (session.phase !== 'lobby') throw new RepositoryError('game-started', 'That game has already started.')
    if (!nickname || nickname.length > 30) throw new RepositoryError('database', 'Enter a nickname of 1–30 characters.')
    if (session.players.some((player) => player.nickname.localeCompare(nickname, 'en-GB', { sensitivity: 'base' }) === 0)) {
      throw new RepositoryError('duplicate-nickname', 'That nickname is already in this game.')
    }

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
  }

  async reconnectPlayer(saved: PlayerSession): Promise<JoinResult | null> {
    const state = this.read()
    const session = state.sessions.find(
      (candidate) => candidate.roomCode === saved.roomCode && candidate.status === 'active',
    )
    if (!session) return null
    const player = session.players.find((candidate) => candidate.id === saved.playerId)
    if (!player || state.reconnectTokens[player.id] !== saved.reconnectToken) return null
    player.connected = true
    this.write(state, true, session.id)
    return clone({ player, reconnectToken: saved.reconnectToken })
  }

  async getSafeGameState(rawRoomCode: string): Promise<SafeGameState | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.roomCode === rawRoomCode)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    if (!quiz) return null
    const question = quiz.questions[session.currentQuestionIndex] ?? null
    const mayReveal = ['reveal', 'leaderboard', 'finished'].includes(session.phase)
    const activeRoster = quiz.roster.filter((member) => member.active).sort((a, b) => a.displayOrder - b.displayOrder)
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
        ? {
            id: question.id,
            imagePath: question.imagePath,
            questionNumber: session.currentQuestionIndex + 1,
            totalQuestions: quiz.questions.length,
            timeLimitSeconds: question.timeLimitSeconds,
          }
        : null,
      roster: activeRoster,
      players: session.players,
      submittedCount: currentAnswers.length,
      leaderboard: sortLeaderboard(session.players),
      reveal:
        mayReveal && question
          ? {
              correctMemberIds: question.correctMemberIds,
              correctNames: question.correctMemberIds.map(
                (id) => quiz.roster.find((member) => member.id === id)?.displayName ?? 'Unknown',
              ) as [string, string],
              caption: question.revealCaption,
            }
          : null,
      questionOpenedAt: session.questionOpenedAt,
      questionClosesAt: session.questionClosesAt,
    })
  }

  async submitAnswer(
    roomCode: string,
    playerId: string,
    reconnectToken: string,
    selectedIds: readonly string[],
  ): Promise<void> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.roomCode === roomCode)
    if (!session || session.status !== 'active') throw new RepositoryError('invalid-room', 'This room is not active.')
    const player = session.players.find((candidate) => candidate.id === playerId)
    if (!player || state.reconnectTokens[playerId] !== reconnectToken) {
      throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
    }
    if (session.phase !== 'question') {
      throw new RepositoryError('invalid-phase', 'Answers are not open.')
    }
    const closesAt = session.questionClosesAt ? new Date(session.questionClosesAt).getTime() : 0
    if (!closesAt || Date.now() > closesAt) throw new RepositoryError('late-submission', 'Time is up for this question.')
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    const question = quiz?.questions[session.currentQuestionIndex]
    if (!quiz || !question) throw new RepositoryError('database', 'The current question could not be loaded.')
    if (session.answers.some((answer) => answer.playerId === playerId && answer.questionId === question.id)) {
      throw new RepositoryError('duplicate-submission', 'You have already answered this question.')
    }
    const activeIds = new Set(quiz.roster.filter((member) => member.active).map((member) => member.id))
    if (selectedIds.length !== 2 || new Set(selectedIds).size !== 2 || selectedIds.some((id) => !activeIds.has(id))) {
      throw new RepositoryError('invalid-selection', 'Select exactly two different active people.')
    }
    const score = scoreExactPair(selectedIds, question.correctMemberIds)
    if (!score.valid) throw new RepositoryError('invalid-selection', 'Select exactly two different people.')
    const openedAt = session.questionOpenedAt ? new Date(session.questionOpenedAt).getTime() : Date.now()
    const responseTimeMs = Math.max(0, Date.now() - openedAt)
    session.answers.push({
      id: uid('answer'),
      sessionId: session.id,
      questionId: question.id,
      playerId,
      selectedMemberIds: [selectedIds[0], selectedIds[1]],
      submittedAt: new Date().toISOString(),
      responseTimeMs,
      correct: score.correct,
      pointsAwarded: score.points,
    })
    if (score.correct) {
      player.totalScore += 1
      player.correctAnswerCount += 1
      player.totalCorrectResponseMs += responseTimeMs
    }
    this.write(state, true, session.id)
  }

  async changePhase(
    sessionId: string,
    action: 'start' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close',
  ): Promise<void> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.id === sessionId)
    const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
    if (!session || !quiz) throw new RepositoryError('database', 'The game could not be found.')
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
        session.phase = 'leaderboard'
        break
      case 'next':
        if (session.phase !== 'leaderboard') throw new RepositoryError('invalid-phase', 'Show the leaderboard first.')
        if (session.currentQuestionIndex + 1 >= quiz.questions.length) {
          session.phase = 'finished'
          session.endedAt = now.toISOString()
        } else {
          session.currentQuestionIndex += 1
          openCurrentQuestion()
        }
        break
      case 'finish':
        session.phase = 'finished'
        session.endedAt = now.toISOString()
        session.questionClosesAt = now.toISOString()
        break
      case 'restart':
        session.phase = 'lobby'
        session.status = 'active'
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
  }

  subscribe(subject: string, callback: () => void): Unsubscribe {
    const handleMessage = (event: MessageEvent<{ subject?: string }>): void => {
      if (event.data.subject === '*' || event.data.subject === subject) callback()
      else callback()
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
