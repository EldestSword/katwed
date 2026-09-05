import type {
  CompetitionMode,
  GameSessionSettings,
  LeaderboardEntry,
  LaunchGameSettings,
  Player,
  PlayerAnswer,
  Question,
  QuizType,
  SafeGameState,
  SurvivorStartingLives,
} from '../../types/domain'

export const normaliseCompetitionMode = (value: unknown): CompetitionMode => value === 'survivor' ? 'survivor' : 'points'
export const normaliseSurvivorStartingLives = (value: unknown): SurvivorStartingLives => value === 1 ? 1 : 3
export const isSurvivorSettings = (settings: Pick<GameSessionSettings, 'competitionMode'> | null | undefined): boolean =>
  settings?.competitionMode === 'survivor'
export const isSurvivorGame = (state: SafeGameState | null): boolean =>
  state?.quizType !== 'head-to-head' && isSurvivorSettings(state?.sessionSettings)

export function validateSurvivorLaunch(settings: Partial<LaunchGameSettings> | undefined, quizType: QuizType): string | null {
  if (settings?.competitionMode !== undefined && !['points', 'survivor'].includes(settings.competitionMode)) return 'Choose Points or Survivor.'
  if (normaliseCompetitionMode(settings?.competitionMode) !== 'survivor') return null
  if (quizType === 'head-to-head') return 'Survivor is only available for Standard quizzes.'
  if (settings?.playMode === 'teams') return 'Survivor V1 is for individual play.'
  if (settings?.survivorStartingLives !== undefined && ![1, 3].includes(settings.survivorStartingLives)) return 'Choose 1 life or 3 lives.'
  return null
}

export function survivorPlayerStateIsValid(
  value: Record<string, unknown>,
  settings: Pick<GameSessionSettings, 'competitionMode' | 'survivorStartingLives'>,
): boolean {
  const lives = value.survivorLivesRemaining
  const eliminatedAt = value.survivorEliminatedAtQuestion
  if (!isSurvivorSettings(settings)) {
    return (lives === undefined || lives === 0) && (eliminatedAt === undefined || eliminatedAt === null)
  }
  const startingLives = settings.survivorStartingLives
  return (startingLives === 1 || startingLives === 3) && Number.isInteger(lives) && Number(lives) >= 0 && Number(lives) <= startingLives &&
    (Number(lives) === 0
      ? Number.isInteger(eliminatedAt) && Number(eliminatedAt) >= 1
      : eliminatedAt === null)
}

export function normaliseSurvivorPlayer(
  player: Player,
  settings: Pick<GameSessionSettings, 'competitionMode' | 'survivorStartingLives'>,
): Player {
  if (!isSurvivorSettings(settings)) return { ...player, survivorLivesRemaining: 0, survivorEliminatedAtQuestion: null }
  const startingLives = normaliseSurvivorStartingLives(settings.survivorStartingLives)
  const lives = Number.isInteger(player.survivorLivesRemaining) && player.survivorLivesRemaining! >= 0 && player.survivorLivesRemaining! <= startingLives
    ? player.survivorLivesRemaining!
    : startingLives
  const eliminatedAt = lives === 0 && Number.isInteger(player.survivorEliminatedAtQuestion) && player.survivorEliminatedAtQuestion! >= 1
    ? player.survivorEliminatedAtQuestion!
    : null
  return { ...player, survivorLivesRemaining: lives, survivorEliminatedAtQuestion: eliminatedAt }
}

export function recomputeSurvivorPlayers(
  players: readonly Player[],
  answers: readonly Pick<PlayerAnswer, 'playerId' | 'questionId' | 'correct'>[],
  questions: readonly Pick<Question, 'id' | 'buzzInEnabled'>[],
  questionOrder: readonly string[],
  completedQuestionCount: number,
  startingLives: SurvivorStartingLives,
): Player[] {
  if (!Number.isInteger(completedQuestionCount) || completedQuestionCount < 0 || completedQuestionCount > questionOrder.length) {
    throw new Error('Invalid completed-question boundary for Survivor.')
  }
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const answerByPlayerQuestion = new Map(answers.map((answer) => [`${answer.playerId}:${answer.questionId}`, answer]))
  return players.map((player) => {
    let damage = 0
    let eliminatedAt: number | null = null
    for (let index = 0; index < completedQuestionCount; index += 1) {
      const questionId = questionOrder[index]
      const question = questionById.get(questionId)
      if (!question) throw new Error('Survivor history contains an unknown question.')
      if (question.buzzInEnabled) continue
      if (answerByPlayerQuestion.get(`${player.id}:${questionId}`)?.correct !== true) damage += 1
      if (damage === startingLives && eliminatedAt === null) eliminatedAt = index + 1
    }
    return {
      ...player,
      survivorLivesRemaining: Math.max(startingLives - damage, 0),
      survivorEliminatedAtQuestion: eliminatedAt,
    }
  })
}

export function survivorStandings(players: readonly Player[]): LeaderboardEntry[] {
  return [...players]
    .sort((left, right) => {
      const leftLives = Math.max(0, left.survivorLivesRemaining ?? 0)
      const rightLives = Math.max(0, right.survivorLivesRemaining ?? 0)
      const leftAlive = leftLives > 0
      const rightAlive = rightLives > 0
      if (leftAlive !== rightAlive) return leftAlive ? -1 : 1
      if (leftAlive && leftLives !== rightLives) return rightLives - leftLives
      if (!leftAlive) {
        const elimination = (right.survivorEliminatedAtQuestion ?? 0) - (left.survivorEliminatedAtQuestion ?? 0)
        if (elimination) return elimination
      }
      return right.totalScore - left.totalScore ||
        right.correctAnswerCount - left.correctAnswerCount ||
        left.totalCorrectResponseMs - right.totalCorrectResponseMs ||
        left.nickname.localeCompare(right.nickname, 'en-GB', { sensitivity: 'base' }) ||
        left.id.localeCompare(right.id, 'en-GB')
    })
    .map((player, index) => ({
      currentCorrectStreak: player.currentCorrectStreak ?? 0,
      longestCorrectStreak: player.longestCorrectStreak ?? 0,
      playerId: player.id,
      nickname: player.nickname,
      totalScore: player.totalScore,
      correctAnswerCount: player.correctAnswerCount,
      totalCorrectResponseMs: player.totalCorrectResponseMs,
      survivorLivesRemaining: Math.max(0, player.survivorLivesRemaining ?? 0),
      survivorEliminatedAtQuestion: player.survivorEliminatedAtQuestion ?? null,
      rank: index + 1,
    }))
}

export function survivorAliveCount(players: readonly Pick<Player, 'survivorLivesRemaining'>[]): number {
  return players.filter((player) => (player.survivorLivesRemaining ?? 0) > 0).length
}

export function eligibleResponderCount(state: Pick<SafeGameState, 'buzz' | 'currentQuestion' | 'players' | 'sessionSettings'>): number {
  if (state.currentQuestion?.buzzInEnabled) return state.buzz ? 1 : 0
  if (isSurvivorSettings(state.sessionSettings)) return survivorAliveCount(state.players)
  return state.players.length
}

export function isTerminalSurvivor(state: Pick<SafeGameState, 'phase' | 'players' | 'sessionSettings'>): boolean {
  return state.phase === 'leaderboard' && isSurvivorSettings(state.sessionSettings) && survivorAliveCount(state.players) <= 1
}

export function survivorStatusLabel(entry: Pick<LeaderboardEntry, 'survivorLivesRemaining' | 'survivorEliminatedAtQuestion'>, includeEliminationQuestion = false): string {
  const lives = entry.survivorLivesRemaining ?? 0
  if (lives <= 0) return includeEliminationQuestion && entry.survivorEliminatedAtQuestion
    ? `Eliminated Q${entry.survivorEliminatedAtQuestion}` : 'OUT'
  return `${lives} ${lives === 1 ? 'LIFE' : 'LIVES'}`
}
