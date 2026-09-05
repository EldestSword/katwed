import { describe, expect, it } from 'vitest'
import { nudgeSliderValue, sliderPercentage, sliderValueAtPointer, snapSliderValue } from './playerSlider'

const tenths = { minimum: 0, maximum: 10, step: .1 }
const quarters = { minimum: -2.5, maximum: 2.5, step: .25 }

describe('player Slider arithmetic', () => {
  it.each([
    [-20, tenths, 0], [30, tenths, 10], [2.96, tenths, 3], [.15, tenths, .2],
    [-2.38, quarters, -2.5], [-2.37, quarters, -2.25], [2.49, quarters, 2.5],
    [.25, { minimum: .05, maximum: 1.05, step: .1 }, .25],
    [1, { minimum: 0, maximum: 1, step: .3 }, .9],
    [.28, { minimum: .07, maximum: .28, step: .07 }, .28],
    [2.9e-7, { minimum: 1e-7, maximum: 1e-6, step: 1e-7 }, 3e-7],
  ])('snaps %s to a clean in-range step', (value, scale, expected) => {
    expect(snapSliderValue(value, scale)).toBe(expected)
  })

  it('nudges repeatedly without decimal drift in either direction and clamps both ends', () => {
    let value = 0
    const firstValues: number[] = []
    for (let index = 0; index < 110; index++) {
      value = nudgeSliderValue(value, 1, tenths)
      if (index < 3) firstValues.push(value)
      expect(value).toBe(Number(value.toFixed(1)))
    }
    expect(firstValues).toEqual([.1, .2, .3])
    expect(value).toBe(10)
    for (let index = 0; index < 110; index++) value = nudgeSliderValue(value, -1, tenths)
    expect(value).toBe(0)
    expect(nudgeSliderValue(-2.5, 1, quarters)).toBe(-2.25)
    expect(nudgeSliderValue(-2.25, -1, quarters)).toBe(-2.5)
  })

  it.each([[-3, 0], [-2.5, 0], [0, 50], [1.25, 75], [2.5, 100], [3, 100]])('positions %s at %s percent', (value, expected) => {
    expect(sliderPercentage(value, quarters)).toBe(expected)
  })

  it('maps the actual thumb travel and clamps pointers outside the input', () => {
    const bounds = { left: 100, width: 240 }
    expect(sliderValueAtPointer(120, bounds, 40, tenths)).toBe(0)
    expect(sliderValueAtPointer(170, bounds, 40, tenths)).toBe(2.5)
    expect(sliderValueAtPointer(220, bounds, 40, tenths)).toBe(5)
    expect(sliderValueAtPointer(320, bounds, 40, tenths)).toBe(10)
    expect(sliderValueAtPointer(-100, bounds, 40, tenths)).toBe(0)
    expect(sliderValueAtPointer(900, bounds, 40, tenths)).toBe(10)
    expect(sliderValueAtPointer(40, { left: 0, width: 40 }, 40, tenths)).toBe(0)
  })
})
