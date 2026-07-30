import { describe, expect, it } from 'vitest'
import { normaliseYouTubeVideoId } from './youtube'

describe('normaliseYouTubeVideoId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=20', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('normalises %s', (input, expected) => {
    expect(normaliseYouTubeVideoId(input)).toBe(expected)
  })

  it('rejects malformed and non-YouTube URLs', () => {
    expect(normaliseYouTubeVideoId('https://example.com/dQw4w9WgXcQ')).toBeNull()
    expect(normaliseYouTubeVideoId('<iframe>unsafe</iframe>')).toBeNull()
  })
})
