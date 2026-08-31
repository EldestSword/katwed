import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { Question } from '../../types/domain'
import { formatHostAnswer } from './hostAnswerFormatting'

function question(type: Question['type']): Question {
  const match = mixedDemoQuiz.questions.find((candidate) => candidate.type === type)
  if (!match) throw new Error(`Missing ${type} fixture`)
  return match
}

describe('formatHostAnswer', () => {
  it('formats choice and Boolean answers as authored labels', () => {
    expect(formatHostAnswer(question('single-choice'), mixedDemoQuiz.roster)).toEqual({ label: 'Correct answer', value: 'Mars' })
    expect(formatHostAnswer(question('multiple-select'), mixedDemoQuiz.roster)).toEqual({ label: 'Correct answers', value: 'Red, Green, Blue' })
    expect(formatHostAnswer(question('true-false'), mixedDemoQuiz.roster)).toEqual({ label: 'Correct answer', value: 'True' })
  })

  it('formats slider and pinpoint tolerances for the host', () => {
    expect(formatHostAnswer(question('slider'), mixedDemoQuiz.roster)).toMatchObject({
      label: 'Correct value', value: '1440 minutes', detail: 'Accepted range: 1430 minutes–1450 minutes',
    })
    expect(formatHostAnswer(question('pinpoint'), mixedDemoQuiz.roster)).toEqual({
      label: 'Correct target', value: '50% across · 43% down', detail: 'Accepted radius: 12% of the normalised image scale',
    })
  })

  it('formats Typed Answer variants and resolves both mash-up names', () => {
    expect(formatHostAnswer(question('typed-answer'), mixedDemoQuiz.roster)).toEqual({
      label: 'Accepted answer', value: 'Red Dwarf', detail: 'Also accepts: The Red Dwarf',
    })
    expect(formatHostAnswer(question('mashup'), mixedDemoQuiz.roster)).toEqual({
      label: 'Correct pair', value: 'Alex + Bailey',
    })
  })
})
