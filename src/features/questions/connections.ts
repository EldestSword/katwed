import type { ConnectionClue, ConnectionsQuestion, SafeQuestion } from '../../types/domain'
import { onlyFields } from './arrangementQuestions'
import { validateTypedAnswers } from '../typed-answer/typedAnswer'

export function connectionStagePoints(basePoints: number, totalClues: number, revealedClueCount: number): number {
  if (!Number.isInteger(basePoints) || basePoints < 0 || !Number.isInteger(totalClues) || totalClues < 2 || totalClues > 6 ||
    !Number.isInteger(revealedClueCount) || revealedClueCount < 1 || revealedClueCount > totalClues) return 0
  return Math.floor(basePoints * (totalClues - revealedClueCount + 1) / totalClues)
}

export function validConnectionClues(value: unknown, minimum = 2): value is ConnectionClue[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 6) return false
  const ids = new Set<string>(), texts = new Set<string>()
  return value.every(clue => {
    if (!onlyFields(clue, ['id', 'text']) || typeof clue.id !== 'string' || !clue.id || clue.id.length > 128 ||
      typeof clue.text !== 'string' || !clue.text.trim() || clue.text.trim().length > 200) return false
    const text = clue.text.trim().toLowerCase()
    if (ids.has(clue.id) || texts.has(text)) return false
    ids.add(clue.id); texts.add(text); return true
  })
}

export function connectionValidation(question: ConnectionsQuestion): string[] {
  return [
    ...(!validConnectionClues(question.clues) ? ['Connections needs 2–6 clues with unique IDs and distinct text of 1–200 characters.'] : []),
    ...validateTypedAnswers(question.correctAnswer, question.acceptedAnswers),
  ]
}

/** Called at the repository boundary, before any public state is serialised. */
export function connectionSafeFields(question: ConnectionsQuestion, count: number, reveal: boolean): Pick<Extract<SafeQuestion, { type: 'connections' }>, 'visibleClues' | 'revealedClueCount' | 'totalClues' | 'availablePoints'> {
  const totalClues = question.clues.length
  const revealedClueCount = reveal ? totalClues : Math.max(0, Math.min(totalClues, count))
  return {
    visibleClues: question.clues.slice(0, revealedClueCount).map(clue => ({ id: clue.id, text: clue.text.trim() })),
    revealedClueCount, totalClues,
    availablePoints: connectionStagePoints(question.points, totalClues, revealedClueCount) * (question.doubleScore ? 2 : 1),
  }
}
