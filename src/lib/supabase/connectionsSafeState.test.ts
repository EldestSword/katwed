import { expect, it } from 'vitest'
import { connectionsState, safeConnections } from '../../test/connectionsFixtures'
import { parseSafeGameState } from './safeGameState'

it.each([1, 2, 3, 4])('accepts exactly the visible prefix at stage %d', count => {
  const state = parseSafeGameState(connectionsState(count))
  expect(state.currentQuestion).toMatchObject({ revealedClueCount: count })
  for (const text of ['Mercury', 'Venus', 'Earth', 'Mars'].slice(count)) expect(JSON.stringify(state)).not.toContain(text)
})
it.each(['future-clues', 'extra-text', 'count', 'total', 'points', 'answer', 'alternatives', 'h2h', 'early-reveal'])('rejects unsafe/malformed %s', kind => {
  const state = connectionsState(), q = state.currentQuestion!
  if (kind === 'future-clues') Object.assign(q, { clues: [{ id: 'future', text: 'secret' }] })
  if (kind === 'extra-text' && q.type === 'connections') Object.assign(q.visibleClues[0], { future: 'secret' })
  if (kind === 'count') Object.assign(q, { revealedClueCount: 3 })
  if (kind === 'total') Object.assign(q, { totalClues: 7 })
  if (kind === 'points') Object.assign(q, { availablePoints: 9999 })
  if (kind === 'answer') Object.assign(q, { correctAnswer: 'secret' })
  if (kind === 'alternatives') Object.assign(q, { acceptedAnswers: ['secret'] })
  if (kind === 'h2h') state.quizType = 'head-to-head'
  if (kind === 'early-reveal') state.reveal = { type: 'connections', correctAnswer: 'Planets', correctPlayerIds: [], caption: '' }
  expect(() => parseSafeGameState(state)).toThrow()
})
it('keeps the prefix when locked and permits all clues plus primary answer only on reveal', () => {
  const state = connectionsState(3)
  state.phase = 'locked'; expect(JSON.stringify(parseSafeGameState(state))).not.toContain('Mars')
  state.phase = 'reveal'; state.currentQuestion = safeConnections(3, true)
  state.reveal = { type: 'connections', correctAnswer: 'Planets', correctPlayerIds: ['p'], caption: '' }
  expect(parseSafeGameState(state).reveal).toEqual(state.reveal)
  Object.assign(state.reveal, { acceptedAnswers: ['secret'] })
  expect(() => parseSafeGameState(state)).toThrow()
})
