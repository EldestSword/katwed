import type { SafeQuestion } from '../../types/domain'

export function formatSliderValue(value: number, question: Extract<SafeQuestion, { type: 'slider' }>): string {
  const unit = question.unitLabel ? ` ${question.unitLabel}` : ''
  return `${question.prefix}${value}${question.suffix}${unit}`
}
