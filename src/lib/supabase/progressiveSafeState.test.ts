import { expect, it } from 'vitest'
import { progressiveState } from '../../test/progressiveFixtures'
import { parseSafeGameState } from './safeGameState'

it.each(['question', 'locked'] as const)('requires neutral network alt and hides answer data in %s', phase => {
  const state = { ...progressiveState(), phase }
  expect(() => parseSafeGameState(state)).not.toThrow()
  const q = state.currentQuestion!
  Object.assign(q.media, { altText: 'Alex is the answer' })
  expect(() => parseSafeGameState(state)).toThrow()
  Object.assign(q.media, { altText: 'Progressively revealing question image' }); Object.assign(q, { correctAnswer: 'Alex' })
  expect(() => parseSafeGameState(state)).toThrow()
})
it.each(['flag', 'duration', 'effect', 'speed', 'h2h'] as const)('rejects malformed progressive %s state', kind => {
  const state = progressiveState(), q = state.currentQuestion!
  if (kind === 'flag') Object.assign(q, { progressiveRevealEnabled: 'true' })
  if (kind === 'duration') Object.assign(q.media, { revealDurationSeconds: 100 })
  if (kind === 'effect') Object.assign(q.media, { revealEffect: 'immediate' })
  if (kind === 'speed') q.speedScoringEnabled = true
  if (kind === 'h2h') state.quizType = 'head-to-head'
  expect(() => parseSafeGameState(state)).toThrow()
})
it('allows descriptive alt at answer reveal and accepts old states with no modifier', () => {
  const state = progressiveState()
  state.phase = 'reveal'; state.reveal = { type: 'typed-answer', correctAnswer: 'Alex', correctPlayerIds: [], caption: '' }
  Object.assign(state.currentQuestion!.media, { altText: 'Alex is the answer' })
  expect(() => parseSafeGameState(state)).not.toThrow()
  delete state.currentQuestion!.progressiveRevealEnabled
  state.phase = 'question'; state.reveal = null
  expect(() => parseSafeGameState(state)).not.toThrow()
})
