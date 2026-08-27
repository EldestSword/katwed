import type { SafeGameState } from '../../types/domain'
import type { GameAudioCue } from './soundPacks'

export interface AudioTrackIntent {
  cue: GameAudioCue
  loop: boolean
  eventKey?: string
}

export interface GameAudioIntent {
  music: AudioTrackIntent | null
  effect: AudioTrackIntent | null
  duckedForYouTube: boolean
  displayCue: GameAudioCue | 'silent'
}

export function urgencyThreshold(timeLimitSeconds: number): number | null {
  if (timeLimitSeconds > 15) return 10
  if (timeLimitSeconds >= 10) return 5
  return null
}

function eventKey(state: SafeGameState, cue: GameAudioCue): string {
  return [state.sessionId, state.currentQuestion?.id ?? 'game', state.questionOpenedAt ?? 'unopened', cue].join(':')
}

function presentationHasYouTube(state: SafeGameState): boolean {
  const question = state.currentQuestion
  return Boolean(
    question?.media.type === 'youtube' &&
    (question.mediaVisibility === 'presentation' || question.mediaVisibility === 'both'),
  )
}

export function deriveGameAudioIntent(
  state: SafeGameState,
  remainingSeconds: number,
  doubleScoreIntro: boolean,
): GameAudioIntent {
  if (state.soundPackId === 'none') {
    return { music: null, effect: null, duckedForYouTube: false, displayCue: 'silent' }
  }

  if (state.phase === 'lobby') {
    return { music: { cue: 'lobby', loop: true }, effect: null, duckedForYouTube: false, displayCue: 'lobby' }
  }

  if (state.phase === 'question') {
    if (doubleScoreIntro) {
      return {
        music: null,
        effect: { cue: 'doubleScore', loop: false, eventKey: eventKey(state, 'doubleScore') },
        duckedForYouTube: false,
        displayCue: 'doubleScore',
      }
    }
    const duckedForYouTube = presentationHasYouTube(state)
    if (duckedForYouTube) {
      return { music: null, effect: null, duckedForYouTube, displayCue: 'silent' }
    }
    const threshold = state.currentQuestion && state.questionClosesAt && state.quizType !== 'head-to-head'
      ? urgencyThreshold(state.currentQuestion.timeLimitSeconds)
      : null
    const urgent = threshold !== null && remainingSeconds <= threshold
    return {
      music: { cue: urgent ? 'urgent' : 'question', loop: !urgent },
      effect: null,
      duckedForYouTube: false,
      displayCue: urgent ? 'urgent' : 'question',
    }
  }

  if (state.phase === 'locked') {
    return {
      music: null,
      effect: { cue: 'lock', loop: false, eventKey: eventKey(state, 'lock') },
      duckedForYouTube: false,
      displayCue: 'lock',
    }
  }
  if (state.phase === 'reveal') {
    return {
      music: null,
      effect: { cue: 'reveal', loop: false, eventKey: eventKey(state, 'reveal') },
      duckedForYouTube: false,
      displayCue: 'reveal',
    }
  }
  if (state.phase === 'leaderboard') {
    return {
      music: { cue: 'leaderboard', loop: false, eventKey: eventKey(state, 'leaderboard') },
      effect: null,
      duckedForYouTube: false,
      displayCue: 'leaderboard',
    }
  }
  if (state.phase === 'finished') {
    return {
      music: { cue: 'final', loop: false, eventKey: eventKey(state, 'final') },
      effect: null,
      duckedForYouTube: false,
      displayCue: 'final',
    }
  }
  return { music: null, effect: null, duckedForYouTube: false, displayCue: 'silent' }
}
