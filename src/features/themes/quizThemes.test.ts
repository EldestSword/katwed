import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUIZ_THEME_IDS } from '../../types/domain'
import {
  DEFAULT_QUIZ_THEME_ID,
  isQuizThemeId,
  normaliseQuizThemeId,
  quizThemes,
} from './quizThemes'

function relativeLuminance(hex: string): number {
  const value = hex.length === 4
    ? hex.slice(1).split('').map((channel) => channel + channel).join('')
    : hex.slice(1)
  const channels = value.match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? []
  const [red, green, blue] = channels.map((channel) => channel <= .04045
    ? channel / 12.92
    : ((channel + .055) / 1.055) ** 2.4)
  return (.2126 * red) + (.7152 * green) + (.0722 * blue)
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (lighter + .05) / (darker + .05)
}

describe('quiz theme registry', () => {
  it('defines exactly the six curated IDs and human names', () => {
    expect(QUIZ_THEME_IDS).toEqual(['katwed', 'midnight', 'sunset', 'arcade', 'mint', 'paper'])
    expect(quizThemes.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'katwed', name: 'Katwed!' },
      { id: 'midnight', name: 'Midnight' },
      { id: 'sunset', name: 'Sunset' },
      { id: 'arcade', name: 'Arcade' },
      { id: 'mint', name: 'Mint' },
      { id: 'paper', name: 'Paper' },
    ])
    expect(DEFAULT_QUIZ_THEME_ID).toBe('katwed')
  })

  it('retains valid IDs and defensively normalises malformed values', () => {
    for (const id of QUIZ_THEME_IDS) {
      expect(isQuizThemeId(id)).toBe(true)
      expect(normaliseQuizThemeId(id)).toBe(id)
    }
    for (const value of ['unknown', 'ARCADE', '', null, undefined, 42]) {
      expect(isQuizThemeId(value)).toBe(false)
      expect(normaliseQuizThemeId(value)).toBe('katwed')
    }
  })

  it('supplies a scoped semantic palette for every registered theme', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8')
    for (const id of QUIZ_THEME_IDS) {
      const start = css.indexOf(`[data-quiz-theme="${id}"]`)
      const end = css.indexOf('\n}', start)
      const scope = css.slice(start, end)
      expect(start, id).toBeGreaterThanOrEqual(0)
      for (const token of ['--quiz-bg', '--quiz-surface', '--quiz-text', '--quiz-border', '--quiz-accent', '--quiz-stage-bg', '--quiz-shadow']) {
        expect(scope, `${id} ${token}`).toContain(token)
      }
      const surface = scope.match(/--quiz-surface:\s*(#[0-9a-f]{3,6})/i)?.[1]
      const text = scope.match(/--quiz-text:\s*(#[0-9a-f]{3,6})/i)?.[1]
      expect(surface, `${id} surface colour`).toBeDefined()
      expect(text, `${id} text colour`).toBeDefined()
      expect(contrastRatio(surface!, text!), `${id} answer-card contrast`).toBeGreaterThanOrEqual(7)
    }
    const revealCardStart = css.indexOf('.reveal-answer-card {')
    const revealCardEnd = css.indexOf('\n}', revealCardStart)
    const revealCard = css.slice(revealCardStart, revealCardEnd)
    expect(revealCard).toContain('background: var(--quiz-surface)')
    expect(revealCard).toContain('color: var(--quiz-text)')
    expect(revealCard).toContain('border: 2px solid var(--quiz-border)')
    expect(revealCard).toContain('box-shadow: var(--quiz-shadow)')
    expect(revealCard).not.toContain('var(--quiz-stage-surface)')
    expect(css).toContain('.presentation-qr-panel')
    expect(css).toContain('background: #fff;')
  })
})
