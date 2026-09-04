import type { Question, RosterMember } from '../../types/domain'
import { formatSliderValue } from './revealFormatting'

export interface HostAnswerSummary {
  label: string
  value: string
  detail?: string
}

function choiceLabel(question: Extract<Question, { type: 'single-choice' | 'multiple-select' }>, optionId: string): string {
  return question.options.find((option) => option.id === optionId)?.label || 'Unavailable option'
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatHostAnswer(question: Question, roster: readonly RosterMember[]): HostAnswerSummary {
  switch (question.type) {
    case 'single-choice':
      return { label: 'Correct answer', value: choiceLabel(question, question.correctOptionId) }
    case 'multiple-select':
      return {
        label: 'Correct answers',
        value: question.correctOptionIds.map((optionId) => choiceLabel(question, optionId)).join(', '),
      }
    case 'true-false':
      return { label: 'Correct answer', value: question.correctValue ? 'True' : 'False' }
    case 'slider': {
      const detail = question.tolerance > 0
        ? `Accepted range: ${formatSliderValue(question.correctValue - question.tolerance, question)}–${formatSliderValue(question.correctValue + question.tolerance, question)}`
        : 'Exact value required'
      return { label: 'Correct value', value: formatSliderValue(question.correctValue, question), detail }
    }
    case 'pinpoint': {
      const target = question.target
      if (!target) return { label: 'Correct target', value: 'No area configured' }
      if (target.kind === 'polygon') return { label: 'Correct target', value: 'Freehand area', detail: target.points.length + ' vertices' }
      if (target.kind === 'rectangle') return { label: 'Correct target', value: 'Rectangle', detail: percentage(target.width) + ' wide · ' + percentage(target.height) + ' high' }
      return {
        label: 'Correct target',
        value: percentage(target.x) + ' across · ' + percentage(target.y) + ' down',
        detail: 'Accepted radius: ' + percentage(target.radius) + ' of the normalised image scale',
      }
    }
    case 'typed-answer':
      return {
        label: 'Accepted answer',
        value: question.correctAnswer,
        detail: question.acceptedAnswers.length > 0
          ? `Also accepts: ${question.acceptedAnswers.join(', ')}`
          : undefined,
      }
    case 'mashup': {
      const names = question.correctMemberIds.map((memberId) => (
        roster.find((member) => member.id === memberId)?.displayName || 'Unavailable person'
      ))
      return { label: 'Correct pair', value: names.join(' + ') }
    }
  }
}
