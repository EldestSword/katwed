import type {
  GameSessionSettings,
  LaunchGameSettings,
  Question,
  QuestionPreludeKind,
  Quiz,
} from '../../types/domain'
import {
  getSoundPack,
  normaliseDoubleScoreDurationMs,
  normaliseSoundPackId,
} from '../audio/soundPacks'

export const QUESTION_TYPE_INTRO_MS = 1_750

export function quizUsesMixedQuestionTypes(questions: readonly Pick<Question, 'type'>[]): boolean {
  return new Set(questions.map((question) => question.type)).size > 1
}

export function defaultLaunchGameSettings(quiz: Pick<Quiz, 'soundPackId'>): LaunchGameSettings {
  return {
    soundPackId: normaliseSoundPackId(quiz.soundPackId),
    shuffleQuestionOrder: false,
    shuffleAnswerOptions: false,
    autoLockWhenAllAnswered: true,
  }
}

export function normaliseLaunchGameSettings(
  value: Partial<LaunchGameSettings> | null | undefined,
  quiz: Pick<Quiz, 'soundPackId'>,
): LaunchGameSettings {
  const defaults = defaultLaunchGameSettings(quiz)
  return {
    soundPackId: normaliseSoundPackId(value?.soundPackId ?? defaults.soundPackId),
    shuffleQuestionOrder: value?.shuffleQuestionOrder === true,
    shuffleAnswerOptions: value?.shuffleAnswerOptions === true,
    autoLockWhenAllAnswered: value?.autoLockWhenAllAnswered !== false,
  }
}

export function createGameSessionSettings(
  value: Partial<LaunchGameSettings> | null | undefined,
  quiz: Pick<Quiz, 'soundPackId' | 'questions'>,
  answerOptionSeed: string,
): GameSessionSettings {
  const launch = normaliseLaunchGameSettings(value, quiz)
  const pack = getSoundPack(launch.soundPackId)
  return {
    ...launch,
    doubleScoreIntroMs: normaliseDoubleScoreDurationMs(pack.doubleScoreDurationMs),
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
  return {
    soundPackId,
    doubleScoreIntroMs: normaliseDoubleScoreDurationMs(value?.doubleScoreIntroMs),
    shuffleQuestionOrder: value?.shuffleQuestionOrder === true,
    shuffleAnswerOptions: value?.shuffleAnswerOptions === true,
    autoLockWhenAllAnswered: value?.autoLockWhenAllAnswered !== false,
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
  questions: readonly Pick<Question, 'id' | 'displayOrder'>[],
  shuffle: boolean,
  seed: string,
): string[] {
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
