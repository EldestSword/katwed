import { orderedRounds } from '../quiz-editor/rounds'
import { normalisePlayMode, normaliseTeamAssignment } from '../teams/teams'
import { normaliseCompetitionMode, normaliseSurvivorStartingLives } from './survivor'
import type {
  GameSessionSettings,
  LaunchGameSettings,
  Question,
  QuestionPreludeKind,
  Quiz,
  QuizRound,
} from '../../types/domain'
import {
  getSoundPack,
  doubleScoreVariantDurations,
  normaliseDoubleScoreDurationMs,
  normaliseSoundPackId,
} from '../audio/soundPacks'

export const QUESTION_TYPE_INTRO_MS = 1_750
export const MAX_DOUBLE_SCORE_VARIANTS = 64

export function normaliseDoubleScoreVariantDurations(value: unknown, fallback: readonly number[] = [5_000]): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DOUBLE_SCORE_VARIANTS) return [...fallback]
  const durations = value.map(normaliseDoubleScoreDurationMs)
  return durations.every((duration, index) => duration === value[index]) ? durations : [...fallback]
}

export function quizUsesMixedQuestionTypes(questions: readonly Pick<Question, 'type'>[]): boolean {
  return new Set(questions.map((question) => question.type)).size > 1
}

export function defaultLaunchGameSettings(quiz: Pick<Quiz, 'soundPackId'> & Partial<Pick<Quiz, 'quizType'>>): LaunchGameSettings {
  return {
    automaticTieBreakersEnabled: quiz.quizType !== 'head-to-head',
    powerUpsEnabled: false,
    competitionMode: 'points',
    survivorStartingLives: 3,
    playMode: 'individual',
    soundPackId: normaliseSoundPackId(quiz.soundPackId),
    shuffleQuestionOrder: false,
    shuffleAnswerOptions: false,
    autoLockWhenAllAnswered: true,
    showPlayerAnswersToHost: true,
  }
}

export function normaliseLaunchGameSettings(
  value: Partial<LaunchGameSettings> | null | undefined,
  quiz: Pick<Quiz, 'soundPackId'> & Partial<Pick<Quiz, 'quizType'>>,
): LaunchGameSettings {
  const defaults = defaultLaunchGameSettings(quiz)
  const competitionMode = normaliseCompetitionMode(value?.competitionMode)
  return {
    powerUpsEnabled: quiz.quizType !== 'head-to-head' && value?.powerUpsEnabled === true,
    automaticTieBreakersEnabled: quiz.quizType !== 'head-to-head' && value?.playMode !== 'teams' &&
      (value?.automaticTieBreakersEnabled ?? defaults.automaticTieBreakersEnabled) === true,
    competitionMode,
    survivorStartingLives: normaliseSurvivorStartingLives(value?.survivorStartingLives),
    playMode: normalisePlayMode(value?.playMode),
    ...(value?.playMode === 'teams' ? { teamAssignmentMode: normaliseTeamAssignment(value.teamAssignmentMode), teamNames: (value.teamNames ?? ['Team 1', 'Team 2']).map((name) => name.trim()) } : {}),
    soundPackId: normaliseSoundPackId(value?.soundPackId ?? defaults.soundPackId),
    shuffleQuestionOrder: value?.shuffleQuestionOrder === true,
    shuffleAnswerOptions: value?.shuffleAnswerOptions === true,
    autoLockWhenAllAnswered: value?.autoLockWhenAllAnswered !== false,
    showPlayerAnswersToHost: value?.showPlayerAnswersToHost !== false,
  }
}

export function createGameSessionSettings(
  value: Partial<LaunchGameSettings> | null | undefined,
  quiz: Pick<Quiz, 'soundPackId' | 'questions'> & Partial<Pick<Quiz, 'quizType'>>,
  answerOptionSeed: string,
): GameSessionSettings {
  const launch = normaliseLaunchGameSettings(value, quiz)
  const persisted = normaliseGameSessionSettings(launch, quiz.soundPackId, answerOptionSeed)
  const pack = getSoundPack(launch.soundPackId)
  const variantDurations = doubleScoreVariantDurations(pack)
  return {
    ...persisted,
    doubleScoreIntroMs: variantDurations[0],
    doubleScoreVariantDurationsMs: variantDurations,
    questionTypeIntrosEnabled: quizUsesMixedQuestionTypes(quiz.questions),
    answerOptionSeed,
  }
}

export function normaliseGameSessionSettings(
  value: Partial<GameSessionSettings> | null | undefined,
  fallbackSoundPackId: unknown = 'katwed',
  fallbackSeed = 'legacy-session',
): GameSessionSettings {
  const soundPackId = normaliseSoundPackId(value?.soundPackId ?? fallbackSoundPackId)
  const fallbackDuration = normaliseDoubleScoreDurationMs(value?.doubleScoreIntroMs)
  const competitionMode = normaliseCompetitionMode(value?.competitionMode)
  return {
    powerUpsEnabled: value?.powerUpsEnabled === true,
    ...(typeof value?.powerUpRunId === 'string' ? { powerUpRunId: value.powerUpRunId } : {}),
    automaticTieBreakersEnabled: value?.automaticTieBreakersEnabled === true,
    competitionMode,
    survivorStartingLives: competitionMode === 'survivor' ? normaliseSurvivorStartingLives(value?.survivorStartingLives) : null,
    playMode: normalisePlayMode(value?.playMode),
    ...(value?.playMode === 'teams' ? { teamAssignmentMode: normaliseTeamAssignment(value.teamAssignmentMode) } : {}),
    soundPackId,
    doubleScoreIntroMs: fallbackDuration,
    doubleScoreVariantDurationsMs: normaliseDoubleScoreVariantDurations(
      value?.doubleScoreVariantDurationsMs,
      [fallbackDuration],
    ),
    shuffleQuestionOrder: value?.shuffleQuestionOrder === true,
    shuffleAnswerOptions: value?.shuffleAnswerOptions === true,
    autoLockWhenAllAnswered: value?.autoLockWhenAllAnswered !== false,
    showPlayerAnswersToHost: value?.showPlayerAnswersToHost !== false,
    questionTypeIntrosEnabled: value?.questionTypeIntrosEnabled === true,
    answerOptionSeed: typeof value?.answerOptionSeed === 'string' && value.answerOptionSeed.length > 0
      ? value.answerOptionSeed
      : fallbackSeed,
  }
}

export function questionPreludeKind(
  question: Pick<Question, 'doubleScore'> | null,
  settings: Pick<GameSessionSettings, 'questionTypeIntrosEnabled'> | null | undefined,
): QuestionPreludeKind {
  if (!question) return null
  if (question.doubleScore) return 'double-score'
  return settings?.questionTypeIntrosEnabled ? 'question-type' : null
}

export function questionPreludeDurationMs(
  kind: QuestionPreludeKind,
  settings: Pick<GameSessionSettings, 'doubleScoreIntroMs'>,
): number {
  if (kind === 'double-score') return normaliseDoubleScoreDurationMs(settings.doubleScoreIntroMs)
  if (kind === 'question-type') return QUESTION_TYPE_INTRO_MS
  return 0
}

function stableScore(seed: string, value: string): number {
  return [...`${seed}:${value}`].reduce(
    (total, character) => Math.imul(total, 31) + character.charCodeAt(0) | 0,
    0,
  )
}

export function createSessionQuestionOrder(
  questions: readonly (Pick<Question, 'id' | 'displayOrder'> & Partial<Pick<Question, 'roundId'>>)[],
  shuffle: boolean,
  seed: string,
  rounds?: readonly QuizRound[],
): string[] {
  if (rounds) return orderedRounds(rounds).flatMap((round) => createSessionQuestionOrder(questions.filter((question) => question.roundId === round.id), shuffle, `${seed}:${round.id}`))
  const authored = [...questions].sort((left, right) => left.displayOrder - right.displayOrder)
  if (!shuffle) return authored.map((question) => question.id)
  return authored.sort((left, right) => (
    stableScore(seed, left.id) - stableScore(seed, right.id) || left.id.localeCompare(right.id)
  )).map((question) => question.id)
}

export function orderedSessionQuestions<T extends Pick<Question, 'id' | 'displayOrder'>>(
  questions: readonly T[],
  questionOrder: readonly string[],
): T[] {
  const byId = new Map(questions.map((question) => [question.id, question]))
  const ordered = questionOrder.flatMap((id) => {
    const question = byId.get(id)
    return question ? [question] : []
  })
  return ordered.length === questions.length
    ? ordered
    : [...questions].sort((left, right) => left.displayOrder - right.displayOrder)
}
