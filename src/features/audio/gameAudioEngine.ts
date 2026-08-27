import type { AudioPreferences } from './audioPreferences'
import type { AudioTrackIntent, GameAudioIntent } from './gameAudioState'
import type { GameAudioCue, SoundPackDefinition } from './soundPacks'

export type AudioEngineStatus = 'idle' | 'playing' | 'blocked' | 'error'
type AudioFactory = () => HTMLAudioElement
const playedAudioEvents = new Set<string>()
const PLAYED_EVENT_PREFIX = 'katwed.audio.played.'

interface ActiveTrack {
  element: HTMLAudioElement
  cue: GameAudioCue
  eventKey?: string
  loop: boolean
  started: boolean
}

export class GameAudioEngine {
  private readonly music: [HTMLAudioElement, HTMLAudioElement]
  private readonly effect: HTMLAudioElement
  private activeMusic: ActiveTrack | null = null
  private activeMusicIndex = 0
  private activeEffectKey: string | null = null
  private preferences: AudioPreferences = { muted: false, musicVolume: 0.7, effectsVolume: 0.8 }

  constructor(
    createAudio: AudioFactory = () => new Audio(),
    private readonly statusChanged: (status: AudioEngineStatus) => void = () => undefined,
    private readonly fadeDuration = 350,
    private readonly playedEvents: Set<string> = playedAudioEvents,
  ) {
    this.music = [createAudio(), createAudio()]
    this.effect = createAudio()
    ;[...this.music, this.effect].forEach((element) => {
      element.preload = 'auto'
      element.addEventListener?.('error', () => this.statusChanged('error'))
    })
  }

  setPreferences(preferences: AudioPreferences): void {
    const wasMuted = this.preferences.muted
    this.preferences = preferences
    const musicVolume = preferences.muted ? 0 : preferences.musicVolume
    this.music.forEach((element) => { element.volume = musicVolume })
    this.effect.volume = preferences.muted ? 0 : preferences.effectsVolume
    if (wasMuted && !preferences.muted && this.activeMusic?.loop && !this.activeMusic.started) {
      this.activeMusic.started = true
      this.safePlay(this.activeMusic.element)
    }
  }

  transition(intent: GameAudioIntent, pack: SoundPackDefinition): void {
    this.stopOrChangeMusic(intent.music, pack)
    this.playEffect(intent.effect, pack)
  }

  retryCurrent(): void {
    if (this.preferences.muted) return
    if (this.activeMusic) {
      this.activeMusic.element.volume = this.preferences.musicVolume
      this.safePlay(this.activeMusic.element)
      return
    }
    if (this.activeEffectKey && this.effect.src) {
      this.effect.volume = this.preferences.effectsVolume
      this.safePlay(this.effect)
    }
  }

  stopAll(): void {
    this.music.forEach((element) => {
      element.pause()
      element.removeAttribute('src')
    })
    this.effect.pause()
    this.effect.removeAttribute('src')
    this.activeMusic = null
    this.activeEffectKey = null
    this.statusChanged('idle')
  }

  private stopOrChangeMusic(track: AudioTrackIntent | null, pack: SoundPackDefinition): void {
    if (!track || !pack.assets) {
      if (this.activeMusic) this.fadeOut(this.activeMusic.element, true)
      this.activeMusic = null
      return
    }
    if (
      this.activeMusic?.cue === track.cue &&
      this.activeMusic.loop === track.loop &&
      this.activeMusic.eventKey === track.eventKey
    ) return
    if (track.eventKey && this.hasPlayed(track.eventKey)) {
      if (this.activeMusic && this.activeMusic.eventKey !== track.eventKey) this.fadeOut(this.activeMusic.element, true)
      this.activeMusic = null
      return
    }

    const previous = this.activeMusic?.element ?? null
    this.activeMusicIndex = this.activeMusicIndex === 0 ? 1 : 0
    const element = this.music[this.activeMusicIndex]
    element.pause()
    element.src = pack.assets[track.cue]
    element.currentTime = 0
    element.loop = track.loop
    element.volume = 0
    this.activeMusic = { element, ...track, started: false }
    if (track.eventKey) this.markPlayed(track.eventKey)
    if (this.preferences.muted) return
    this.activeMusic.started = true
    this.safePlay(element)
    this.fadeTo(element, this.preferences.musicVolume)
    if (previous) this.fadeOut(previous, true)
  }

  private playEffect(track: AudioTrackIntent | null, pack: SoundPackDefinition): void {
    if (!track?.eventKey || !pack.assets) {
      if (this.activeEffectKey) this.fadeOut(this.effect, true)
      this.activeEffectKey = null
      return
    }
    if (this.activeEffectKey === track.eventKey || this.hasPlayed(track.eventKey)) return
    this.markPlayed(track.eventKey)
    this.activeEffectKey = track.eventKey
    this.effect.pause()
    this.effect.src = pack.assets[track.cue]
    this.effect.currentTime = 0
    this.effect.loop = false
    this.effect.volume = this.preferences.muted ? 0 : this.preferences.effectsVolume
    if (!this.preferences.muted) this.safePlay(this.effect)
  }

  private safePlay(element: HTMLAudioElement): void {
    try {
      const result = element.play()
      void result.then(
        () => this.statusChanged('playing'),
        (reason: unknown) => this.statusChanged(
          reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'blocked' : 'error',
        ),
      )
    } catch {
      this.statusChanged('error')
    }
  }

  private hasPlayed(eventKey: string): boolean {
    if (this.playedEvents.has(eventKey)) return true
    try {
      return window.sessionStorage.getItem(`${PLAYED_EVENT_PREFIX}${eventKey}`) === '1'
    } catch {
      return false
    }
  }

  private markPlayed(eventKey: string): void {
    this.playedEvents.add(eventKey)
    try {
      window.sessionStorage.setItem(`${PLAYED_EVENT_PREFIX}${eventKey}`, '1')
    } catch {
      // A private or restricted browser context may not expose session storage.
    }
  }

  private fadeTo(element: HTMLAudioElement, target: number): void {
    if (this.fadeDuration <= 0) {
      element.volume = target
      return
    }
    const start = element.volume
    const began = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - began) / this.fadeDuration))
      element.volume = start + ((target - start) * progress)
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  private fadeOut(element: HTMLAudioElement, reset: boolean): void {
    if (this.fadeDuration <= 0) {
      element.volume = 0
      element.pause()
      if (reset) element.currentTime = 0
      return
    }
    const start = element.volume
    const began = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - began) / this.fadeDuration))
      element.volume = Math.max(0, start * (1 - progress))
      if (progress < 1) requestAnimationFrame(step)
      else {
        element.pause()
        if (reset) element.currentTime = 0
      }
    }
    requestAnimationFrame(step)
  }
}
