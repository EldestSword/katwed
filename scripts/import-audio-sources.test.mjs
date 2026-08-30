import { describe, expect, it } from 'vitest'
import {
  classifyAudioRole,
  describeAudioEntry,
  packNameCandidate,
  parseAudioPackAliases,
  slugifyAudioPack,
} from './import-audio-sources.mjs'

describe('audio source import classification', () => {
  it('keeps distinct packs separate inside a combined ZIP', () => {
    expect(describeAudioEntry('Bluegrass - Lobby_1.mp3')).toMatchObject({
      packId: 'bluegrass', name: 'Bluegrass', role: 'lobby',
    })
    expect(describeAudioEntry('Synthwave Reveal.mp3')).toMatchObject({
      packId: 'synthwave', name: 'Synthwave', role: 'reveal',
    })
  })

  it('recognises the supplier spelling variants present in this batch', () => {
    expect(classifyAudioRole('Rocksteady - Leaderbaord.mp3')).toBe('leaderboard')
    expect(classifyAudioRole('Pirate - FInal Results.mp3')).toBe('final')
    expect(classifyAudioRole('Medieval - URgency.mp3')).toBe('urgent')
  })

  it('supports a reviewed alias where one archive uses two names for the same pack', () => {
    const aliases = parseAudioPackAliases('Spy=Spy Noir')
    expect(describeAudioEntry('Spy - Lobby.mp3', aliases)).toMatchObject({
      packId: 'spy-noir', name: 'Spy Noir', role: 'lobby',
    })
    expect(describeAudioEntry('Spy Noir Double Score.mp3', aliases)).toMatchObject({
      packId: 'spy-noir', name: 'Spy Noir', role: 'double-score',
    })
  })

  it('derives conservative stable slugs without changing the source display name', () => {
    expect(packNameCandidate('90s Rave - Question_1')).toBe('90s Rave')
    expect(slugifyAudioPack('90s Rave')).toBe('90s-rave')
    expect(slugifyAudioPack('Hip-Hop')).toBe('hip-hop')
  })
})
