import type { SliderQuestion } from '../../types/domain'

type SliderScale = Pick<SliderQuestion, 'minimum' | 'maximum' | 'step'>

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function decimalPlaces(value: number): number {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e')
  return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent))
}

function indexError(index: number): number {
  return Number.EPSILON * Math.max(1, Math.abs(index)) * 4
}

/** Match a native range: steps start at minimum; an unaligned maximum is not a valid step. */
export function snapSliderValue(value: number, scale: SliderScale): number {
  const { minimum, maximum, step } = scale
  const lastIndex = (maximum - minimum) / step
  const index = (clamp(value, minimum, maximum) - minimum) / step
  const snappedIndex = clamp(Math.floor(index + .5 + indexError(index)), 0, Math.floor(lastIndex + indexError(lastIndex)))
  // Round the indexed result, rather than accumulating floating-point additions on every nudge.
  const precision = Math.min(100, Math.max(decimalPlaces(minimum), decimalPlaces(step)))
  return Number((minimum + snappedIndex * step).toFixed(precision))
}

export function nudgeSliderValue(value: number, direction: -1 | 1, scale: SliderScale): number {
  return snapSliderValue(value + direction * scale.step, scale)
}

export function sliderPercentage(value: number, scale: Pick<SliderScale, 'minimum' | 'maximum'>): number {
  if (scale.maximum <= scale.minimum) return 0
  return clamp((value - scale.minimum) / (scale.maximum - scale.minimum), 0, 1) * 100
}

export function sliderValueAtPointer(
  clientX: number,
  bounds: { left: number; width: number },
  thumbSize: number,
  scale: SliderScale,
): number {
  // The native thumb centre travels between half-thumb insets, not the input's outer edges.
  const travel = bounds.width - thumbSize
  const position = travel > 0 ? clamp((clientX - bounds.left - thumbSize / 2) / travel, 0, 1) : 0
  return snapSliderValue(scale.minimum + position * (scale.maximum - scale.minimum), scale)
}
