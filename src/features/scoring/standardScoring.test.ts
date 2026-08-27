import { describe, expect, it } from 'vitest'
import {
  DOUBLE_SCORE_INTRO_MS,
  calculateStandardQuestionScore,
  calculateTimedScore,
  isQuestionPreludeActive,
  standardQuestionWindow,
} from './standardScoring'

describe('Standard speed scoring', () => {
  it.each([
    [0, 1000],
    [5_000, 875],
    [10_000, 750],
    [15_000, 625],
    [20_000, 500],
  ])('scores a 1000-point answer at %d ms as %d', (elapsed, expected) => {
    expect(calculateTimedScore(1000, elapsed, 20_000)).toBe(expected)
  })

  it('clamps response time to the 100%-to-50% curve', () => {
    expect(calculateTimedScore(1000, -500, 20_000)).toBe(1000)
    expect(calculateTimedScore(1000, 25_000, 20_000)).toBe(500)
    expect(calculateTimedScore(0, 0, 20_000)).toBe(0)
  })

  it('keeps fixed scoring unchanged when speed scoring is disabled', () => {
    expect(calculateStandardQuestionScore(
      1000,
      { speedScoringEnabled: false, doubleScore: false },
      20_000,
      20_000,
    )).toBe(1000)
  })

  it('applies Double Score before speed scaling and keeps zero at zero', () => {
    const question = { speedScoringEnabled: true, doubleScore: true }
    expect(calculateStandardQuestionScore(1000, question, 0, 20_000)).toBe(2000)
    expect(calculateStandardQuestionScore(1000, question, 10_000, 20_000)).toBe(1500)
    expect(calculateStandardQuestionScore(1000, question, 20_000, 20_000)).toBe(1000)
    expect(calculateStandardQuestionScore(0, question, 10_000, 20_000)).toBe(0)
  })

  it('modifies an already-calculated positive partial score in the documented order', () => {
    expect(calculateStandardQuestionScore(
      500,
      { speedScoringEnabled: true, doubleScore: true },
      10_000,
      20_000,
    )).toBe(750)
  })
})

describe('Double Score authoritative timing', () => {
  const transition = Date.parse('2026-08-09T12:00:00.000Z')

  it('opens an ordinary question immediately for its full configured duration', () => {
    expect(standardQuestionWindow({ doubleScore: false, timeLimitSeconds: 20 }, transition)).toEqual({
      openedAt: '2026-08-09T12:00:00.000Z',
      closesAt: '2026-08-09T12:00:20.000Z',
    })
  })

  it('places the five-second intro before a full-duration Double Score question', () => {
    expect(DOUBLE_SCORE_INTRO_MS).toBe(5000)
    expect(standardQuestionWindow({ doubleScore: true, timeLimitSeconds: 20 }, transition)).toEqual({
      openedAt: '2026-08-09T12:00:05.000Z',
      closesAt: '2026-08-09T12:00:25.000Z',
    })
  })

  it('uses a selected session pack duration without stealing question time', () => {
    expect(standardQuestionWindow(
      { doubleScore: true, timeLimitSeconds: 30 },
      transition,
      { doubleScoreIntroMs: 9000, questionTypeIntrosEnabled: true },
    )).toEqual({
      openedAt: '2026-08-09T12:00:09.000Z',
      closesAt: '2026-08-09T12:00:39.000Z',
    })
  })

  it('uses one question-type prelude for a mixed ordinary question', () => {
    expect(standardQuestionWindow(
      { doubleScore: false, timeLimitSeconds: 20 },
      transition,
      { doubleScoreIntroMs: 9000, questionTypeIntrosEnabled: true },
    )).toEqual({
      openedAt: '2026-08-09T12:00:01.750Z',
      closesAt: '2026-08-09T12:00:21.750Z',
    })
  })

  it('derives intro state from the shared opening timestamp without restarting it', () => {
    const opensAt = '2026-08-09T12:00:05.000Z'
    expect(isQuestionPreludeActive('double-score', opensAt, transition)).toBe(true)
    expect(isQuestionPreludeActive('double-score', opensAt, transition + 4999)).toBe(true)
    expect(isQuestionPreludeActive('double-score', opensAt, transition + 5000)).toBe(false)
    expect(isQuestionPreludeActive(null, opensAt, transition)).toBe(false)
  })
})
