import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameAudioIntent } from './gameAudioState'
import { GameAudioEngine } from './gameAudioEngine'
import { getSoundPack } from './soundPacks'

class FakeAudio {
  src = ''
  currentTime = 0
  loop = false
  volume = 1
  preload = ''
  play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  pause = vi.fn()
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = '' })
  addEventListener = vi.fn()
}

const music = (cue: 'lobby' | 'question' | 'urgent' | 'leaderboard' | 'final', loop = true, eventKey?: string): GameAudioIntent => ({
  music: { cue, loop, eventKey }, effect: null, duckedForYouTube: false, displayCue: cue,
})
const effect = (cue: 'doubleScore' | 'lock' | 'reveal', eventKey: string): GameAudioIntent => ({
  music: null, effect: { cue, loop: false, eventKey }, duckedForYouTube: false, displayCue: cue,
})
const silent: GameAudioIntent = {
  music: null, effect: null, duckedForYouTube: true, displayCue: 'silent',
}

describe('GameAudioEngine', () => {
  beforeEach(() => sessionStorage.clear())

  it('crossfades beds without restarting the same state update', () => {
    const elements = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, vi.fn(), 0, new Set())
    const pack = getSoundPack('katwed')
    engine.transition(music('lobby'), pack)
    const first = (engine as unknown as { music: FakeAudio[] }).music[1]
    expect(first.src).toContain('lobby.mp3')
    expect(first.play).toHaveBeenCalledTimes(1)
    engine.transition(music('lobby'), pack)
    expect(first.play).toHaveBeenCalledTimes(1)
    engine.transition(music('question'), pack)
    const second = (engine as unknown as { music: FakeAudio[] }).music[0]
    expect(second.src).toContain('question.mp3')
    expect(first.pause).toHaveBeenCalled()
  })

  it('plays each transition sting only once across duplicate updates', () => {
    const elements = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, vi.fn(), 0, new Set())
    const pack = getSoundPack('katwed')
    const effectElement = (engine as unknown as { effect: FakeAudio }).effect
    engine.transition(effect('lock', 'q1-lock'), pack)
    engine.transition(effect('lock', 'q1-lock'), pack)
    expect(effectElement.play).toHaveBeenCalledTimes(1)
    engine.transition(effect('reveal', 'q1-reveal'), pack)
    expect(effectElement.play).toHaveBeenCalledTimes(2)
  })

  it('applies mute and independent music/effects volume without stale sting playback', () => {
    const elements = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, vi.fn(), 0, new Set())
    const pack = getSoundPack('katwed')
    engine.setPreferences({ muted: false, musicVolume: 0.4, effectsVolume: 0.9 })
    engine.transition(music('question'), pack)
    expect((engine as unknown as { activeMusic: { element: FakeAudio } }).activeMusic.element.volume).toBe(0.4)
    engine.transition(effect('lock', 'mute-lock'), pack)
    expect((engine as unknown as { effect: FakeAudio }).effect.volume).toBe(0.9)
    engine.setPreferences({ muted: true, musicVolume: 0.4, effectsVolume: 0.9 })
    engine.transition(effect('reveal', 'muted-reveal'), pack)
    expect((engine as unknown as { effect: FakeAudio }).effect.play).toHaveBeenCalledTimes(1)
  })

  it('contains rejected playback promises and reports a recoverable blocked state', async () => {
    const elements = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    elements[1].play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    const status = vi.fn()
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, status, 0, new Set())
    engine.transition(music('lobby'), getSoundPack('katwed'))
    await Promise.resolve()
    expect(status).toHaveBeenCalledWith('blocked')
  })

  it('clears stale autoplay failure in intentional silence and retries the later current cue', async () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const elements = [...audio]
    const status = vi.fn()
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, status, 0, new Set())
    const pack = getSoundPack('katwed')
    const lobby = audio[1]
    const effectElement = audio[2]

    lobby.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    engine.transition(music('lobby'), pack)
    await Promise.resolve()
    expect(status).toHaveBeenLastCalledWith('blocked')

    engine.transition(silent, pack)
    expect(status).toHaveBeenLastCalledWith('idle')
    engine.retryCurrent()
    expect(lobby.play).toHaveBeenCalledTimes(1)
    expect(effectElement.play).not.toHaveBeenCalled()
    expect(status).toHaveBeenLastCalledWith('idle')

    effectElement.play.mockRejectedValueOnce(new DOMException('Blocked again', 'NotAllowedError'))
    engine.transition(effect('reveal', 'youtube-question-reveal'), pack)
    await Promise.resolve()
    expect(effectElement.src).toContain('reveal.mp3')
    expect(status).toHaveBeenLastCalledWith('blocked')

    effectElement.play.mockResolvedValueOnce(undefined)
    engine.retryCurrent()
    await Promise.resolve()
    expect(effectElement.play).toHaveBeenCalledTimes(2)
    expect(status).toHaveBeenLastCalledWith('playing')
  })

  it('ignores late failures from cues that are no longer authoritative', async () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const elements = [...audio]
    let rejectLobby: ((reason: unknown) => void) | undefined
    audio[1].play.mockReturnValueOnce(new Promise((_, reject) => { rejectLobby = reject }))
    const status = vi.fn()
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, status, 0, new Set())

    engine.transition(music('lobby'), getSoundPack('katwed'))
    engine.transition(silent, getSoundPack('katwed'))
    rejectLobby?.(new DOMException('Late block', 'NotAllowedError'))
    await Promise.resolve()
    expect(status).toHaveBeenLastCalledWith('idle')
    expect(status).not.toHaveBeenCalledWith('blocked')
  })

  it('clears stale decode errors when the selected pack or phase is intentionally silent', async () => {
    const elements = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    elements[1].play.mockRejectedValueOnce(new Error('Could not decode'))
    const status = vi.fn()
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, status, 0, new Set())
    engine.transition(music('lobby'), getSoundPack('katwed'))
    await Promise.resolve()
    expect(status).toHaveBeenLastCalledWith('error')
    engine.transition(silent, getSoundPack('none'))
    expect(status).toHaveBeenLastCalledWith('idle')
  })

  it('creates no playable track for the None pack', () => {
    const elements = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const engine = new GameAudioEngine(() => elements.shift() as unknown as HTMLAudioElement, vi.fn(), 0, new Set())
    engine.transition(music('lobby'), getSoundPack('none'))
    expect(elements).toHaveLength(0)
    expect((engine as unknown as { music: FakeAudio[] }).music.every((element) => !element.src)).toBe(true)
  })
})
