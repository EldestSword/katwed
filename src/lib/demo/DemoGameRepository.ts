import { normaliseQuizRounds, canonicaliseRounds, defaultRound, orderedRounds, roundValidation, safeRound } from '../../features/quiz-editor/rounds'
import { normalisePinpointQuestion } from '../../features/game/pinpointTargets'
import { smallestTeam, validateTeamLaunch } from '../../features/teams/teams'
import { shuffledTextItems } from '../../features/questions/arrangementQuestions'
import { connectionSafeFields } from '../../features/questions/connections'
import { applyWager, extractWager } from '../../features/scoring/wager'
import { extractPowerUp, powerUpFinalPoints, powerUpScoringTime, powerUpUnavailableReason } from '../../features/game/powerUps'
import { normaliseStreaks, recomputePlayerStreaks } from '../../features/game/streaks'
import { progressiveSafeMedia } from '../../features/scoring/progressiveReveal'
import type {
  GameSession,
  GameSessionSettings,
  HostTieBreakerState,
  HostResponseRecord,
  JoinResult,
  LaunchGameSettings,
  Player,
  PlayerAnswer,
  PlayerAnswerPayload,
  PlayerSession,
  PersonalPowerUpState,
  PowerUpUse,
  Question,
  Quiz,
  RoomJoinInfo,
  RevealPayload,
  SafeGameState,
  SafeQuestion,
  Unsubscribe,
} from '../../types/domain'
import { scoreQuestion, sortLeaderboard } from '../../utils/scoring'
import type { GameRepository, QuizDeleteResult, QuizSaveInput, RealtimeStatusCallback } from '../../services/gameRepository'
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
import { normaliseAnswerPalette } from '../../features/answer-palettes/answerPalettes'
import { normaliseSoundPackId } from '../../features/audio/soundPacks'
import { shuffledVariantIndices } from '../../features/audio/audioVariantSelection'
import {
  calculateStandardQuestionScore,
  standardQuestionWindow,
} from '../../features/scoring/standardScoring'
import {
  createGameSessionSettings,
  createSessionQuestionOrder,
  normaliseGameSessionSettings,
  orderedSessionQuestions,
  questionPreludeKind,
} from '../../features/game/launchSettings'
import { HOST_RESPONSE_DETAIL_LIMIT, hostResponseRecordForAnswer } from '../../features/game/hostResponses'
import { BUZZ_ANSWER_WINDOW_SECONDS, canUseBuzzIn } from '../../features/game/buzz'
import type { BuzzClaimResult } from '../../types/domain'
import {
  isSurvivorSettings,
  normaliseSurvivorPlayer,
  recomputeSurvivorPlayers,
  survivorAliveCount,
  survivorStandings,
  validateSurvivorLaunch,
} from '../../features/game/survivor'
import {
  applyTieBreakerWinner,
  normaliseTieBreakerValue,
  resolveTieBreakerAnswers,
  TIE_BREAKER_TIME_LIMIT_SECONDS,
  winningTiePlayerIds,
} from '../../features/game/tieBreakers'

interface DemoHeadToHeadSkip {
  sessionId: string
  questionId: string
  playerId: string
}

interface DemoTieBreakerQuestion {
  id: string
  category: string
  prompt: string
  answer: string
  unit: string
  sourceTitle: string
  sourceUrl: string
  sourceNote: string
}

interface DemoTieBreakerAnswer {
  round: number
  questionId: string
  playerId: string
  value: string
  submittedAt: string
  responseTimeMs: number
}

interface DemoGameSession extends GameSession {
  powerUpUses: Array<PowerUpUse & { playerId: string }>
  tieBreakerQuestion: DemoTieBreakerQuestion | null
  tieBreakerRound: number
  tieBreakerWinnerPlayerId: string | null
  tieBreakerUsedQuestionIds: string[]
  tieBreakerContenderRounds: Array<{ round: number; playerIds: string[] }>
  tieBreakerAnswers: DemoTieBreakerAnswer[]
  tieBreakerOpenedAt: string | null
  tieBreakerClosesAt: string | null
}

interface DemoState {
  quizzes: Quiz[]
  sessions: DemoGameSession[]
  reconnectTokens: Record<string, string>
  headToHeadSkips: DemoHeadToHeadSkip[]
}

const STORAGE_KEY = 'katwed.demo.state.v2'
const REFRESH_STORAGE_KEY = 'katwed.demo.refresh.v1'
const CHANNEL_NAME = 'katwed-demo-realtime-v2'

// Demo mode is a browser-only development environment. Production sessions use
// the private 200-row database bank seeded by the forward migration.
const DEMO_TIE_BREAKER_BANK: readonly DemoTieBreakerQuestion[] = [
  { id: 'DEMO-TB01', category: 'Landmarks', prompt: 'How tall is the Eiffel Tower today?', answer: '330', unit: 'metres', sourceTitle: 'Eiffel Tower', sourceUrl: 'https://www.toureiffel.paris/en/the-monument/key-figures', sourceNote: '' },
  { id: 'DEMO-TB02', category: 'Space', prompt: 'How many kilometres is the Moon’s mean radius?', answer: '1737.4', unit: 'kilometres', sourceTitle: 'NASA Moon facts', sourceUrl: 'https://science.nasa.gov/moon/facts/', sourceNote: '' },
  { id: 'DEMO-TB03', category: 'Sport', prompt: 'How many metres long is an Olympic swimming pool?', answer: '50', unit: 'metres', sourceTitle: 'World Aquatics facilities rules', sourceUrl: 'https://www.worldaquatics.com/rules/facilities-rules', sourceNote: '' },
  { id: 'DEMO-TB04', category: 'History', prompt: 'In what year did the first modern Olympic Games open?', answer: '1896', unit: 'year', sourceTitle: 'International Olympic Committee', sourceUrl: 'https://olympics.com/ioc/ancient-olympic-games/history', sourceNote: '' },
]

function demoTieScore(sessionId: string, round: number, questionId: string): number {
  return [...`${sessionId}:${round}:${questionId}`].reduce((value, character) =>
    (Math.imul(value, 31) + character.charCodeAt(0)) | 0, 0)
}

function currentTieBreakerContenders(session: DemoGameSession): string[] {
  return session.tieBreakerContenderRounds.find((entry) => entry.round === session.tieBreakerRound)?.playerIds ?? []
}

function selectDemoTieBreakerQuestion(session: DemoGameSession): DemoTieBreakerQuestion {
  const unused = DEMO_TIE_BREAKER_BANK.filter((question) => !session.tieBreakerUsedQuestionIds.includes(question.id))
  if (!unused.length) throw new RepositoryError('database', 'No unused tie-breaker questions remain.')
  const previousCategory = session.tieBreakerQuestion?.category
  return [...unused].sort((left, right) => {
    const leftRepeat = previousCategory && left.category === previousCategory ? 1 : 0
    const rightRepeat = previousCategory && right.category === previousCategory ? 1 : 0
    return leftRepeat - rightRepeat || demoTieScore(session.id, session.tieBreakerRound + 1, left.id) - demoTieScore(session.id, session.tieBreakerRound + 1, right.id) || left.id.localeCompare(right.id)
  })[0]
}

function beginDemoTieBreaker(session: DemoGameSession, playerIds: readonly string[], now = Date.now()): void {
  if (playerIds.length < 2 || playerIds.some((id) => !session.players.some((player) => player.id === id))) {
    throw new RepositoryError('database', 'Tie-breaker contenders are invalid.')
  }
  const question = selectDemoTieBreakerQuestion(session)
  const round = session.tieBreakerRound + 1
  session.tieBreakerRound = round
  session.tieBreakerQuestion = question
  session.tieBreakerWinnerPlayerId = null
  session.tieBreakerUsedQuestionIds.push(question.id)
  session.tieBreakerContenderRounds.push({ round, playerIds: [...playerIds] })
  session.phase = 'tiebreaker'
  session.questionOpenedAt = null
  session.questionClosesAt = null
  session.buzz = null
  const openedAt = new Date(now).toISOString()
  session.tieBreakerOpenedAt = openedAt
  session.tieBreakerClosesAt = new Date(now + TIE_BREAKER_TIME_LIMIT_SECONDS * 1_000).toISOString()
}

function demoTieBreakerState(session: DemoGameSession): HostTieBreakerState | null {
  const question = session.tieBreakerQuestion
  if (!question || session.tieBreakerRound < 1 || !['tiebreaker', 'tiebreaker-result', 'finished'].includes(session.phase)) return null
  const contenderPlayerIds = currentTieBreakerContenders(session)
  const answers = session.tieBreakerAnswers.filter((answer) => answer.round === session.tieBreakerRound)
  const openedAt = session.tieBreakerOpenedAt ?? ''
  const closesAt = session.tieBreakerClosesAt ?? ''
  const shared = {
    round: session.tieBreakerRound,
    questionId: question.id,
    prompt: question.prompt,
    category: question.category,
    unit: question.unit,
    openedAt,
    closesAt,
    contenderPlayerIds,
    submittedCount: answers.length,
    submittedPlayerIds: answers.map((answer) => answer.playerId),
  }
  if (session.phase === 'tiebreaker') return { ...shared, status: 'question' }
  const resolution = resolveTieBreakerAnswers(contenderPlayerIds.map((playerId) => {
    const player = session.players.find((candidate) => candidate.id === playerId)!
    const answer = answers.find((candidate) => candidate.playerId === playerId)
    return { playerId, nickname: player.nickname, value: answer?.value ?? null, responseTimeMs: answer?.responseTimeMs ?? null }
  }), question.answer)
  return {
    ...shared,
    status: 'result',
    correctAnswer: question.answer,
    results: resolution.results,
    winnerPlayerId: session.tieBreakerWinnerPlayerId,
    unresolvedPlayerIds: resolution.unresolvedPlayerIds,
    sourceTitle: question.sourceTitle,
    sourceUrl: question.sourceUrl,
    sourceNote: question.sourceNote,
  }
}

function safeDemoTieBreakerState(session: DemoGameSession) {
  const state = demoTieBreakerState(session)
  if (!state) return null
  return {
    round: state.round, status: state.status, questionId: state.questionId, prompt: state.prompt,
    category: state.category, unit: state.unit, openedAt: state.openedAt, closesAt: state.closesAt,
    contenderPlayerIds: state.contenderPlayerIds, submittedCount: state.submittedCount,
    ...(state.status === 'result' ? {
      correctAnswer: state.correctAnswer, results: state.results, winnerPlayerId: state.winnerPlayerId,
      unresolvedPlayerIds: state.unresolvedPlayerIds,
    } : {}),
  }
}

function resolveDemoSessionTieBreaker(session: DemoGameSession, now = Date.now()) {
  if (session.phase !== 'tiebreaker' || !session.tieBreakerQuestion) {
    throw new RepositoryError('invalid-phase', 'The tie-breaker is not open.')
  }
  const contenderPlayerIds = currentTieBreakerContenders(session)
  const roundAnswers = session.tieBreakerAnswers.filter((answer) => answer.round === session.tieBreakerRound)
  const resolution = resolveTieBreakerAnswers(contenderPlayerIds.map((playerId) => {
    const player = session.players.find((candidate) => candidate.id === playerId)!
    const answer = roundAnswers.find((candidate) => candidate.playerId === playerId)
    return { playerId, nickname: player.nickname, value: answer?.value ?? null, responseTimeMs: answer?.responseTimeMs ?? null }
  }), session.tieBreakerQuestion.answer)
  session.tieBreakerWinnerPlayerId = resolution.winnerPlayerId
  session.phase = 'tiebreaker-result'
  if (session.tieBreakerClosesAt) session.tieBreakerClosesAt = new Date(Math.min(Date.parse(session.tieBreakerClosesAt), now)).toISOString()
  return resolution
}

function prepareQuestionTiming(session: GameSession, question: Question, transitionMs: number) {
  if (question.doubleScore) {
    const durations = session.settings.doubleScoreVariantDurationsMs?.length
      ? session.settings.doubleScoreVariantDurationsMs
      : [session.settings.doubleScoreIntroMs]
    let order = session.doubleScoreVariantOrder
    let cursor = session.doubleScoreVariantCursor ?? 0
    if (!order || order.length !== durations.length || new Set(order).size !== durations.length || cursor >= order.length) {
      order = shuffledVariantIndices(durations.length, session.currentDoubleScoreVariantIndex ?? null)
      cursor = 0
    }
    const index = order[cursor]
    session.doubleScoreVariantOrder = order
    session.doubleScoreVariantCursor = cursor + 1
    session.currentDoubleScoreVariantIndex = index
    session.settings.doubleScoreIntroMs = durations[index]
  } else {
    session.currentDoubleScoreVariantIndex = null
  }
  return standardQuestionWindow(question, transitionMs, session.settings)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function freshState(): DemoState {
  return normaliseState({ quizzes: clone(sampleQuizzes), sessions: [], reconnectTokens: {}, headToHeadSkips: [] })
}

function normaliseState(state: DemoState): DemoState {
  const quizzes = state.quizzes.map((quiz) => {
    const themeId = normaliseQuizThemeId((quiz as { themeId?: unknown }).themeId)
    const answerPalette = normaliseAnswerPalette(
      (quiz as { answerPaletteId?: unknown }).answerPaletteId,
      (quiz as { customAnswerColours?: unknown }).customAnswerColours,
    )
    return normaliseQuizRounds(normaliseQuizHeadToHead({
      ...quiz,
      questions: quiz.questions.map(question => ({ ...normalisePinpointQuestion(question), buzzInEnabled: question.buzzInEnabled ?? false })),
      ...answerPalette,
      soundPackId: normaliseSoundPackId((quiz as { soundPackId?: unknown }).soundPackId),
      coverImagePath: quiz.coverImagePath ?? null,
      themeId,
      backgroundId: normaliseQuizBackgroundId((quiz as { backgroundId?: unknown }).backgroundId, themeId),
      archivedAt: quiz.archivedAt ?? null,
    }))
  })
  return {
    ...state,
    headToHeadSkips: state.headToHeadSkips ?? [],
    quizzes,
    sessions: state.sessions.map((session) => {
      const quiz = quizzes.find((candidate) => candidate.id === session.quizId)
      if (!quiz) return session
      const existing = (session as Partial<GameSession>).settings
      const settings = existing
        ? normaliseGameSessionSettings(existing, quiz.soundPackId, session.id)
        : createGameSessionSettings(undefined, quiz, session.id)
      const questionOrder = Array.isArray((session as Partial<GameSession>).questionOrder)
        ? (session as Partial<GameSession>).questionOrder as string[]
        : createSessionQuestionOrder(quiz.questions, false, session.id, quiz.rounds)
      const answers = (session.answers ?? []).map((answer) => ({
        ...answer,
        automaticCorrect: typeof answer.automaticCorrect === 'boolean' ? answer.automaticCorrect : answer.correct,
        hostCorrectOverride: typeof answer.hostCorrectOverride === 'boolean' ? answer.hostCorrectOverride : null,
      }))
      const hostResponses = Array.isArray((session as Partial<GameSession>).hostResponses)
        ? (session as Partial<GameSession>).hostResponses as HostResponseRecord[]
        : answers.map(hostResponseRecordForAnswer)
      const durations = settings.doubleScoreVariantDurationsMs?.length
        ? settings.doubleScoreVariantDurationsMs
        : [settings.doubleScoreIntroMs]
      return {
        ...session,
        tieBreakerQuestion: session.tieBreakerQuestion ?? null,
        tieBreakerRound: Number.isInteger(session.tieBreakerRound) ? session.tieBreakerRound : 0,
        tieBreakerWinnerPlayerId: session.tieBreakerWinnerPlayerId ?? null,
        tieBreakerUsedQuestionIds: Array.isArray(session.tieBreakerUsedQuestionIds) ? session.tieBreakerUsedQuestionIds : [],
        tieBreakerContenderRounds: Array.isArray(session.tieBreakerContenderRounds) ? session.tieBreakerContenderRounds : [],
        tieBreakerAnswers: Array.isArray(session.tieBreakerAnswers) ? session.tieBreakerAnswers : [],
        tieBreakerOpenedAt: session.tieBreakerOpenedAt ?? null,
        tieBreakerClosesAt: session.tieBreakerClosesAt ?? null,
        buzz: session.buzz ?? null,
        teams: session.teams ?? [],
        players: session.players.map((player) => normaliseSurvivorPlayer({ ...player, ...normaliseStreaks(player), teamId: player.teamId ?? null }, settings)),
        settings,
        currentRoundId: session.currentRoundId ?? orderedSessionQuestions(quiz.questions, questionOrder)[session.currentQuestionIndex]?.roundId ?? quiz.rounds[0].id,
        questionOrder,
        doubleScoreVariantOrder: Array.isArray(session.doubleScoreVariantOrder)
          ? session.doubleScoreVariantOrder
          : shuffledVariantIndices(durations.length),
        doubleScoreVariantCursor: Number.isInteger(session.doubleScoreVariantCursor) ? session.doubleScoreVariantCursor : 0,
        currentDoubleScoreVariantIndex: Number.isInteger(session.currentDoubleScoreVariantIndex)
          ? session.currentDoubleScoreVariantIndex
          : null,
        hostResponses,
        answers,
      }
    }),
  }
}

function hostSessionView(session: DemoGameSession, quiz: Quiz): GameSession {
  const questionId = orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex]?.id
  const hostResponses = questionId
    ? session.hostResponses.filter((response) => response.questionId === questionId)
    : []
  const answers = questionId && session.settings.showPlayerAnswersToHost &&
      session.players.length <= HOST_RESPONSE_DETAIL_LIMIT
    ? session.answers.filter((answer) => answer.questionId === questionId)
    : []
  const visible = { ...session }
  for (const key of [
    'powerUpUses',
    'tieBreakerQuestion',
    'tieBreakerRound',
    'tieBreakerWinnerPlayerId',
    'tieBreakerUsedQuestionIds',
    'tieBreakerContenderRounds',
    'tieBreakerAnswers',
    'tieBreakerOpenedAt',
    'tieBreakerClosesAt',
  ] as const) Reflect.deleteProperty(visible, key)
  return { ...visible, tieBreaker: demoTieBreakerState(session), hostResponses, answers }
}

function personalPowerUps(session: DemoGameSession, playerId: string): PersonalPowerUpState | null {
  if (!session.settings.powerUpsEnabled) return null
  return { runId: session.settings.powerUpRunId ?? session.id, uses: (session.powerUpUses ?? []).filter(use => use.playerId === playerId).map(use => ({ questionId: use.questionId, powerUp: use.powerUp, ...(use.optionIds ? { optionIds: [...use.optionIds] } : {}) })) }
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
    speedScoringEnabled: question.speedScoringEnabled,
    buzzInEnabled: question.buzzInEnabled ?? false,
    doubleScore: question.doubleScore,
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

function toSafeQuestion(
  question: Question,
  questionNumber: number,
  totalQuestions: number,
  settings: GameSessionSettings,
  clueCount = 0,
  mayReveal = false,
): SafeQuestion {
  const base = {
    ...safeBase(question, questionNumber, totalQuestions),
    wagerEnabled: question.wagerEnabled ?? false,
    progressiveRevealEnabled: question.progressiveRevealEnabled ?? false,
    speedScoringEnabled: question.progressiveRevealEnabled ? false : question.speedScoringEnabled,
    media: progressiveSafeMedia(question.media, Boolean(question.progressiveRevealEnabled), mayReveal),
    forceRandomiseOptions: settings.shuffleAnswerOptions,
    optionOrderSeed: settings.shuffleAnswerOptions ? `${settings.answerOptionSeed}:${question.id}` : undefined,
  }
  switch (question.type) {
    case 'connections': return { ...base, type: question.type, speedScoringEnabled: false, ...connectionSafeFields(question, clueCount, mayReveal) }
    case 'ordering':
      return { ...base, type: question.type, items: shuffledTextItems(question.items, `${settings.answerOptionSeed}:${question.id}:ordering`) }
    case 'matching':
      return { ...base, type: question.type, leftItems: shuffledTextItems(question.leftItems, `${settings.answerOptionSeed}:${question.id}:left`), rightItems: shuffledTextItems(question.rightItems, `${settings.answerOptionSeed}:${question.id}:right`), scoringMode: question.scoringMode }
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
    case 'connections': return { type: question.type, correctAnswer: question.correctAnswer, correctPlayerIds: answers.filter(answer => answer.correct).map(answer => answer.playerId), caption: question.revealCaption }
    case 'ordering': return { type: question.type, correctItemIds: [...question.correctItemIds], caption: question.revealCaption }
    case 'matching': return { type: question.type, correctPairs: question.correctPairs.map((pair) => ({ ...pair })), scoringMode: question.scoringMode, caption: question.revealCaption }
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
        target: question.target!,
        caption: question.revealCaption,
        points: answers.flatMap((answer) => answer.payload.type === 'pinpoint'
          ? [{ x: answer.payload.x, y: answer.payload.y }]
          : []),
      }
    case 'typed-answer':
      return {
        type: question.type,
        correctAnswer: question.correctAnswer,
        correctPlayerIds: answers.filter((answer) => answer.correct).map((answer) => answer.playerId),
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

// Keep async private assists atomic when Web Locks are unavailable (for example
// embedded browsers and tests). Repository instances in this document share it.
let demoMutationTail: Promise<void> = Promise.resolve()

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
      const session = state.sessions.find((candidate) => candidate.id === subject || candidate.roomCode === subject)
      const subjects = [...new Set([
        subject,
        ...(session ? [session.id, session.roomCode] : []),
      ])]
      subjects.forEach((changedSubject) => this.channel?.postMessage({ subject: changedSubject, at }))
      localStorage.setItem(REFRESH_STORAGE_KEY, JSON.stringify({ subjects, at, nonce: crypto.randomUUID() }))
    }
  }

  private async withMutation<T>(operation: () => T | Promise<T>): Promise<T> {
    if (navigator.locks) {
      return navigator.locks.request('katwed-demo-state-write-v2', operation) as Promise<T>
    }
    const result = demoMutationTail.then(operation)
    demoMutationTail = result.then(() => undefined, () => undefined)
    return result
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
      if (!input.rounds && existing && existing.rounds.length !== 1) {
        throw new RepositoryError('database', 'Reload the editor before saving a quiz with multiple rounds.')
      }
      if (input.rounds?.some((round) => state.quizzes.some((quiz) => quiz.id !== quizId && quiz.rounds.some((other) => other.id === round.id)))) {
        throw new RepositoryError('database', 'Round belongs to another quiz.')
      }
      const answerPalette = normaliseAnswerPalette(
        input.answerPaletteId ?? existing?.answerPaletteId,
        input.customAnswerColours ?? existing?.customAnswerColours,
      )
      const quiz: Quiz = {
        id: quizId,
        title: input.title.trim() || 'Untitled quiz',
        quizType: input.quizType,
        rounds: (input.rounds ?? existing?.rounds ?? [defaultRound(quizId)]).map((round) => ({ ...round, quizId })),
        headToHeadCompetitors: input.headToHeadCompetitors.map((competitor, displayOrder) => ({
          ...competitor,
          quizId,
          displayName: competitor.displayName.trim(),
          displayOrder: displayOrder as 0 | 1,
        })),
        coverImagePath: input.coverImagePath?.trim() || null,
        themeId: input.themeId,
        backgroundId: input.backgroundId,
        ...answerPalette,
        soundPackId: normaliseSoundPackId(input.soundPackId ?? existing?.soundPackId),
        roster: input.roster.map((member, index) => ({
          ...member,
          id: member.id || uid('member'),
          quizId,
          displayOrder: index,
        })),
        questions: input.questions.map((question, index) => ({
          ...question,
          buzzInEnabled: question.buzzInEnabled ?? false,
          wagerEnabled: question.wagerEnabled ?? false,
          progressiveRevealEnabled: question.progressiveRevealEnabled ?? false,
          ...(question.type === 'connections' ? { clues: question.clues.map(clue => ({ ...clue, text: clue.text.trim() })), correctAnswer: question.correctAnswer.trim(), acceptedAnswers: question.acceptedAnswers.map(answer => answer.trim()), speedScoringEnabled: false } : {}),
          ...(question.type === 'ordering' ? { items: question.items.map((item) => ({ ...item, label: item.label.trim() })) } : {}),
          ...(question.type === 'matching' ? { leftItems: question.leftItems.map((item) => ({ ...item, label: item.label.trim() })), rightItems: question.rightItems.map((item) => ({ ...item, label: item.label.trim() })) } : {}),
          id: question.id || uid('question'),
          roundId: input.rounds ? question.roundId : existing?.questions.find((item) => item.id === question.id)?.roundId ?? existing?.rounds[0]?.id ?? quizId,
          quizId,
          displayOrder: index,
        })),
        archivedAt: existing?.archivedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const roundMessages = roundValidation(quiz)
      if (roundMessages.length) throw new RepositoryError('database', roundMessages[0])
      const canonical = canonicaliseRounds(quiz)
      state.quizzes = existing
        ? state.quizzes.map((candidate) => candidate.id === quiz.id ? canonical : candidate)
        : [...state.quizzes, canonical]
      this.write(state, true, quiz.id)
      return clone(canonical)
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

  async launchGame(quizId: string, launchSettings?: LaunchGameSettings): Promise<GameSession> {
    return this.withMutation(() => {
      const state = this.read()
      const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
      if (!quiz) throw new RepositoryError('database', 'That quiz could not be found.')
      if (quiz.archivedAt !== null) throw new RepositoryError('database', 'Restore this quiz before launching it.')
      const teamError = validateTeamLaunch(launchSettings, quiz.quizType)
      if (teamError) throw new RepositoryError('invalid-selection', teamError)
      const survivorError = validateSurvivorLaunch(launchSettings, quiz.quizType)
      if (survivorError) throw new RepositoryError('invalid-selection', survivorError)
      if (quiz.quizType === 'head-to-head') {
        if (quiz.questions.some(question => question.buzzInEnabled)) throw new RepositoryError('invalid-selection', 'Buzz-In is Standard-only.')
        if (quiz.questions.some(question => question.wagerEnabled)) throw new RepositoryError('invalid-selection', 'Wager is Standard-only.')
        const competitorIds = new Set(quiz.headToHeadCompetitors.map((competitor) => competitor.id))
        if (quiz.headToHeadCompetitors.length !== 2 || !quiz.questions.length ||
          quiz.questions.some((question) => !question.assignedCompetitorId || !competitorIds.has(question.assignedCompetitorId))) {
          throw new RepositoryError('database', 'Complete both competitors and every question assignment before launching.')
        }
      }
      if (quiz.rounds.some((round) => !quiz.questions.some((question) => question.roundId === round.id))) throw new RepositoryError('database', 'Add a question to every round before launching.')
      const active = state.sessions.find((session) => session.quizId === quizId && session.status === 'active')
      if (active) return clone(hostSessionView(active, quiz))
      const usedCodes = new Set(state.sessions.map((session) => session.roomCode))
      let roomCode: string
      do roomCode = String(100000 + Math.floor(Math.random() * 900000))
      while (usedCodes.has(roomCode))
      const sessionId = uid('game')
      const settings = createGameSessionSettings(launchSettings, quiz, sessionId)
      const doubleScoreVariantOrder = shuffledVariantIndices(settings.doubleScoreVariantDurationsMs?.length ?? 1)
      const session: DemoGameSession = {
        powerUpUses: [],
        tieBreakerQuestion: null,
        tieBreakerRound: 0,
        tieBreakerWinnerPlayerId: null,
        tieBreakerUsedQuestionIds: [],
        tieBreakerContenderRounds: [],
        tieBreakerAnswers: [],
        tieBreakerOpenedAt: null,
        tieBreakerClosesAt: null,
        buzz: null,
        teams: settings.playMode === 'teams' ? (launchSettings?.teamNames ?? ['Team 1', 'Team 2']).map((name, displayOrder) => ({ id: uid('team'), sessionId, name: name.trim(), displayOrder })) : [],
        id: sessionId,
        quizId,
        roomCode,
        status: 'active',
        phase: 'lobby',
        currentRoundId: orderedRounds(quiz.rounds)[0].id,
        currentQuestionIndex: 0,
        connectionClueCount: 0,
        questionOpenedAt: null,
        questionClosesAt: null,
        startedAt: null,
        endedAt: null,
        settings: { ...settings, powerUpRunId: crypto.randomUUID() },
        doubleScoreVariantOrder,
        doubleScoreVariantCursor: 0,
        currentDoubleScoreVariantIndex: null,
        questionOrder: createSessionQuestionOrder(quiz.questions, settings.shuffleQuestionOrder, sessionId, quiz.rounds),
        players: [],
        hostResponses: [],
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
    return quiz ? clone({ session: hostSessionView(session, quiz), quiz }) : null
  }

  async getHostLiveSession(sessionId: string): Promise<GameSession | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    return clone(quiz ? hostSessionView(session, quiz) : null)
  }

  async getActiveSessionForQuiz(quizId: string): Promise<GameSession | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.quizId === quizId && candidate.status === 'active')
    const quiz = state.quizzes.find((candidate) => candidate.id === quizId)
    return clone(session && quiz ? hostSessionView(session, quiz) : null)
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
      playMode: session.settings.playMode ?? 'individual',
      competitionMode: session.settings.competitionMode,
      survivorStartingLives: session.settings.survivorStartingLives,
      teamAssignmentMode: session.settings.teamAssignmentMode,
      teams: (session.teams ?? []).map((team) => ({ ...team, memberCount: session.players.filter((player) => player.teamId === team.id).length })),
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

  async joinRoom(rawRoomCode: string, rawNickname: string, selectedTeamId?: string): Promise<JoinResult> {
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
      let teamId: string | null = null
      if (session.settings.playMode === 'teams') {
        if (session.settings.teamAssignmentMode === 'player-choice') {
          if (!(session.teams ?? []).some((team) => team.id === selectedTeamId && team.sessionId === session.id)) throw new RepositoryError('invalid-selection', 'Choose a team in this room.')
          teamId = selectedTeamId!
        } else {
          if (selectedTeamId) throw new RepositoryError('invalid-selection', 'This room assigns teams for you.')
          if (session.settings.teamAssignmentMode === 'balanced-random') teamId = smallestTeam(session.teams ?? [], session.players)
        }
      } else if (selectedTeamId) throw new RepositoryError('invalid-selection', 'This room uses Individuals.')
      if (session.players.some((player) =>
        player.nickname.localeCompare(nickname, 'en-GB', { sensitivity: 'base' }) === 0
      )) throw new RepositoryError('duplicate-nickname', 'That nickname is already in this game.')
      const player: Player = {
        currentCorrectStreak: 0, longestCorrectStreak: 0,
        survivorLivesRemaining: isSurvivorSettings(session.settings) ? session.settings.survivorStartingLives ?? 3 : 0,
        survivorEliminatedAtQuestion: null,
        id: uid('player'),
        sessionId: session.id,
        nickname,
        teamId,
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
      this.write(state, false, session.id)
      return clone({ player, reconnectToken, powerUps: personalPowerUps(session, player.id) })
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
        currentCorrectStreak: 0, longestCorrectStreak: 0,
        survivorLivesRemaining: 0,
        survivorEliminatedAtQuestion: null,
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
      const scoresVisible = ['leaderboard', 'finished'].includes(session.phase)
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      const headToHead = quiz?.quizType === 'head-to-head'
      this.write(state, headToHead, session.id)
      return clone({
        player: scoresVisible || headToHead ? player : {
          ...player,
          totalScore: 0,
          correctAnswerCount: 0,
          totalCorrectResponseMs: 0,
        },
        reconnectToken: saved.reconnectToken,
        powerUps: personalPowerUps(session, player.id),
        tieBreakerSubmission: session.tieBreakerAnswers.some((answer) =>
          answer.round === session.tieBreakerRound && answer.playerId === player.id)
          ? { round: session.tieBreakerRound, questionId: session.tieBreakerQuestion?.id ?? '' }
          : null,
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
      const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
      this.write(state, quiz?.quizType === 'head-to-head', session.id)
    })
  }

  async getSafeGameState(rawRoomCode: string): Promise<SafeGameState | null> {
    const state = this.read()
    const session = state.sessions.find((candidate) => candidate.roomCode === rawRoomCode)
    if (!session) return null
    const quiz = state.quizzes.find((candidate) => candidate.id === session.quizId)
    if (!quiz) return null
    const orderedQuestions = orderedSessionQuestions(quiz.questions, session.questionOrder)
    const tieBreakerPhase = session.phase === 'tiebreaker' || session.phase === 'tiebreaker-result'
    const question = session.phase === 'round-intro' || tieBreakerPhase ? null : orderedQuestions[session.currentQuestionIndex] ?? null
    const headToHead = quiz.quizType === 'head-to-head'
    const mayReveal = ['reveal', 'leaderboard', 'finished'].includes(session.phase)
    const scoresVisible = headToHead || ['leaderboard', 'finished'].includes(session.phase)
    const currentAnswers = question
      ? session.answers.filter((answer) => answer.questionId === question.id)
      : []
    return clone({
      sessionId: session.id,
      teams: session.teams ?? [],
      quizTitle: quiz.title,
      quizType: quiz.quizType,
      themeId: quiz.themeId,
      backgroundId: quiz.backgroundId,
      answerPaletteId: quiz.answerPaletteId,
      customAnswerColours: quiz.customAnswerColours,
      soundPackId: session.settings.soundPackId,
      sessionSettings: session.settings,
      questionPreludeKind: session.phase === 'question' ? questionPreludeKind(question, session.settings) : null,
      doubleScoreVariantIndex: session.currentDoubleScoreVariantIndex ?? null,
      roomCode: session.roomCode,
      status: session.status,
      phase: session.phase,
      tieBreaker: safeDemoTieBreakerState(session),
      currentRound: safeRound(quiz, session.currentRoundId),
      currentQuestion: question
        ? toSafeQuestion(question, session.currentQuestionIndex + 1, orderedQuestions.length, session.settings, session.connectionClueCount ?? 0, mayReveal)
        : null,
      buzz: session.buzz ?? null,
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
      submittedCount: tieBreakerPhase
        ? session.tieBreakerAnswers.filter((answer) => answer.round === session.tieBreakerRound).length
        : currentAnswers.length + (question ? state.headToHeadSkips.filter((skip) => skip.sessionId === session.id && skip.questionId === question.id).length : 0),
      eligibleResponderCount: tieBreakerPhase ? currentTieBreakerContenders(session).length
        : question?.buzzInEnabled ? (session.buzz ? 1 : 0) : isSurvivorSettings(session.settings) ? survivorAliveCount(session.players) : session.players.length,
      survivorAliveCount: isSurvivorSettings(session.settings) ? survivorAliveCount(session.players) : session.players.length,
      leaderboard: !headToHead && scoresVisible
        ? applyTieBreakerWinner(isSurvivorSettings(session.settings) ? survivorStandings(session.players) : sortLeaderboard(session.players), session.tieBreakerWinnerPlayerId)
        : [],
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
      const question = quiz
        ? orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex]
        : undefined
      if (!quiz || !question) throw new RepositoryError('database', 'The current question could not be loaded.')
      if (isSurvivorSettings(session.settings) && (player.survivorLivesRemaining ?? 0) <= 0) {
        throw new RepositoryError('invalid-player', 'Eliminated players can only spectate.')
      }
      const submittedAt = Date.now()
      const authoritativeOpenedAt = session.questionOpenedAt ? new Date(session.questionOpenedAt).getTime() : 0
      if (!authoritativeOpenedAt || submittedAt < authoritativeOpenedAt) {
        throw new RepositoryError('invalid-phase', 'Wait for the question to open.')
      }
      if (quiz.quizType === 'standard') {
        const closesAt = session.questionClosesAt ? new Date(session.questionClosesAt).getTime() : 0
        if (!closesAt || submittedAt >= closesAt) throw new RepositoryError('late-submission', 'Time is up for this question.')
        if (question.buzzInEnabled) {
          const buzz = session.buzz
          if (!buzz || buzz.winnerPlayerId !== playerId) throw new RepositoryError('invalid-player', 'Only the Buzz winner can answer this question.')
          if (submittedAt >= Date.parse(buzz.answerDeadlineAt)) throw new RepositoryError('late-submission', 'Your Buzz answer window has closed.')
        }
      }
      if (isHeadToHeadResolved(state, session, question.id, playerId)) {
        throw new RepositoryError('duplicate-submission', 'You have already answered this question.')
      }
      const power = extractPowerUp(payload)
      if (!power) throw new RepositoryError('invalid-selection', 'Invalid Power-Up answer metadata.')
      if (power.powerUp) {
        if (!session.settings.powerUpsEnabled || quiz.quizType !== 'standard') throw new RepositoryError('invalid-selection', 'Power-Ups are not enabled.')
        const reason = powerUpUnavailableReason(power.powerUp, question)
        if (reason) throw new RepositoryError('invalid-selection', reason)
        if ((session.powerUpUses ?? []).some(use => use.playerId === playerId && (use.powerUp === power.powerUp || use.questionId === question.id))) throw new RepositoryError('invalid-selection', 'That Power-Up or question has already been used.')
      }
      const wager = extractWager(power.answer, quiz.quizType === 'standard' && question.wagerEnabled === true)
      if (!wager) throw new RepositoryError('invalid-selection', 'That wager is not valid for this question.')
      payload = wager.answer
      if (question.type === 'mashup' && payload.type === 'mashup') {
        const activeIds = new Set(quiz.roster.filter((member) => member.active).map((member) => member.id))
        if (payload.memberIds.some((id) => !activeIds.has(id))) {
          throw new RepositoryError('invalid-selection', 'Select exactly two different active people.')
        }
      }
      const score = scoreQuestion(question, payload, { revealedClueCount: session.connectionClueCount })
      if (!score.valid) throw new RepositoryError('invalid-selection', 'That answer is not valid for this question.')
      const openedAt = session.questionOpenedAt ? new Date(session.questionOpenedAt).getTime() : submittedAt
      const closesAt = session.questionClosesAt ? new Date(session.questionClosesAt).getTime() : openedAt
      const responseTimeMs = Math.max(0, submittedAt - openedAt)
      const assigned = quiz.quizType === 'head-to-head' && player.competitorId === question.assignedCompetitorId
      const ordinaryPoints = quiz.quizType === 'head-to-head'
        ? (assigned && score.correct ? 1 : 0)
        : calculateStandardQuestionScore(score.points, question.type === 'matching' && !score.correct ? { ...question, speedScoringEnabled: false } : question, powerUpScoringTime(responseTimeMs, power.powerUp), closesAt - openedAt)
      const pointsAwarded = quiz.quizType === 'standard' ? powerUpFinalPoints(applyWager(ordinaryPoints, question.points, score.correct, wager.percent), power.powerUp) : ordinaryPoints
      const answer: PlayerAnswer = {
        ...(quiz.quizType === 'standard' ? { wagerPercent: wager.percent } : {}),
        id: uid('answer'),
        sessionId: session.id,
        questionId: question.id,
        playerId,
        payload,
        resolutionStatus: 'answered',
        submittedAt: new Date().toISOString(),
        responseTimeMs,
        automaticCorrect: score.correct,
        hostCorrectOverride: null,
        correct: score.correct,
        pointsAwarded,
      }
      if (power.powerUp) (session.powerUpUses ??= []).push({ playerId, questionId: question.id, powerUp: power.powerUp })
      session.answers.push(answer)
      session.hostResponses.push(hostResponseRecordForAnswer(answer))
      player.totalScore += pointsAwarded
      if (score.correct && (quiz.quizType === 'standard' || assigned)) {
        player.correctAnswerCount += 1
        if (quiz.quizType === 'standard') player.totalCorrectResponseMs += responseTimeMs
      }
      if (quiz.quizType === 'head-to-head') revealHeadToHeadWhenComplete(state, session, question)
      const buzzAutoLocked = quiz.quizType === 'standard' && Boolean(question.buzzInEnabled) && session.settings.autoLockWhenAllAnswered
      if (buzzAutoLocked) {
        session.phase = 'locked'
        session.questionClosesAt = new Date(submittedAt).toISOString()
        session.buzz = session.buzz ? { ...session.buzz, answerDeadlineAt: new Date(submittedAt).toISOString() } : null
      }
      this.write(state, quiz.quizType === 'head-to-head' || buzzAutoLocked, session.id)
    })
  }

  async activateFiftyFifty(roomCode: string, playerId: string, reconnectToken: string, questionId: string): Promise<PersonalPowerUpState> {
    return this.withMutation(async () => {
      const state = this.read()
      const session = state.sessions.find(s => s.roomCode === roomCode && s.status === 'active')
      const quiz = state.quizzes.find(q => q.id === session?.quizId)
      const player = session?.players.find(p => p.id === playerId)
      if (!session || !quiz || !player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      const question = orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex]
      if (!session.settings.powerUpsEnabled || quiz.quizType !== 'standard' || session.phase !== 'question' || question?.id !== questionId) throw new RepositoryError('invalid-phase', 'Power-Ups are not available for this question.')
      if (!session.questionOpenedAt || !session.questionClosesAt || Date.now() < Date.parse(session.questionOpenedAt) || Date.now() >= Date.parse(session.questionClosesAt)) throw new RepositoryError('late-submission', 'Answers are not open.')
      if (isSurvivorSettings(session.settings) && (player.survivorLivesRemaining ?? 0) <= 0) throw new RepositoryError('invalid-player', 'Eliminated players can only spectate.')
      const reason = powerUpUnavailableReason('fifty-fifty', question)
      if (reason || question.type !== 'single-choice') throw new RepositoryError('invalid-selection', reason ?? 'Single Choice only')
      if (session.answers.some(a => a.playerId === playerId && a.questionId === questionId)) throw new RepositoryError('duplicate-submission', 'You have already answered.')
      if ((session.powerUpUses ?? []).some(use => use.playerId === playerId && (use.powerUp === 'fifty-fifty' || use.questionId === questionId))) throw new RepositoryError('invalid-selection', 'That Power-Up or question has already been used.')
      const wrong = await Promise.all(question.options.filter(o => o.id !== question.correctOptionId).map(async option => {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${session.id}:${playerId}:${questionId}:${option.id}`))
        return { id: option.id, hash: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') }
      }))
      wrong.sort((a, b) => a.hash.localeCompare(b.hash) || a.id.localeCompare(b.id))
      ;(session.powerUpUses ??= []).push({ playerId, questionId, powerUp: 'fifty-fifty', optionIds: [question.correctOptionId, wrong[0].id].sort() })
      this.write(state, false, session.id)
      return clone(personalPowerUps(session, playerId)!)
    })
  }

  async submitTieBreakerAnswer(roomCode: string, playerId: string, reconnectToken: string, rawValue: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode && candidate.status === 'active')
      const player = session?.players.find((candidate) => candidate.id === playerId)
      if (!session) throw new RepositoryError('invalid-room', 'This room is not active.')
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      if (session.phase !== 'tiebreaker' || !session.tieBreakerQuestion) throw new RepositoryError('invalid-phase', 'Tie-breaker answers are not open.')
      if (!currentTieBreakerContenders(session).includes(playerId)) throw new RepositoryError('unauthorised', 'Only the tied finalists can answer this tie-breaker.')
      const value = normaliseTieBreakerValue(rawValue)
      if (value === null) throw new RepositoryError('invalid-selection', 'Enter a valid number.')
      const now = Date.now()
      const openedAt = Date.parse(session.tieBreakerOpenedAt ?? '')
      const closesAt = Date.parse(session.tieBreakerClosesAt ?? '')
      if (!Number.isFinite(openedAt) || !Number.isFinite(closesAt) || now < openedAt) throw new RepositoryError('invalid-phase', 'Wait for the tie-breaker to open.')
      if (now >= closesAt) throw new RepositoryError('late-submission', 'Time is up for this tie-breaker.')
      if (session.tieBreakerAnswers.some((answer) => answer.round === session.tieBreakerRound && answer.playerId === playerId)) {
        throw new RepositoryError('duplicate-submission', 'You have already answered this tie-breaker.')
      }
      session.tieBreakerAnswers.push({
        round: session.tieBreakerRound,
        questionId: session.tieBreakerQuestion.id,
        playerId,
        value,
        submittedAt: new Date(now).toISOString(),
        responseTimeMs: Math.max(0, now - openedAt),
      })
      const complete = session.tieBreakerAnswers.filter((answer) => answer.round === session.tieBreakerRound).length === currentTieBreakerContenders(session).length
      if (complete) resolveDemoSessionTieBreaker(session, now)
      this.write(state, complete, session.id)
    })
  }

  async resolveTieBreaker(sessionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.id === sessionId && candidate.status === 'active')
      if (!session) throw new RepositoryError('invalid-room', 'This room is not active.')
      resolveDemoSessionTieBreaker(session)
      this.write(state, true, session.id)
    })
  }

  async nextTieBreaker(sessionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.id === sessionId && candidate.status === 'active')
      if (!session || session.phase !== 'tiebreaker-result' || !session.tieBreakerQuestion || session.tieBreakerWinnerPlayerId) {
        throw new RepositoryError('invalid-phase', 'Another tie-breaker is not available.')
      }
      const resolution = demoTieBreakerState(session)
      const unresolved = resolution?.unresolvedPlayerIds ?? []
      if (unresolved.length < 2) throw new RepositoryError('database', 'The unresolved finalists could not be determined.')
      beginDemoTieBreaker(session, unresolved)
      this.write(state, true, session.id)
    })
  }

  async revealTieBreakerFinal(sessionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.id === sessionId && candidate.status === 'active')
      if (!session || session.phase !== 'tiebreaker-result' || !session.tieBreakerWinnerPlayerId) {
        throw new RepositoryError('invalid-phase', 'Resolve the tie-breaker before revealing Final Results.')
      }
      session.phase = 'finished'
      session.endedAt = new Date().toISOString()
      this.write(state, true, session.id)
    })
  }

  async claimBuzz(roomCode: string, playerId: string, reconnectToken: string): Promise<BuzzClaimResult> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find(candidate => candidate.roomCode === roomCode && candidate.status === 'active')
      const quiz = session ? state.quizzes.find(candidate => candidate.id === session.quizId) : undefined
      const player = session?.players.find(candidate => candidate.id === playerId)
      const question = session && quiz ? orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex] : undefined
      if (!session || !quiz || !question || quiz.quizType !== 'standard') throw new RepositoryError('invalid-room', 'This Buzz-In room is not active.')
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      if (isSurvivorSettings(session.settings) && (player.survivorLivesRemaining ?? 0) <= 0) throw new RepositoryError('invalid-player', 'Eliminated players cannot claim the Buzz.')
      if (session.phase !== 'question' || !question.buzzInEnabled || !canUseBuzzIn(question, quiz.quizType)) throw new RepositoryError('invalid-phase', 'Buzzers are not open for this question.')
      const now = Date.now(), openedAt = Date.parse(session.questionOpenedAt ?? ''), closesAt = Date.parse(session.questionClosesAt ?? '')
      if (!Number.isFinite(openedAt) || !Number.isFinite(closesAt) || now < openedAt || now >= closesAt) throw new RepositoryError('late-submission', 'Buzzers are closed for this question.')
      if (session.buzz) return clone({ won: false, ...session.buzz })
      session.buzz = {
        winnerPlayerId: playerId,
        claimedAt: new Date(now).toISOString(),
        answerDeadlineAt: new Date(Math.min(closesAt, now + BUZZ_ANSWER_WINDOW_SECONDS * 1_000)).toISOString(),
      }
      this.write(state, true, session.id)
      return clone({ won: true, ...session.buzz })
    })
  }

  async resetBuzz(sessionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read(), session = state.sessions.find(candidate => candidate.id === sessionId && candidate.status === 'active')
      const quiz = session && state.quizzes.find(candidate => candidate.id === session.quizId)
      const question = session && quiz ? orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex] : undefined
      if (!session || !quiz || quiz.quizType !== 'standard' || session.phase !== 'question' || !question?.buzzInEnabled || !session.buzz) throw new RepositoryError('invalid-phase', 'Buzz cannot be reset now.')
      if (session.answers.some(answer => answer.questionId === question.id && answer.playerId === session.buzz!.winnerPlayerId)) throw new RepositoryError('invalid-phase', 'Buzz cannot be reset after the winner has answered.')
      session.buzz = null
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
      const question = orderedSessionQuestions(quiz.questions, session.questionOrder)[0]
      if (!question) throw new RepositoryError('database', 'This quiz has no questions.')
      const now = Date.now()
      const opening = prepareQuestionTiming(session, question, now).openedAt
      session.phase = 'question'
      session.currentQuestionIndex = 0
      session.questionOpenedAt = opening
      session.questionClosesAt = null
      session.startedAt = new Date(now).toISOString()
      this.write(state, true, session.id)
    })
  }

  async setTypedAnswerOverride(sessionId: string, answerId: string, correctOverride: true | null): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.id === sessionId)
      const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
      const answer = session?.answers.find((candidate) => candidate.id === answerId)
      const question = quiz?.questions.find((candidate) => candidate.id === answer?.questionId)
      const player = session?.players.find((candidate) => candidate.id === answer?.playerId)
      if (!session || !quiz || !answer || !question || !player) {
        throw new RepositoryError('database', 'That submitted answer could not be found.')
      }
      if (quiz.quizType !== 'standard' || question.type !== 'typed-answer' ||
        session.currentQuestionIndex < 0 || orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex]?.id !== question.id) {
        throw new RepositoryError('invalid-selection', 'Only the current Standard Typed Answer can be reviewed.')
      }
      if (!['locked', 'reveal', 'leaderboard'].includes(session.phase)) {
        throw new RepositoryError('invalid-phase', 'Lock answers before reviewing Typed Answers.')
      }
      const automaticCorrect = answer.automaticCorrect ?? answer.correct
      const nextOverride = correctOverride === true && !automaticCorrect ? true : null
      const previousCorrect = answer.correct
      const previousPoints = answer.pointsAwarded
      const nextCorrect = nextOverride ?? automaticCorrect
      const powerUp = session.powerUpUses?.find(use => use.playerId === player.id && use.questionId === question.id)?.powerUp
      const ordinaryPoints = nextCorrect
        ? calculateStandardQuestionScore(question.points, question, powerUpScoringTime(answer.responseTimeMs, powerUp), question.timeLimitSeconds * 1_000)
        : 0
      const nextPoints = powerUpFinalPoints(applyWager(ordinaryPoints, question.points, nextCorrect, answer.wagerPercent ?? 0), powerUp)
      answer.automaticCorrect = automaticCorrect
      answer.hostCorrectOverride = nextOverride
      answer.correct = nextCorrect
      answer.pointsAwarded = nextPoints
      player.totalScore += nextPoints - previousPoints
      player.correctAnswerCount += Number(nextCorrect) - Number(previousCorrect)
      player.totalCorrectResponseMs += (nextCorrect ? answer.responseTimeMs : 0) - (previousCorrect ? answer.responseTimeMs : 0)
      if (session.phase === 'leaderboard') {
        const revised = recomputePlayerStreaks([player], session.answers, session.questionOrder.slice(0, session.currentQuestionIndex + 1), new Set(quiz.questions.filter(question => question.buzzInEnabled).map(question => question.id)))[0]
        player.currentCorrectStreak = revised.currentCorrectStreak
        player.longestCorrectStreak = revised.longestCorrectStreak
        if (isSurvivorSettings(session.settings)) {
          const survivor = recomputeSurvivorPlayers([player], session.answers, quiz.questions, session.questionOrder,
            session.currentQuestionIndex + 1, session.settings.survivorStartingLives ?? 3)[0]
          player.survivorLivesRemaining = survivor.survivorLivesRemaining
          player.survivorEliminatedAtQuestion = survivor.survivorEliminatedAtQuestion
        }
      }
      this.write(state, true, session.id)
    })
  }

  async skipHeadToHead(roomCode: string, playerId: string, reconnectToken: string, expectedQuestionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read()
      const session = state.sessions.find((candidate) => candidate.roomCode === roomCode && candidate.status === 'active')
      const quiz = session ? state.quizzes.find((candidate) => candidate.id === session.quizId) : undefined
      const player = session?.players.find((candidate) => candidate.id === playerId)
      const question = quiz && session
        ? orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex]
        : undefined
      if (!session || !quiz || quiz.quizType !== 'head-to-head') throw new RepositoryError('invalid-room', 'This Head-to-Head room is not active.')
      if (!player || state.reconnectTokens[playerId] !== reconnectToken) throw new RepositoryError('invalid-player', 'Your player session could not be verified.')
      if (session.phase !== 'question' || !question || question.id !== expectedQuestionId) throw new RepositoryError('invalid-phase', 'That question is no longer open.')
      if (session.questionOpenedAt && Date.now() < new Date(session.questionOpenedAt).getTime()) {
        throw new RepositoryError('invalid-phase', 'Wait for the question to open.')
      }
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
      const orderedQuestions = orderedSessionQuestions(quiz.questions, session.questionOrder)
      const question = orderedQuestions[session.currentQuestionIndex]
      if (session.phase === 'finished') return
      if (!question || question.id !== expectedQuestionId) return
      if (session.phase !== 'reveal') throw new RepositoryError('invalid-phase', 'Wait for both competitors to resolve the question.')
      if (session.currentQuestionIndex + 1 >= orderedQuestions.length) {
        session.phase = 'finished'
        session.endedAt = new Date().toISOString()
      } else {
        session.currentQuestionIndex += 1
        session.phase = 'question'
        const nextQuestion = orderedQuestions[session.currentQuestionIndex]
        const transition = Date.now()
        const timingWindow = prepareQuestionTiming(session, nextQuestion, transition)
        session.questionOpenedAt = timingWindow.openedAt
        session.questionClosesAt = null
      }
      this.write(state, true, session.id)
    })
  }

  async changePhase(
    sessionId: string,
    action: 'start' | 'start-round' | 'lock' | 'reveal' | 'leaderboard' | 'next' | 'finish' | 'restart' | 'close',
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
      const orderedQuestions = orderedSessionQuestions(quiz.questions, session.questionOrder)
      const finaliseCompletedQuestions = (completedQuestionCount: number): void => {
        session.players = recomputePlayerStreaks(session.players, session.answers,
          session.questionOrder.slice(0, completedQuestionCount), new Set(quiz.questions.filter(question => question.buzzInEnabled).map(question => question.id)))
        if (isSurvivorSettings(session.settings)) {
          session.players = recomputeSurvivorPlayers(session.players, session.answers, quiz.questions, session.questionOrder,
            completedQuestionCount, session.settings.survivorStartingLives ?? 3)
        }
      }
      const beginAutomaticTieBreaker = (): boolean => {
        if (!session.settings.automaticTieBreakersEnabled || session.settings.playMode === 'teams' || quiz.quizType !== 'standard') return false
        const contenders = winningTiePlayerIds(session.players, session.settings.competitionMode)
        if (contenders.length < 2) return false
        beginDemoTieBreaker(session, contenders, now.getTime())
        return true
      }
      const openCurrentQuestion = (allowIntro = false): void => {
        session.connectionClueCount = 0
        session.buzz = null
        const question = orderedQuestions[session.currentQuestionIndex]
        if (!question) throw new RepositoryError('database', 'This quiz has no question to open.')
        const enteringRound = action === 'start' || question.roundId !== session.currentRoundId
        session.currentRoundId = question.roundId
        if (allowIntro && enteringRound && quiz.rounds.find((round) => round.id === question.roundId)?.introEnabled) {
          session.phase = 'round-intro'
          session.questionOpenedAt = null
          session.questionClosesAt = null
          session.currentDoubleScoreVariantIndex = null
          return
        }
        const timingWindow = prepareQuestionTiming(session, question, now.getTime())
        session.phase = 'question'
        session.connectionClueCount = question.type === 'connections' ? 1 : 0
        session.questionOpenedAt = timingWindow.openedAt
        session.questionClosesAt = timingWindow.closesAt
      }
      switch (action) {
        case 'start':
          if (session.phase !== 'lobby') throw new RepositoryError('invalid-phase', 'The game has already started.')
          if (session.settings.playMode === 'teams' && (!session.players.length || session.players.some((player) => !player.teamId))) throw new RepositoryError('invalid-phase', 'Assign every player to a team before starting.')
          if (!orderedQuestions.length) throw new RepositoryError('database', 'Add at least one question before starting.')
          session.startedAt = now.toISOString()
          session.currentQuestionIndex = 0
          openCurrentQuestion(true)
          break
        case 'start-round':
          if (session.phase !== 'round-intro') throw new RepositoryError('invalid-phase', 'Show the round intro before starting the round.')
          openCurrentQuestion()
          break
        case 'lock':
          if (session.phase !== 'question') throw new RepositoryError('invalid-phase', 'Answers are not currently open.')
          if (session.questionOpenedAt && now.getTime() < new Date(session.questionOpenedAt).getTime()) {
            throw new RepositoryError('invalid-phase', 'Wait for the Double Score intro to finish.')
          }
          session.phase = 'locked'
          session.questionClosesAt = now.toISOString()
          if (session.buzz) session.buzz.answerDeadlineAt = now.toISOString()
          break
        case 'reveal':
          if (session.phase !== 'locked') throw new RepositoryError('invalid-phase', 'Lock answers before the reveal.')
          session.phase = 'reveal'
          break
        case 'leaderboard':
          if (session.phase !== 'reveal') throw new RepositoryError('invalid-phase', 'Reveal the answer first.')
          if (session.currentQuestionIndex + 1 >= orderedQuestions.length) {
            throw new RepositoryError('invalid-phase', 'Reveal the final results instead.')
          }
          session.phase = 'leaderboard'
          finaliseCompletedQuestions(session.currentQuestionIndex + 1)
          break
        case 'next':
          if (session.phase !== 'leaderboard') throw new RepositoryError('invalid-phase', 'Show the leaderboard first.')
          if (isSurvivorSettings(session.settings) && survivorAliveCount(session.players) <= 1) {
            throw new RepositoryError('invalid-phase', 'Reveal the final result before continuing.')
          }
          if (session.currentQuestionIndex + 1 >= orderedQuestions.length) {
            throw new RepositoryError('invalid-phase', 'There is no next question.')
          }
          session.currentQuestionIndex += 1
          openCurrentQuestion(true)
          break
        case 'finish':
          if (session.phase === 'question' && session.questionOpenedAt && now.getTime() < new Date(session.questionOpenedAt).getTime()) {
            throw new RepositoryError('invalid-phase', 'Wait for the Double Score intro to finish.')
          }
          if (session.phase === 'reveal' && session.currentQuestionIndex + 1 < orderedQuestions.length && !isSurvivorSettings(session.settings)) {
            throw new RepositoryError('invalid-phase', 'Show the leaderboard before continuing.')
          }
          if (session.phase === 'reveal') {
            finaliseCompletedQuestions(session.currentQuestionIndex + 1)
            if (session.currentQuestionIndex + 1 >= orderedQuestions.length && beginAutomaticTieBreaker()) break
            session.phase = 'finished'
            session.endedAt = now.toISOString()
            session.questionClosesAt = now.toISOString()
            session.buzz = null
            break
          }
          if (session.phase === 'leaderboard') {
            if (!isSurvivorSettings(session.settings) || survivorAliveCount(session.players) > 1) {
              throw new RepositoryError('invalid-phase', 'The Survivor game is not ready for its final result.')
            }
            if (beginAutomaticTieBreaker()) break
            session.phase = 'finished'
            session.endedAt = now.toISOString()
            session.questionClosesAt = now.toISOString()
            session.buzz = null
            break
          }
          if (!['question', 'locked'].includes(session.phase)) {
            throw new RepositoryError('invalid-phase', 'The game cannot be finished from this phase.')
          }
          session.phase = 'finished'
          session.endedAt = now.toISOString()
          session.questionClosesAt = now.toISOString()
          session.buzz = null
          break
        case 'restart':
          session.connectionClueCount = 0
          session.buzz = null
          if (session.phase !== 'finished') throw new RepositoryError('invalid-phase', 'Finish the game before restarting it.')
          session.phase = 'lobby'
          session.currentRoundId = orderedRounds(quiz.rounds)[0].id
          session.currentQuestionIndex = 0
          session.questionOpenedAt = null
          session.questionClosesAt = null
          session.currentDoubleScoreVariantIndex = null
          session.startedAt = null
          session.endedAt = null
          session.hostResponses = []
          session.answers = []
          session.powerUpUses = []
          session.settings.powerUpRunId = crypto.randomUUID()
          session.tieBreakerQuestion = null
          session.tieBreakerRound = 0
          session.tieBreakerWinnerPlayerId = null
          session.tieBreakerUsedQuestionIds = []
          session.tieBreakerContenderRounds = []
          session.tieBreakerAnswers = []
          session.tieBreakerOpenedAt = null
          session.tieBreakerClosesAt = null
          session.players.forEach((player) => {
            player.totalScore = 0
            player.correctAnswerCount = 0
            player.totalCorrectResponseMs = 0
            player.currentCorrectStreak = 0
            player.longestCorrectStreak = 0
            player.survivorLivesRemaining = isSurvivorSettings(session.settings) ? session.settings.survivorStartingLives ?? 3 : 0
            player.survivorEliminatedAtQuestion = null
          })
          break
        case 'close':
          session.status = 'closed'
          session.phase = 'finished'
          session.endedAt = now.toISOString()
          session.buzz = null
          session.tieBreakerQuestion = null
          session.tieBreakerWinnerPlayerId = null
          session.tieBreakerOpenedAt = null
          session.tieBreakerClosesAt = null
          break
      }
      this.write(state, true, session.id)
    })
  }

  async revealConnectionClue(sessionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read(), session = state.sessions.find(candidate => candidate.id === sessionId)
      const quiz = session && state.quizzes.find(candidate => candidate.id === session.quizId)
      const question = session && quiz && orderedSessionQuestions(quiz.questions, session.questionOrder)[session.currentQuestionIndex]
      const now = Date.now(), count = session?.connectionClueCount ?? 0
      if (!session || !quiz || session.status !== 'active' || quiz.quizType !== 'standard' || session.phase !== 'question' || question?.type !== 'connections' ||
        !session.questionOpenedAt || !session.questionClosesAt || now < Date.parse(session.questionOpenedAt) || now >= Date.parse(session.questionClosesAt) ||
        count < 1 || count >= question.clues.length) throw new RepositoryError('invalid-phase', 'The next clue cannot be revealed now.')
      session.connectionClueCount = count + 1
      this.write(state, true, session.id)
    })
  }

  private teamLobby(state: DemoState, sessionId: string): GameSession {
    const session = state.sessions.find((candidate) => candidate.id === sessionId)
    if (!session || session.status !== 'active' || session.phase !== 'lobby' || session.settings.playMode !== 'teams' || state.quizzes.find((quiz) => quiz.id === session.quizId)?.quizType === 'head-to-head') throw new RepositoryError('invalid-phase', 'Teams can only be changed in an active Team lobby.')
    return session
  }

  async assignPlayerTeam(sessionId: string, playerId: string, teamId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read(), session = this.teamLobby(state, sessionId)
      const player = session.players.find((candidate) => candidate.id === playerId)
      if (!player || !session.teams?.some((team) => team.id === teamId && team.sessionId === sessionId)) throw new RepositoryError('invalid-selection', 'Choose a player and team in this room.')
      player.teamId = teamId
      this.write(state, false, sessionId)
    })
  }

  async balanceTeams(sessionId: string): Promise<void> {
    return this.withMutation(() => {
      const state = this.read(), session = this.teamLobby(state, sessionId)
      const teams = session.teams ?? []
      const order = shuffledVariantIndices(session.players.length)
      order.forEach((index, position) => { session.players[index].teamId = teams[position % teams.length].id })
      this.write(state, false, sessionId)
    })
  }

  subscribe(subject: string, callback: () => void, onStatus?: RealtimeStatusCallback): Unsubscribe {
    const handleMessage = (event: MessageEvent<{ subject?: string }>): void => {
      if (event.data.subject === '*' || event.data.subject === subject) callback()
    }
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== REFRESH_STORAGE_KEY || !event.newValue) return
      try {
        const notification = JSON.parse(event.newValue) as { subjects?: unknown }
        if (Array.isArray(notification.subjects) && notification.subjects.some(
          (changedSubject) => changedSubject === '*' || changedSubject === subject,
        )) callback()
      } catch {
        // Ignore malformed cross-tab hints; the next legitimate write or poll recovers.
      }
    }
    this.channel?.addEventListener('message', handleMessage)
    window.addEventListener('storage', handleStorage)
    queueMicrotask(() => onStatus?.('SUBSCRIBED'))
    return () => {
      this.channel?.removeEventListener('message', handleMessage)
      window.removeEventListener('storage', handleStorage)
    }
  }
}
