import { describe, expect, it } from 'vitest'
import type { Question } from '../../types/domain'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { connectionsFixture } from '../../test/connectionsFixtures'
import { matchingFixture, orderingFixture } from '../../test/arrangementFixtures'
import { calculateStandardQuestionScore } from './standardScoring'
import { canOfferProgressiveReveal, progressiveRevealProgress, progressiveRevealScore, progressiveRevealValidation } from './progressiveReveal'

describe('Progressive scoring', () => {
  it.each([[0, 1000], [5000, 812], [10000, 625], [15000, 437], [20000, 250], [59000, 250], [-1, 1000]])('%d ms earns %d', (elapsed, score) => {
    expect(progressiveRevealScore(1000, elapsed, 20000)).toBe(score)
  })
  it('uses exact integer floors, including odd base scores and durations', () => {
    for (const base of [0, 1, 501, 999, 1000]) for (const duration of [1, 19999, 20000]) for (const elapsed of [0, 1, 5000, 10000, 20000]) {
      expect(progressiveRevealScore(base, elapsed, duration)).toBe(Number(BigInt(base) * (4n * BigInt(duration) - 3n * BigInt(Math.min(elapsed, duration))) / (4n * BigInt(duration))))
    }
  })
  it.each([[1000, 0, 0], [-1, 0, 20], [1000, NaN, 20], [1000, Infinity, 20], [1000, 0, NaN]])('handles invalid numbers safely (%s/%s/%s)', (base, elapsed, duration) => {
    expect(progressiveRevealScore(base, elapsed, duration)).toBe(0)
  })
  it('replaces ordinary speed scoring and uses image duration rather than question duration', () => {
    const q = progressiveQuestion()
    expect(calculateStandardQuestionScore(1000, q, 10000, 60000)).toBe(625)
    expect(calculateStandardQuestionScore(1000, { ...q, speedScoringEnabled: false }, 10000, 60000)).toBe(625)
    expect(calculateStandardQuestionScore(0, q, 10000, 60000)).toBe(0)
    expect(calculateStandardQuestionScore(1000, { ...q, progressiveRevealEnabled: false }, 10000, 60000)).toBe(916)
  })
  it('decays earned partial points, floors, then doubles (never doubles first)', () => {
    const q = { ...progressiveQuestion(), doubleScore: true }
    expect(calculateStandardQuestionScore(500, q, 10000, 60000)).toBe(624)
    expect(calculateStandardQuestionScore(1000, q, 10000, 60000)).toBe(1250)
  })
  it('waits for opening, clamps after completion, and never invents a missing clock', () => {
    const start = '2026-09-04T12:00:00Z', ms = Date.parse(start)
    expect(progressiveRevealProgress(start, ms - 5000, 20000)).toBe(0)
    expect(progressiveRevealProgress(start, ms + 10000, 20000)).toBe(.5)
    expect(progressiveRevealProgress(start, ms + 60000, 20000)).toBe(1)
    expect(progressiveRevealProgress(null, ms, 20000)).toBe(0)
  })
})
describe('Modifier eligibility', () => {
  it.each([...mixedDemoQuiz.questions.filter(q => !['pinpoint', 'connections'].includes(q.type)), orderingFixture(), matchingFixture()])('allows image $type questions', q => {
    expect(progressiveRevealValidation({ ...q, progressiveRevealEnabled: true, timeLimitSeconds: 60, media: progressiveQuestion().media })).toEqual([])
  })
  it.each(['none', 'youtube', 'immediate', 'zero', 'long', 'over-timer', 'pinpoint', 'connections', 'h2h'] as const)('rejects %s', kind => {
    let q = { ...progressiveQuestion() } as Question
    if (kind === 'none') q.media = { type: 'none' }
    if (kind === 'youtube') q.media = { type: 'youtube', videoId: 'abc123def45' }
    if (q.media.type === 'image') {
      if (kind === 'immediate') q.media.revealEffect = 'immediate'
      if (kind === 'zero') q.media.revealDurationSeconds = 0
      if (kind === 'long') { q.media.revealDurationSeconds = 181; q.timeLimitSeconds = 200 }
      if (kind === 'over-timer') q.timeLimitSeconds = 10
    }
    if (kind === 'connections') q = { ...connectionsFixture(), progressiveRevealEnabled: true, media: q.media }
    if (kind === 'pinpoint') q = { ...mixedDemoQuiz.questions.find(q => q.type === 'pinpoint')!, progressiveRevealEnabled: true }
    expect(progressiveRevealValidation(q, kind === 'h2h' ? 'head-to-head' : 'standard')).not.toEqual([])
  })
  it('offers authoring before choosing an effect, and leaves legacy missing flags off', () => {
    const q = progressiveQuestion(); q.media = { ...q.media, type: 'image', path: '/image.png', altText: '', revealEffect: 'immediate', revealDurationSeconds: 0 }
    expect(canOfferProgressiveReveal(q)).toBe(true)
    expect(progressiveRevealValidation({ ...q, progressiveRevealEnabled: undefined })).toEqual([])
  })
})
