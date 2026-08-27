import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SafeGameState } from '../types/domain'
import { useCountdown } from './useCountdown'
import { useQuestionPrelude } from './useQuestionPrelude'
import { useAudioPreferences } from './useAudioPreferences'
import { GameAudioEngine, type AudioEngineStatus } from '../features/audio/gameAudioEngine'
import { deriveGameAudioIntent } from '../features/audio/gameAudioState'
import { getSoundPack } from '../features/audio/soundPacks'

export interface PresentationAudioState {
  cue: string
  duckedForYouTube: boolean
  muted: boolean
  packId: string
  status: AudioEngineStatus | 'muted' | 'off'
  enable(): void
}

export function usePresentationAudio(state: SafeGameState): PresentationAudioState {
  const remaining = useCountdown(state.questionClosesAt, Number.MAX_SAFE_INTEGER)
  const configuredPrelude = state.questionPreludeKind ?? (state.currentQuestion?.doubleScore ? 'double-score' : null)
  const activePrelude = useQuestionPrelude(configuredPrelude, state.questionOpenedAt)
  const [preferences] = useAudioPreferences()
  const [engineStatus, setEngineStatus] = useState<AudioEngineStatus>('idle')
  const [engine] = useState(() => new GameAudioEngine(undefined, setEngineStatus))
  const pack = getSoundPack(state.soundPackId)
  const intent = useMemo(
    () => deriveGameAudioIntent(state, remaining, activePrelude),
    [activePrelude, remaining, state],
  )
  const preloadedPack = useRef<string | null>(null)
  const pendingStop = useRef<number | null>(null)

  useEffect(() => {
    engine.setPreferences(preferences)
    engine.transition(intent, pack)
  }, [engine, intent, pack, preferences])

  useEffect(() => {
    if (pendingStop.current !== null) {
      window.clearTimeout(pendingStop.current)
      pendingStop.current = null
    }
    return () => {
      pendingStop.current = window.setTimeout(() => {
        engine.stopAll()
        pendingStop.current = null
      }, 0)
    }
  }, [engine])

  useEffect(() => {
    if (engineStatus !== 'playing' || !pack.assets || preloadedPack.current === pack.id) return
    preloadedPack.current = pack.id
    Object.values(pack.assets).forEach((asset) => {
      void fetch(asset, { cache: 'force-cache' }).catch(() => undefined)
    })
  }, [engineStatus, pack])

  const enable = useCallback(() => engine.retryCurrent(), [engine])
  const status = pack.id === 'none' ? 'off' : preferences.muted ? 'muted' : engineStatus

  return {
    cue: intent.displayCue,
    duckedForYouTube: intent.duckedForYouTube,
    muted: preferences.muted,
    packId: pack.id,
    status,
    enable,
  }
}
