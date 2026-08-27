import { describe, expect, it } from 'vitest'
import type { SafeGameState, SafeQuestion } from '../../types/domain'
import { deriveGameAudioIntent, urgencyThreshold } from './gameAudioState'

function state(overrides: Partial<SafeGameState> = {}): SafeGameState {
  return {
    sessionId: 'session', quizTitle: 'Quiz', quizType: 'standard', themeId: 'katwed', backgroundId: null,
    soundPackId: 'katwed', roomCode: '123456', status: 'active', phase: 'question', currentQuestion: {
      id: 'question', type: 'true-false', prompt: 'True?', supportingText: '', timeLimitSeconds: 30,
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      questionNumber: 1, totalQuestions: 2,
    }, roster: [], players: [], submittedCount: 0, leaderboard: [], reveal: null,
    questionOpenedAt: '2026-08-27T12:00:00.000Z', questionClosesAt: '2026-08-27T12:00:30.000Z',
    ...overrides,
  }
}

describe('authoritative game state to audio mapping', () => {
  it('maps Lobby → Question → Urgent → Locked → Reveal → Leaderboard → Final', () => {
    expect(deriveGameAudioIntent(state({ phase: 'lobby' }), 30, null).displayCue).toBe('lobby')
    expect(deriveGameAudioIntent(state(), 11, null).displayCue).toBe('question')
    expect(deriveGameAudioIntent(state(), 10, null).displayCue).toBe('urgent')
    expect(deriveGameAudioIntent(state({ phase: 'locked' }), 0, null).displayCue).toBe('lock')
    expect(deriveGameAudioIntent(state({ phase: 'reveal' }), 0, null).displayCue).toBe('reveal')
    expect(deriveGameAudioIntent(state({ phase: 'leaderboard' }), 0, null).displayCue).toBe('leaderboard')
    expect(deriveGameAudioIntent(state({ phase: 'finished' }), 0, null).displayCue).toBe('final')
  })

  it('uses proportionate urgency and leaves very short questions on the normal bed', () => {
    expect(urgencyThreshold(30)).toBe(10)
    expect(urgencyThreshold(15)).toBe(5)
    expect(urgencyThreshold(10)).toBe(5)
    expect(urgencyThreshold(9)).toBeNull()
    const short = state({ currentQuestion: { ...state().currentQuestion!, timeLimitSeconds: 9 } })
    expect(deriveGameAudioIntent(short, 1, null).displayCue).toBe('question')
    expect(deriveGameAudioIntent(state({ quizType: 'head-to-head', questionClosesAt: null }), 0, null).displayCue)
      .toBe('question')
  })

  it('maps Double Score once and silences music for presentation-visible YouTube', () => {
    expect(deriveGameAudioIntent(state(), 30, 'double-score').effect?.cue).toBe('doubleScore')
    expect(deriveGameAudioIntent(state(), 30, 'question-type').music?.cue).toBe('question')
    const youtube = state({ currentQuestion: {
      ...state().currentQuestion!, media: { type: 'youtube', videoId: 'abcdefghijk' }, mediaVisibility: 'presentation',
    } as SafeQuestion })
    expect(deriveGameAudioIntent(youtube, 20, null)).toMatchObject({ displayCue: 'silent', duckedForYouTube: true })
    const playerOnly = state({ currentQuestion: { ...youtube.currentQuestion!, mediaVisibility: 'players' } as SafeQuestion })
    expect(deriveGameAudioIntent(playerOnly, 20, null).displayCue).toBe('question')
  })

  it('suppresses every cue for the None pack', () => {
    expect(deriveGameAudioIntent(state({ soundPackId: 'none', phase: 'finished' }), 0, null))
      .toEqual({ music: null, effect: null, duckedForYouTube: false, displayCue: 'silent' })
  })
})
