import { describe, expect, it } from 'vitest'
import { allWagerQuestions, wagerQuiz } from '../../test/wagerFixtures'
import { exportQuizToPortable, KATWED_QUIZ_FORMAT_VERSION } from '../quiz-transfer/katwedQuizFormat'
import { defaultLaunchGameSettings, normaliseLaunchGameSettings } from './launchSettings'
import { extractPowerUp, parsePersonalPowerUps, powerUpFinalPoints, powerUpScoringTime, powerUpUnavailableReason } from './powerUps'
import type { PlayerAnswerPayload, PowerUpId } from '../../types/domain'
import { loadSubmittedAnswer, saveSubmittedAnswer } from '../../services/playerSession'

describe('Power-Up rules', () => {
  it.each([[800,1600],[0,0],[-500,-500],[2000,4000],[1500,3000],[-1000,-1000],[250,500]])('Double Up maps %i to %i after ordinary scoring', (before,after) => expect(powerUpFinalPoints(before,'double-up')).toBe(after))
  it('reduces scoring time only, clamped at zero', () => {
    expect(powerUpScoringTime(8000,'fast-five')).toBe(3000)
    expect(powerUpScoringTime(3000,'fast-five')).toBe(0)
    expect(powerUpScoringTime(8000,'double-up')).toBe(8000)
  })
  it('limits 50/50 to four-option Single Choice and Fast Five to non-progressive Speed questions', () => {
    for (const q of allWagerQuestions()) {
      expect(powerUpUnavailableReason('double-up',q)).toBeNull()
      expect(powerUpUnavailableReason('fifty-fifty',q) === null).toBe(q.type === 'single-choice' && q.options.length >= 4)
      expect(powerUpUnavailableReason('fast-five',{ ...q, speedScoringEnabled:true }) === null).toBe(q.type !== 'connections')
      expect(powerUpUnavailableReason('fast-five',{ ...q, speedScoringEnabled:true, progressiveRevealEnabled:true })).toBeTruthy()
      for (const id of ['double-up','fifty-fifty','fast-five'] as PowerUpId[]) expect(powerUpUnavailableReason(id,{ ...q,buzzInEnabled:true })).toBeTruthy()
    }
  })
  it('defaults off, supports Standard modes, forces H2H off, and leaves portable v12 untouched', () => {
    const quiz=wagerQuiz()
    expect(defaultLaunchGameSettings(quiz).powerUpsEnabled).toBe(false)
    for (const settings of [{}, { playMode:'teams' as const }, { competitionMode:'survivor' as const }]) expect(normaliseLaunchGameSettings({...settings,powerUpsEnabled:true},quiz).powerUpsEnabled).toBe(true)
    expect(normaliseLaunchGameSettings({powerUpsEnabled:true},{...quiz,quizType:'head-to-head'}).powerUpsEnabled).toBe(false)
    expect(KATWED_QUIZ_FORMAT_VERSION).toBe(12)
    expect(JSON.stringify(exportQuizToPortable(quiz))).not.toMatch(/powerUp|power_up|fifty-fifty|fast-five|double-up/)
  })
  it('extracts only valid optional metadata and retains unrelated fields for strict core validation', () => {
    expect(extractPowerUp({type:'true-false',value:true})).toEqual({answer:{type:'true-false',value:true},powerUp:null})
    for (const powerUp of ['fifty-fifty','unknown',true,[],{}]) expect(extractPowerUp({type:'true-false',value:true,powerUp} as PlayerAnswerPayload)).toBeNull()
    const extra={type:'true-false',value:true,powerUp:'double-up',other:1} as PlayerAnswerPayload
    expect(extractPowerUp(extra)?.answer).toHaveProperty('other',1)
    expect(extra).toHaveProperty('powerUp','double-up')
  })
  it('validates private inventory uniqueness, two retained IDs, and persisted answer metadata', () => {
    const state={runId:'run',uses:[{questionId:'q1',powerUp:'fifty-fifty',optionIds:['b','d']}]}
    expect(parsePersonalPowerUps(state)).toEqual(state)
    expect(()=>parsePersonalPowerUps({...state,uses:[...state.uses,...state.uses]})).toThrow()
    expect(()=>parsePersonalPowerUps({...state,uses:[{...state.uses[0],correctOptionId:'b'}]})).toThrow()
    expect(()=>parsePersonalPowerUps({...state,uses:[{...state.uses[0],optionIds:['b','b']}]})).toThrow()
    saveSubmittedAnswer('player','question','opened',{type:'true-false',value:true,powerUp:'fast-five'})
    expect(loadSubmittedAnswer('player','question','opened')).toEqual({type:'true-false',value:true,powerUp:'fast-five'})
  })
})
