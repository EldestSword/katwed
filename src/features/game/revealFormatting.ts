import type { SliderQuestion } from '../../types/domain'

export function formatSliderValue(
  value: number,
  question: Pick<SliderQuestion, 'prefix' | 'suffix' | 'unitLabel'>,
): string {
  const unit = question.unitLabel ? ` ${question.unitLabel}` : ''
  return `${question.prefix}${value}${question.suffix}${unit}`
}
