import { describe, expect, it } from 'vitest'
import { answerTextDensity, hasExtraLongAnswer, questionTextDensity } from './liveQuestionTypography'

describe('live question typography density', () => {
  it('classifies short, medium, long and extra-long text-only prompts', () => {
    expect(questionTextDensity('A short question?', false)).toBe('short')
    expect(questionTextDensity('M'.repeat(100), false)).toBe('medium')
    expect(questionTextDensity('L'.repeat(180), false)).toBe('long')
    expect(questionTextDensity('X'.repeat(260), false)).toBe('extra-long')
  })

  it('moves image questions into compact tiers sooner', () => {
    const prompt = 'A moderately wordy question whose image should remain the visual focus.'
    expect(questionTextDensity(prompt, false)).toBe('short')
    expect(questionTextDensity(prompt, true)).toBe('medium')
  })

  it('uses total length and the longest word to size answers without splitting them', () => {
    expect(answerTextDensity('Paris')).toBe('short')
    expect(answerTextDensity('A longer answer made from several ordinary words')).toBe('long')
    expect(answerTextDensity('SomethingVeryLongIndeed')).toBe('long')
    expect(answerTextDensity('Pneumonoultramicroscopicsilicovolcanoconiosis')).toBe('extra-long')
    expect(hasExtraLongAnswer(['Short', 'Pneumonoultramicroscopicsilicovolcanoconiosis'])).toBe(true)
  })
})
