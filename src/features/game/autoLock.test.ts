import { describe, expect, it } from 'vitest'
import { shouldAutoLockStandardQuestion } from './autoLock'

describe('Standard answer auto-lock', () => {
  const check = (overrides: Partial<Parameters<typeof shouldAutoLockStandardQuestion>[0]> = {}) => shouldAutoLockStandardQuestion({
    quizType: 'standard', phase: 'question', submittedCount: 0, joinedPlayerCount: 4,
    deadlineReached: false, ...overrides,
  })

  it('waits at 3 of 4 and locks at 4 of 4', () => {
    expect(check({ submittedCount: 3 })).toBe(false)
    expect(check({ submittedCount: 4 })).toBe(true)
  })

  it('never treats zero joined players as complete', () => {
    expect(check({ joinedPlayerCount: 0, submittedCount: 0 })).toBe(false)
  })

  it('counts every joined player rather than only connected players', () => {
    expect(check({ joinedPlayerCount: 4, submittedCount: 3 })).toBe(false)
  })

  it('retains timer locking and leaves Head-to-Head unaffected', () => {
    expect(check({ deadlineReached: true })).toBe(true)
    expect(check({ quizType: 'head-to-head', submittedCount: 4, deadlineReached: true })).toBe(false)
  })

  it('keeps timer locking but ignores everybody-submitted when session auto-lock is off', () => {
    expect(check({ submittedCount: 4, autoLockWhenAllAnswered: false })).toBe(false)
    expect(check({ submittedCount: 4, autoLockWhenAllAnswered: false, deadlineReached: true })).toBe(true)
  })

  it('treats only the Buzz winner as eligible after a claim', () => {
    expect(check({ joinedPlayerCount: 20, submittedCount: 0, eligibleResponderCount: 0 })).toBe(false)
    expect(check({ joinedPlayerCount: 20, submittedCount: 0, eligibleResponderCount: 1 })).toBe(false)
    expect(check({ joinedPlayerCount: 20, submittedCount: 1, eligibleResponderCount: 1 })).toBe(true)
  })
})
