import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUIZ_BACKGROUND_IDS, QUIZ_THEME_IDS } from '../../types/domain'
import {
  backgroundsForTheme,
  getQuizBackground,
  isQuizBackgroundCompatible,
  isQuizBackgroundId,
  normaliseQuizBackgroundId,
  quizBackgrounds,
} from './quizBackgrounds'

const expected = [
  ['katwed-bubbles', 'Bubbles', 'katwed'],
  ['katwed-confetti', 'Confetti', 'katwed'],
  ['katwed-ribbons', 'Ribbons', 'katwed'],
  ['midnight-aurora', 'Aurora', 'midnight'],
  ['midnight-glow', 'Glow', 'midnight'],
  ['midnight-stars', 'Stars', 'midnight'],
  ['sunset-horizon', 'Horizon', 'sunset'],
  ['sunset-lights', 'Lights', 'sunset'],
  ['sunset-ribbons', 'Ribbons', 'sunset'],
  ['arcade-circuit', 'Circuit', 'arcade'],
  ['arcade-grid', 'Grid', 'arcade'],
  ['arcade-neon', 'Neon', 'arcade'],
  ['mint-depth', 'Depth', 'mint'],
  ['mint-shapes', 'Shapes', 'mint'],
  ['mint-waves', 'Waves', 'mint'],
  ['paper-collage', 'Collage', 'paper'],
  ['paper-geometry', 'Geometry', 'paper'],
  ['paper-notebook', 'Notebook', 'paper'],
] as const

describe('quiz background registry', () => {
  it('defines the exact unique 18-item catalogue and static asset paths', () => {
    expect(QUIZ_BACKGROUND_IDS).toHaveLength(18)
    expect(new Set(QUIZ_BACKGROUND_IDS).size).toBe(18)
    expect(quizBackgrounds.map(({ id, name, themeId }) => [id, name, themeId])).toEqual(expected)
    expect(quizBackgrounds.map(({ assetPath }) => assetPath)).toEqual(
      QUIZ_BACKGROUND_IDS.map((id) => `/backgrounds/${id}.webp`),
    )
    expect(readdirSync(resolve('public/backgrounds')).filter((filename) => filename.endsWith('.webp')).sort()).toEqual(
      QUIZ_BACKGROUND_IDS.map((id) => `${id}.webp`).sort(),
    )
  })

  it('assigns exactly three existing assets to every valid theme', () => {
    for (const themeId of QUIZ_THEME_IDS) {
      const backgrounds = backgroundsForTheme(themeId)
      expect(backgrounds, themeId).toHaveLength(3)
      expect(backgrounds.every((background) => background.themeId === themeId)).toBe(true)
      for (const background of backgrounds) {
        expect(existsSync(resolve('public', background.assetPath.slice(1))), background.assetPath).toBe(true)
      }
    }
  })

  it('recognises only registered IDs and resolves their definitions', () => {
    for (const id of QUIZ_BACKGROUND_IDS) {
      expect(isQuizBackgroundId(id)).toBe(true)
      expect(getQuizBackground(id)?.id).toBe(id)
    }
    for (const value of ['arcade', 'arcade-grid.png', 'ARCADE-GRID', '', null, undefined, 42]) {
      expect(isQuizBackgroundId(value)).toBe(false)
      expect(getQuizBackground(value)).toBeNull()
    }
  })

  it('enforces theme compatibility and defensively normalises malformed combinations', () => {
    expect(isQuizBackgroundCompatible('arcade-grid', 'arcade')).toBe(true)
    expect(isQuizBackgroundCompatible('arcade-grid', 'katwed')).toBe(false)
    expect(normaliseQuizBackgroundId('paper-collage', 'paper')).toBe('paper-collage')
    expect(normaliseQuizBackgroundId('paper-collage', 'sunset')).toBeNull()
    expect(normaliseQuizBackgroundId('future-background', 'paper')).toBeNull()
    expect(normaliseQuizBackgroundId(null, 'paper')).toBeNull()
  })
})
