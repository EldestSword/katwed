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
      for (const token of ['--quiz-bg', '--quiz-surface', '--quiz-text', '--quiz-accent', '--quiz-stage-bg']) {
        expect(scope, `${id} ${token}`).toContain(token)
      }
    }
    expect(css).toContain('.presentation-qr-panel')
    expect(css).toContain('background: #fff;')
  })
})
