import type { RevealPayload, SafeGameState } from '../../types/domain'
import { normaliseQuizThemeId } from '../../features/themes/quizThemes'
import { normaliseQuizBackgroundId } from '../../features/themes/quizBackgrounds'
import { normaliseQuizType } from '../../features/head-to-head/headToHead'
import { normaliseAnswerPalette } from '../../features/answer-palettes/answerPalettes'
import { normaliseGameSessionSettings } from '../../features/game/launchSettings'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isRevealPayload(value: unknown): value is RevealPayload {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.caption !== 'string') return false
  switch (value.type) {
    case 'single-choice':
      return typeof value.correctOptionId === 'string' && isRecord(value.optionCounts)
    case 'multiple-select':
      return isStringArray(value.correctOptionIds) &&
        (value.scoringMode === 'exact' || value.scoringMode === 'partial-wipeout') &&
        isRecord(value.optionCounts)
    case 'true-false':
      return typeof value.correctValue === 'boolean' && isRecord(value.counts)
    case 'slider':
      return isFiniteNumber(value.correctValue) && isFiniteNumber(value.tolerance) && Array.isArray(value.values)
    case 'pinpoint':
      return isFiniteNumber(value.targetX) && value.targetX >= 0 && value.targetX <= 1 &&
        isFiniteNumber(value.targetY) && value.targetY >= 0 && value.targetY <= 1 &&
        isFiniteNumber(value.targetRadius) && value.targetRadius > 0 && value.targetRadius <= 1 &&
        Array.isArray(value.points) && value.points.every((point) =>
          isRecord(point) && isFiniteNumber(point.x) && point.x >= 0 && point.x <= 1 &&
          isFiniteNumber(point.y) && point.y >= 0 && point.y <= 1)
    case 'typed-answer':
      return typeof value.correctAnswer === 'string' && !('acceptedAnswers' in value) &&
        (value.correctPlayerIds === undefined || isStringArray(value.correctPlayerIds))
    case 'mashup':
      return isStringArray(value.correctMemberIds) && value.correctMemberIds.length === 2 &&
        isStringArray(value.correctNames) && value.correctNames.length === 2
    default:
      return false
  }
}

function outcomeNeutralReveal(reveal: RevealPayload | null): RevealPayload | null {
  if (!reveal) return null
  return {
    ...reveal,
    caption: reveal.caption.replace(/^Correct:\s*/i, ''),
  }
}

export function parseSafeGameState(value: unknown): SafeGameState {
  if (!isRecord(value) || typeof value.phase !== 'string' ||
    !Array.isArray(value.players) || !Array.isArray(value.leaderboard)) {
    throw new Error('The server returned an invalid safe game state.')
  }

  const revealAllowed = ['reveal', 'leaderboard', 'finished'].includes(value.phase)
  if ((!revealAllowed && value.reveal !== null) || (value.reveal !== null && !isRevealPayload(value.reveal))) {
    throw new Error('The server returned reveal data in an invalid phase.')
  }
  if (!revealAllowed && Array.isArray(value.headToHeadResults) && value.headToHeadResults.length > 0) {
    throw new Error('The server returned Head-to-Head results before the reveal.')
  }

  const scoresAllowed = normaliseQuizType(value.quizType) === 'head-to-head' || ['leaderboard', 'finished'].includes(value.phase)
  if (!scoresAllowed && value.leaderboard.length > 0) {
    throw new Error('The server returned leaderboard data before it was revealed.')
  }
  if (!scoresAllowed && value.players.some((player) =>
    isRecord(player) && (
      player.totalScore !== 0 ||
      player.correctAnswerCount !== 0 ||
      player.totalCorrectResponseMs !== 0
    ))) {
    throw new Error('The server returned player totals before they were revealed.')
  }

  if (isRecord(value.currentQuestion)) {
    const safeQuestion = value.currentQuestion
    const forbiddenKeys = [
      'correctOptionId',
      'correctOptionIds',
      'correctValue',
      'tolerance',
      'targetX',
      'targetY',
      'targetRadius',
      'correctMemberIds',
      'correctAnswer',
      'acceptedAnswers',
      'answerKey',
    ]
    if (forbiddenKeys.some((key) => key in safeQuestion)) {
      throw new Error('The server returned an answer key in the safe question.')
    }
  }

  const themeId = normaliseQuizThemeId(value.themeId)
  const answerPalette = normaliseAnswerPalette(value.answerPaletteId, value.customAnswerColours)
  const rawSettings = isRecord(value.sessionSettings) ? value.sessionSettings : undefined
  const sessionSettings = normaliseGameSessionSettings(
    rawSettings as Partial<SafeGameState['sessionSettings']>,
    value.soundPackId,
    typeof value.sessionId === 'string' ? value.sessionId : undefined,
  )
  const questionPreludeKind = value.questionPreludeKind === 'double-score' || value.questionPreludeKind === 'question-type'
    ? value.questionPreludeKind
    : null
  const doubleScoreVariantIndex = Number.isInteger(value.doubleScoreVariantIndex) && Number(value.doubleScoreVariantIndex) >= 0
    ? Number(value.doubleScoreVariantIndex)
    : null
  return {
    ...value,
    ...answerPalette,
    reveal: outcomeNeutralReveal((value.reveal ?? null) as RevealPayload | null),
    soundPackId: sessionSettings.soundPackId,
    sessionSettings,
    questionPreludeKind,
    doubleScoreVariantIndex,
    quizType: normaliseQuizType(value.quizType),
    headToHeadCompetitors: Array.isArray(value.headToHeadCompetitors) ? value.headToHeadCompetitors : [],
    headToHeadResolutions: Array.isArray(value.headToHeadResolutions) ? value.headToHeadResolutions : [],
    headToHeadResults: Array.isArray(value.headToHeadResults) ? value.headToHeadResults : [],
    themeId,
    backgroundId: normaliseQuizBackgroundId(value.backgroundId, themeId),
  } as unknown as SafeGameState
}
