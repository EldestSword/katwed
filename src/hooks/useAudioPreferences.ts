import { useCallback, useEffect, useState } from 'react'
import {
  AUDIO_PREFERENCES_EVENT,
  AUDIO_PREFERENCES_STORAGE_KEY,
  readAudioPreferences,
  writeAudioPreferences,
  type AudioPreferences,
} from '../features/audio/audioPreferences'

export function useAudioPreferences(): [AudioPreferences, (preferences: AudioPreferences) => void] {
  const [preferences, setPreferences] = useState(readAudioPreferences)

  useEffect(() => {
    const refresh = () => setPreferences(readAudioPreferences())
    const storage = (event: StorageEvent) => {
      if (event.key === AUDIO_PREFERENCES_STORAGE_KEY) refresh()
    }
    window.addEventListener('storage', storage)
    window.addEventListener(AUDIO_PREFERENCES_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', storage)
      window.removeEventListener(AUDIO_PREFERENCES_EVENT, refresh)
    }
  }, [])

  const update = useCallback((next: AudioPreferences) => {
    setPreferences(writeAudioPreferences(next))
  }, [])

  return [preferences, update]
}
