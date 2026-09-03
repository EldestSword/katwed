import { normalisePinpointTarget, pinpointContains } from '../features/game/pinpointTargets'
import type {
  LeaderboardEntry,
  Player,
  PlayerAnswerPayload,
  Question,
} from '../types/domain'
import { MAX_TYPED_ANSWER_LENGTH, isMeaningfulTypedAnswer, typedAnswerMatches } from '../features/typed-answer/typedAnswer'

export type PairScore =
  | { valid: true; correct: boolean; points: 0 | 1 }
  | { valid: false; correct: false; points: 0; reason: 'selection-count' | 'duplicate-selection' }

export function scoreExactPair(
  selectedIds: readonly string[],
  correctIds: readonly string[],
): PairScore {
  if (selectedIds.length !== 2 || correctIds.length !== 2) {
    return { valid: false, correct: false, points: 0, reason: 'selection-count' }
  }

  if (new Set(selectedIds).size !== 2 || new Set(correctIds).size !== 2) {
    return { valid: false, correct: false, points: 0, reason: 'duplicate-selection' }
  }

  const selected = new Set(selectedIds)
  const correct = selected.has(correctIds[0]) && selected.has(correctIds[1])
  return { valid: true, correct, points: correct ? 1 : 0 }
}

export type QuestionScore =
  | { valid: true; correct: boolean; points: number }
  | { valid: false; correct: false; points: 0; reason: string }

function invalid(reason: string): QuestionScore {
  return { valid: false, correct: false, points: 0, reason }
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function approximatelyOnStep(value: number, minimum: number, step: number): boolean {
  const steps = (value - minimum) / step
  return Math.abs(steps - Math.round(steps)) < 1e-8
}

export function scoreQuestion(question: Question, answer: PlayerAnswerPayload): QuestionScore {
  if (question.type !== answer.type) return invalid('answer-type')

  switch (question.type) {
    case 'single-choice': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'single-choice' }>
      if (!question.options.some((option) => option.id === payload.optionId)) return invalid('invalid-option')
      const correct = payload.optionId === question.correctOptionId
      return { valid: true, correct, points: correct ? question.points : 0 }
    }
    case 'multiple-select': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'multiple-select' }>
      const unique = new Set(payload.optionIds)
      const optionIds = new Set(question.options.map((option) => option.id))
      if (
        unique.size !== payload.optionIds.length ||
        payload.optionIds.length < question.minimumSelections ||
        payload.optionIds.length > question.maximumSelections
      ) return invalid('selection-count')
      if (payload.optionIds.some((id) => !optionIds.has(id))) return invalid('invalid-option')
      const correct = sameSet(payload.optionIds, question.correctOptionIds)
      if (question.scoringMode === 'exact') {
        return { valid: true, correct, points: correct ? question.points : 0 }
      }
      if (payload.optionIds.some((id) => !question.correctOptionIds.includes(id))) {
        return { valid: true, correct: false, points: 0 }
      }
      const points = Math.floor(question.points * payload.optionIds.length / question.correctOptionIds.length)
      return { valid: true, correct, points: correct ? question.points : points }
    }
    case 'true-false': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'true-false' }>
      const correct = payload.value === question.correctValue
      return { valid: true, correct, points: correct ? question.points : 0 }
    }
    case 'slider': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'slider' }>
      if (
        !Number.isFinite(payload.value) ||
        payload.value < question.minimum ||
        payload.value > question.maximum ||
        !approximatelyOnStep(payload.value, question.minimum, question.step)
      ) return invalid('invalid-value')
      const correct = Math.abs(payload.value - question.correctValue) <= question.tolerance + Number.EPSILON
      return { valid: true, correct, points: correct ? question.points : 0 }
    }
    case 'pinpoint': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'pinpoint' }>
      if (
        !Number.isFinite(payload.x) ||
        !Number.isFinite(payload.y) ||
        payload.x < 0 ||
        payload.x > 1 ||
        payload.y < 0 ||
        payload.y > 1
      ) return invalid('invalid-coordinates')
      const correct = pinpointContains(normalisePinpointTarget(question), payload)
      return { valid: true, correct, points: correct ? question.points : 0 }
    }
    case 'typed-answer': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'typed-answer' }>
      const value = payload.value.trim()
      if (value.length > MAX_TYPED_ANSWER_LENGTH || !isMeaningfulTypedAnswer(value)) return invalid('invalid-value')
      const correct = typedAnswerMatches(value, question.correctAnswer, question.acceptedAnswers)
      return { valid: true, correct, points: correct ? question.points : 0 }
    }
    case 'mashup': {
      const payload = answer as Extract<PlayerAnswerPayload, { type: 'mashup' }>
      const result = scoreExactPair(payload.memberIds, question.correctMemberIds)
      if (!result.valid) return invalid(result.reason)
      return { valid: true, correct: result.correct, points: result.correct ? question.points : 0 }
    }
  }
}

export function sortLeaderboard(players: readonly Player[]): LeaderboardEntry[] {
  const sorted = [...players].sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.correctAnswerCount - a.correctAnswerCount ||
      a.totalCorrectResponseMs - b.totalCorrectResponseMs ||
      a.nickname.localeCompare(b.nickname, 'en-GB', { sensitivity: 'base' }),
  )

  return sorted.map((player, index) => ({
    playerId: player.id,
    nickname: player.nickname,
    totalScore: player.totalScore,
    correctAnswerCount: player.correctAnswerCount,
    totalCorrectResponseMs: player.totalCorrectResponseMs,
    rank: index + 1,
  }))
}
