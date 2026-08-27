import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_PREFERENCES_STORAGE_KEY, readAudioPreferences, writeAudioPreferences } from './audioPreferences'

describe('host audio preferences', () => {
  beforeEach(() => localStorage.clear())

  it('uses restrained defaults and persists mute and category volumes locally', () => {
    expect(readAudioPreferences()).toEqual({ muted: false, musicVolume: 0.7, effectsVolume: 0.8 })
    writeAudioPreferences({ muted: true, musicVolume: 0.35, effectsVolume: 0.9 })
    expect(readAudioPreferences()).toEqual({ muted: true, musicVolume: 0.35, effectsVolume: 0.9 })
    expect(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)).toContain('"muted":true')
  })

  it('clamps malformed stored values without affecting gameplay', () => {
    localStorage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify({
      muted: 'yes', musicVolume: 4, effectsVolume: -2,
    }))
    expect(readAudioPreferences()).toEqual({ muted: false, musicVolume: 1, effectsVolume: 0 })
  })
})
