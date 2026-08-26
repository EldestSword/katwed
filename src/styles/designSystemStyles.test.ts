import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('design system CSS foundations', () => {
  it('defines semantic type, space, radius, depth, focus and motion tokens', () => {
    const css = readFileSync(resolve('src/styles/tokens.css'), 'utf8')
    for (const token of ['--font-display', '--font-ui', '--space-4', '--radius-md', '--shadow-raised', '--focus-ring', '--motion-base', '--stage-surface']) {
      expect(css).toContain(token)
    }
  })

  it('self-hosts the display font and makes reduced motion structural', () => {
    const typography = readFileSync(resolve('src/styles/typography.css'), 'utf8')
    const css = readFileSync(resolve('src/styles/primitives.css'), 'utf8')
    expect(typography).toContain('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2')
    expect(typography).toContain('font-display: swap')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: .01ms !important')
    expect(css).toContain('scroll-behavior: auto !important')
    expect(`${typography}\n${css}`).not.toMatch(/https?:\/\//)
  })

  it('keeps live stage and player layouts split with reduced-motion fallbacks', () => {
    const shared = readFileSync(resolve('src/styles/live-game.css'), 'utf8')
    const presentation = readFileSync(resolve('src/styles/presentation.css'), 'utf8')
    const player = readFileSync(resolve('src/styles/player.css'), 'utf8')
    const backstage = readFileSync(resolve('src/styles/backstage.css'), 'utf8')
    expect(shared).toContain('.submission-status')
    expect(presentation).toContain('[data-composition="media-and-answers"]')
    expect(presentation).toContain('.presentation-stage--compact')
    expect(presentation).toContain('.presentation-stage--compact .leaderboard--presentation .leaderboard__name')
    expect(player).toContain('.player-waiting')
    expect(player).toContain('.answer-grid[data-option-count="4"]')
    expect(backstage).toContain('.editor-preview__media .question-media img')
    expect(backstage).toContain('.preview-frame--player .editor-answer-preview')
    expect(`${shared}\n${presentation}\n${player}`).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
