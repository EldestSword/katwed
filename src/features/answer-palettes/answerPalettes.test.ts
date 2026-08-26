import { describe, expect, it } from 'vitest'
import { ANSWER_PALETTE_IDS } from '../../types/domain'
import {
  CLASSIC_ANSWER_COLOURS,
  answerColourAt,
  answerPalettes,
  isAnswerColourTuple,
  normaliseAnswerColourTuple,
  normaliseAnswerPalette,
  resolveAnswerColours,
} from './answerPalettes'
import { contrastRatio, getContrastingTextColour } from './colourContrast'

describe('answer palettes', () => {
  it('registers every requested preset with exactly eight validated colours', () => {
    expect(answerPalettes.map((palette) => palette.id)).toEqual(ANSWER_PALETTE_IDS.filter((id) => id !== 'custom'))
    answerPalettes.forEach((palette) => {
      expect(palette.name).not.toBe('')
      expect(palette.description).not.toBe('')
      expect(isAnswerColourTuple(palette.colours)).toBe(true)
    })
  })

  it('normalises valid custom colours and rejects malformed palettes', () => {
    expect(normaliseAnswerColourTuple(['#abcdef', '#123456', '#654321', '#AABBCC', '#000000', '#FFFFFF', '#C62828', '#1565C0']))
      .toEqual(['#ABCDEF', '#123456', '#654321', '#AABBCC', '#000000', '#FFFFFF', '#C62828', '#1565C0'])
    expect(normaliseAnswerColourTuple(['#FFFFFF'])).toBeNull()
    expect(normaliseAnswerColourTuple([...CLASSIC_ANSWER_COLOURS.slice(0, 7), 'red'])).toBeNull()
  })

  it('defaults unknown or missing configuration to Classic', () => {
    expect(normaliseAnswerPalette('unknown', null)).toEqual({
      answerPaletteId: 'classic',
      customAnswerColours: CLASSIC_ANSWER_COLOURS,
    })
    expect(resolveAnswerColours('classic', [])).toEqual(CLASSIC_ANSWER_COLOURS)
  })

  it('uses custom colours and cycles gracefully beyond eight positions', () => {
    const custom = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007', '#000008'] as const
    expect(resolveAnswerColours('custom', custom)).toEqual(custom)
    expect(answerColourAt(custom, 8)).toBe(custom[0])
    expect(answerColourAt(custom, 17)).toBe(custom[1])
  })

  it('keeps every preset tile at WCAG AA text contrast', () => {
    for (const palette of answerPalettes) {
      for (const colour of palette.colours) {
        const foreground = getContrastingTextColour(colour)
        expect(foreground, `${palette.name} ${colour}`).not.toBeNull()
        expect(contrastRatio(colour, foreground!), `${palette.name} ${colour}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
