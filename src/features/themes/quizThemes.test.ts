import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUIZ_THEME_IDS } from '../../types/domain'
import { getThemeCategory } from './themeCategories'
import { getThemeFont } from './themeFonts'
import { validateQuizThemeDefinition } from './themeValidation'
import { VISUAL_THEME_BATCH_1_THEME_IDS } from '../../generated/visualThemeBatch1'
import { VISUAL_THEME_BATCH_2_THEME_IDS } from '../../generated/visualThemeBatch2'
import { VISUAL_THEME_BATCH_3_THEME_IDS } from '../../generated/visualThemeBatch3'
import {
  DEFAULT_QUIZ_THEME_ID,
  getQuizTheme,
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
  it('defines exactly the 51 stable themes, preserving the original six IDs', () => {
    expect(QUIZ_THEME_IDS).toEqual([
      'katwed', 'midnight', 'sunset', 'arcade', 'mint', 'paper',
      ...VISUAL_THEME_BATCH_1_THEME_IDS,
      ...VISUAL_THEME_BATCH_2_THEME_IDS,
      ...VISUAL_THEME_BATCH_3_THEME_IDS,
    ])
    expect(quizThemes.map(({ id, name }) => ({ id, name })).slice(0, 6)).toEqual([
      { id: 'katwed', name: 'Katwed!' },
      { id: 'midnight', name: 'Midnight' },
      { id: 'sunset', name: 'Sunset' },
      { id: 'arcade', name: 'Arcade' },
      { id: 'mint', name: 'Mint' },
      { id: 'paper', name: 'Paper' },
    ])
    expect(quizThemes).toHaveLength(51)
    expect(quizThemes.find((theme) => theme.id === 'hard-rock')?.name).toBe('Hard Rock')
    expect(quizThemes.find((theme) => theme.id === 'retro-game-show')?.name).toBe('Retro Game Show')
    expect(quizThemes.find((theme) => theme.id === '90s-rave')?.name).toBe('90s Rave')
    expect(quizThemes.filter((theme) => theme.category === 'places-culture').map((theme) => theme.id)).toEqual([
      'greek', 'french', 'italian',
    ])
    expect(quizThemes.filter((theme) => theme.category === 'wildcards').map((theme) => theme.id)).toEqual([
      'comic-book', 'vhs', 'newspaper', 'laboratory', 'jungle', 'deep-ocean',
    ])
    expect(new Set(quizThemes.map((theme) => theme.id)).size).toBe(quizThemes.length)
    expect(DEFAULT_QUIZ_THEME_ID).toBe('katwed')
  })

  it('retains valid IDs and defensively falls back for malformed values', () => {
    for (const id of QUIZ_THEME_IDS) {
      expect(isQuizThemeId(id)).toBe(true)
      expect(normaliseQuizThemeId(id)).toBe(id)
      expect(getQuizTheme(id).id).toBe(id)
    }
    for (const value of ['unknown', 'ARCADE', '', null, undefined, 42]) {
      expect(isQuizThemeId(value)).toBe(false)
      expect(normaliseQuizThemeId(value)).toBe('katwed')
      expect(getQuizTheme(value).id).toBe('katwed')
    }
  })

  it('provides complete discoverable theme metadata and approved fonts', () => {
    for (const theme of quizThemes) {
      expect(getThemeCategory(theme.category), `${theme.id} category`).not.toBeNull()
      expect(theme.description.length).toBeGreaterThan(10)
      expect(theme.keywords.length).toBeGreaterThanOrEqual(3)
      expect(theme.swatches).toHaveLength(3)
      expect(theme.preview?.kind).toBe(QUIZ_THEME_IDS.indexOf(theme.id) >= 6 ? 'thumbnail' : 'tokens')
      expect(theme.preview?.label).toMatch(/preview$/)
      expect(getThemeFont(theme.typography.displayFontId)?.roleSuitability.display).toBe(true)
      expect(getThemeFont(theme.typography.uiFontId)?.roleSuitability.ui).toBe(true)
    }
  })

  it('supplies accessible semantic colour pairs for every theme', () => {
    for (const theme of quizThemes) {
      expect(validateQuizThemeDefinition(theme), theme.id).toEqual([])
      const { tokens } = theme
      expect(contrastRatio(tokens.surface, tokens.text), `${theme.id} surface text`).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(tokens.surface, tokens.textMuted), `${theme.id} muted text`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens.button.background, tokens.button.text), `${theme.id} button`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens.feature.background, tokens.feature.text), `${theme.id} feature`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens.stage.playerBarBackground, tokens.stage.playerBarText), `${theme.id} player bar`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens.stage.playerBarBackground, tokens.stage.playerBarMuted), `${theme.id} player bar muted`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps theme values out of duplicated per-ID CSS selectors', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8')
    for (const id of QUIZ_THEME_IDS) expect(css).not.toContain(`[data-quiz-theme="${id}"] {`)
    for (const token of ['--quiz-bg', '--quiz-surface', '--quiz-text', '--quiz-border', '--quiz-accent', '--quiz-stage-bg', '--quiz-shadow']) {
      expect(readFileSync(resolve('src/features/themes/quizThemeSurface.ts'), 'utf8')).toContain(`'${token}'`)
    }
    const revealCardStart = css.indexOf('.reveal-answer-card {')
    const revealCardEnd = css.indexOf('\n}', revealCardStart)
    const revealCard = css.slice(revealCardStart, revealCardEnd)
    expect(revealCard).toContain('background: var(--quiz-surface)')
    expect(revealCard).toContain('color: var(--quiz-text)')
    expect(revealCard).toContain('border: 2px solid var(--quiz-border)')
    expect(revealCard).toContain('box-shadow: var(--quiz-shadow)')
    expect(revealCard).not.toContain('var(--quiz-stage-surface)')
  })
})
