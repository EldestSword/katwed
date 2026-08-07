import { QUIZ_THEME_IDS, type QuizThemeId } from '../../types/domain'

export interface QuizThemeDefinition {
  id: QuizThemeId
  name: string
  description: string
  swatches: readonly [string, string, string]
}

export const DEFAULT_QUIZ_THEME_ID: QuizThemeId = 'katwed'

export const quizThemes: readonly QuizThemeDefinition[] = [
  {
    id: 'katwed',
    name: 'Katwed!',
    description: 'Warm, playful Katwed purple with bright cyan energy.',
    swatches: ['#29144e', '#fffaf1', '#72d9ef'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy with electric blue and violet highlights.',
    swatches: ['#071326', '#4fb7ff', '#a78bfa'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Dark plum with coral and warm golden accents.',
    swatches: ['#26102d', '#ff8066', '#ffc857'],
  },
  {
    id: 'arcade',
    name: 'Arcade',
    description: 'Near-black with crisp cyan, magenta and restrained lime.',
    swatches: ['#080b12', '#22d3ee', '#f472d0'],
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Deep teal with fresh mint and a warm neutral lift.',
    swatches: ['#073a38', '#72f2c2', '#ffe6b8'],
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm paper, dark ink and restrained red and blue.',
    swatches: ['#f6efdf', '#a83c35', '#2d5d86'],
  },
]

const themeIds = new Set<string>(QUIZ_THEME_IDS)

export function isQuizThemeId(value: unknown): value is QuizThemeId {
  return typeof value === 'string' && themeIds.has(value)
}

export function normaliseQuizThemeId(value: unknown): QuizThemeId {
  return isQuizThemeId(value) ? value : DEFAULT_QUIZ_THEME_ID
}
