export interface AudioPreferences {
  muted: boolean
  musicVolume: number
  effectsVolume: number
}

export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = {
  muted: false,
  musicVolume: 0.7,
  effectsVolume: 0.8,
}

export const AUDIO_PREFERENCES_STORAGE_KEY = 'katwed.audio.preferences.v1'
export const AUDIO_PREFERENCES_EVENT = 'katwed:audio-preferences-changed'

function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

export function normaliseAudioPreferences(value: unknown): AudioPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<AudioPreferences> : {}
  return {
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : DEFAULT_AUDIO_PREFERENCES.muted,
    musicVolume: volume(candidate.musicVolume, DEFAULT_AUDIO_PREFERENCES.musicVolume),
    effectsVolume: volume(candidate.effectsVolume, DEFAULT_AUDIO_PREFERENCES.effectsVolume),
  }
}

export function readAudioPreferences(storage: Pick<Storage, 'getItem'> = window.localStorage): AudioPreferences {
  try {
    const stored = storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)
    return stored ? normaliseAudioPreferences(JSON.parse(stored) as unknown) : { ...DEFAULT_AUDIO_PREFERENCES }
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES }
  }
}

export function writeAudioPreferences(
  preferences: AudioPreferences,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): AudioPreferences {
  const normalised = normaliseAudioPreferences(preferences)
  try {
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(normalised))
    window.dispatchEvent(new CustomEvent(AUDIO_PREFERENCES_EVENT, { detail: normalised }))
  } catch {
    // Audio preferences are an enhancement; storage failure must not affect the game.
  }
  return normalised
}
