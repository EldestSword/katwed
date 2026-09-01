import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function stylesheet(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src', 'styles', name), 'utf8')
}

describe('live question layout CSS', () => {
  it('keeps every question-media image path contained rather than covered', () => {
    const css = [stylesheet('global.css'), stylesheet('presentation.css'), stylesheet('player.css'), stylesheet('backstage.css')].join('\n')
    const questionMediaRules = css.match(/[^{}]*question-media[^{}]*\{[^{}]*\}/g) ?? []
    const imageRules = questionMediaRules.filter((rule) => /\bimg\b/.test(rule))

    expect(imageRules.length).toBeGreaterThan(0)
    expect(imageRules.some((rule) => /object-fit:\s*contain/.test(rule))).toBe(true)
    expect(imageRules.every((rule) => !/object-fit:\s*cover/.test(rule))).toBe(true)
    expect(stylesheet('backstage.css')).toContain('max-height: none')
  })

  it('centres odd final cards at the same two-subcolumn width', () => {
    expect(stylesheet('presentation.css')).toContain('grid-column: 2 / span 2')
    expect(stylesheet('player.css')).toContain('grid-column: 2 / span 2')
    expect(stylesheet('backstage.css')).toContain('grid-column: 2 / span 2')
    expect(stylesheet('presentation.css')).not.toContain('data-option-count="3"] > :last-child { grid-column: 1 / -1;')
    expect(stylesheet('player.css')).not.toContain('data-option-count="3"] > :last-child { grid-column: 1 / -1;')
  })

  it('centres prompts and forbids aggressive answer-word breaking', () => {
    expect(stylesheet('player.css')).toContain('.player-question__prompt { text-align: center; }')
    expect(stylesheet('presentation.css')).toContain('.presentation-question__copy { align-self: center; text-align: center; }')
    expect(stylesheet('primitives.css')).toContain('word-break: normal')
    expect(stylesheet('primitives.css')).not.toMatch(/\.answer-tile__label\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  })
})
