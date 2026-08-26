import { describe, expect, it } from 'vitest'
import {
  DARK_ANSWER_TEXT,
  LIGHT_ANSWER_TEXT,
  contrastRatio,
  getContrastingTextColour,
  normaliseHexColour,
} from './colourContrast'

describe('answer colour contrast', () => {
  it.each([
    ['#ffffff', DARK_ANSWER_TEXT],
    ['#000000', LIGHT_ANSWER_TEXT],
    ['#FFFF00', DARK_ANSWER_TEXT],
    ['#071326', LIGHT_ANSWER_TEXT],
    ['#00FFFF', DARK_ANSWER_TEXT],
    ['#fff', DARK_ANSWER_TEXT],
  ])('chooses the stronger controlled foreground for %s', (background, foreground) => {
    expect(getContrastingTextColour(background)).toBe(foreground)
    expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5)
  })

  it('accepts upper- and lower-case hex and expands shorthand', () => {
    expect(normaliseHexColour('#aBc')).toBe('#AABBCC')
    expect(normaliseHexColour('#A1B2C3')).toBe('#A1B2C3')
  })

  it('returns null for invalid colour values', () => {
    expect(getContrastingTextColour('blue')).toBeNull()
    expect(getContrastingTextColour('#12')).toBeNull()
    expect(contrastRatio('#FFFFFF', 'not-a-colour')).toBeNull()
  })
})
