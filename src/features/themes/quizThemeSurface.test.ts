import { describe, expect, it } from 'vitest'
import { quizThemeSurfaceProps } from './quizThemeSurface'

describe('quizThemeSurfaceProps', () => {
  it('maps a registered theme to semantic CSS variables and its approved fonts', () => {
    const props = quizThemeSurfaceProps('midnight')
    expect(props['data-quiz-theme']).toBe('midnight')
    expect(props.style).toMatchObject({
      '--quiz-bg': '#071326',
      '--quiz-accent': '#4fb7ff',
      '--quiz-stage-bg': 'radial-gradient(circle at top right, #322264, #071326 64%)',
      '--quiz-font-display': expect.stringContaining('Bricolage Grotesque'),
      '--quiz-font-ui': expect.stringContaining('system-ui'),
    })
  })

  it('falls back to Katwed and never forwards unregistered values into CSS', () => {
    const injected = 'red; background-image: url(https://example.invalid/tracker)'
    const props = quizThemeSurfaceProps(injected, injected)
    expect(props['data-quiz-theme']).toBe('katwed')
    expect(props).not.toHaveProperty('data-quiz-background')
    expect(JSON.stringify(props)).not.toContain('example.invalid')
  })

  it('includes only a compatible registered background asset', () => {
    const valid = quizThemeSurfaceProps('paper', 'paper-notebook')
    expect(valid['data-quiz-background']).toBe('paper-notebook')
    expect(valid.style).toMatchObject({ '--quiz-background-image': 'url("/backgrounds/paper-notebook.webp")' })
    const incompatible = quizThemeSurfaceProps('paper', 'arcade-grid')
    expect(incompatible).not.toHaveProperty('data-quiz-background')
    expect(incompatible.style).not.toHaveProperty('--quiz-background-image')
  })
})
