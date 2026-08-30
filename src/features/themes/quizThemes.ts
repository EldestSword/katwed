import { QUIZ_THEME_IDS, type QuizThemeId } from '../../types/domain'
import { visualThemeBatch1Themes } from '../../generated/visualThemeBatch1'
import { visualThemeBatch2Themes } from '../../generated/visualThemeBatch2'
import { visualThemeBatch3Themes } from '../../generated/visualThemeBatch3'
import type { ThemeCategoryId } from './themeCategories'
import type { ThemeFontId } from './themeFonts'

export interface QuizThemeTokens {
  canvas: string
  surface: string
  surfaceSecondary: string
  text: string
  textMuted: string
  border: string
  accent: string
  accentSecondary: string
  accentText: string
  focus: string
  shadow: string
  feature: { background: string; text: string }
  button: { background: string; text: string; shadow: string }
  answer: { surface: string; selected: string }
  leaderboard: { surface: string; highlight: string }
  progress: string
  stage: {
    background: string
    playerBarBackground: string
    playerBarText: string
    playerBarMuted: string
    text: string
    textMuted: string
    surface: string
    border: string
    roomAccent: string
    eyebrow: string
  }
}

export interface QuizThemeDefinition {
  id: QuizThemeId
  name: string
  description: string
  category: ThemeCategoryId
  keywords: readonly string[]
  swatches: readonly [string, string, string]
  typography: { displayFontId: ThemeFontId; uiFontId: ThemeFontId }
  preview?:
    | { kind: 'tokens'; label: string }
    | { kind: 'thumbnail'; label: string; thumbnailPath: string }
  tokens: QuizThemeTokens
}

export const DEFAULT_QUIZ_THEME_ID: QuizThemeId = 'katwed'

const currentTypography = {
  displayFontId: 'bricolage-grotesque',
  uiFontId: 'system-ui',
} as const

export const quizThemes: readonly QuizThemeDefinition[] = [
  {
    id: 'katwed', name: 'Katwed!',
    description: 'Warm, playful Katwed purple with bright cyan energy.',
    category: 'katwed-originals', keywords: ['signature', 'purple', 'playful', 'bright'],
    swatches: ['#29144e', '#fffaf1', '#72d9ef'], typography: currentTypography,
    preview: { kind: 'tokens', label: 'Purple, cream and cyan theme preview' },
    tokens: {
      canvas: '#f7f1ff', surface: '#fff', surfaceSecondary: '#f0e7ff', text: '#201638',
      textMuted: '#6e647c', border: '#d7dbea', accent: '#402274', accentSecondary: '#72d9ef',
      accentText: '#fff', focus: '#72d9ef', shadow: '0 18px 45px rgba(45, 23, 80, .13)',
      feature: { background: '#ffc94d', text: '#29144e' },
      button: { background: '#402274', text: '#fff', shadow: '#29144e' },
      answer: { surface: '#fff', selected: '#eadfff' },
      leaderboard: { surface: '#fff', highlight: '#fff8d8' }, progress: '#2dd4aa',
      stage: {
        background: 'radial-gradient(circle at top right, #533b88, #11162c 60%)',
        playerBarBackground: '#29144e', playerBarText: '#fff', playerBarMuted: '#ddd7ec',
        text: '#fff', textMuted: '#ddd7ec', surface: '#ffffff18',
        border: '#ffffff35', roomAccent: '#fff', eyebrow: '#ff5c78',
      },
    },
  },
  {
    id: 'midnight', name: 'Midnight',
    description: 'Deep navy with electric blue and violet highlights.',
    category: 'abstract', keywords: ['night', 'navy', 'blue', 'violet', 'electric'],
    swatches: ['#071326', '#4fb7ff', '#a78bfa'], typography: currentTypography,
    preview: { kind: 'tokens', label: 'Navy, blue and violet theme preview' },
    tokens: {
      canvas: '#071326', surface: '#10213d', surfaceSecondary: '#172d4e', text: '#f2f7ff',
      textMuted: '#b6c7df', border: '#36506f', accent: '#4fb7ff', accentSecondary: '#a78bfa',
      accentText: '#06111f', focus: '#7dd3fc', shadow: '0 18px 45px rgba(0, 5, 18, .38)',
      feature: { background: '#a78bfa', text: '#101129' },
      button: { background: '#4fb7ff', text: '#06111f', shadow: '#265f91' },
      answer: { surface: '#122846', selected: '#263f70' },
      leaderboard: { surface: '#122846', highlight: '#263d72' }, progress: '#a78bfa',
      stage: {
        background: 'radial-gradient(circle at top right, #322264, #071326 64%)',
        playerBarBackground: '#071326', playerBarText: '#f2f7ff', playerBarMuted: '#b6c7df',
        text: '#f2f7ff', textMuted: '#b6c7df', surface: '#182d4dcc',
        border: '#4d6f98', roomAccent: '#7dd3fc', eyebrow: '#a78bfa',
      },
    },
  },
  {
    id: 'sunset', name: 'Sunset',
    description: 'Dark plum with coral and warm golden accents.',
    category: 'abstract', keywords: ['plum', 'coral', 'gold', 'warm', 'evening'],
    swatches: ['#26102d', '#ff8066', '#ffc857'], typography: currentTypography,
    preview: { kind: 'tokens', label: 'Plum, coral and gold theme preview' },
    tokens: {
      canvas: '#26102d', surface: '#3a183e', surfaceSecondary: '#512346', text: '#fff4eb',
      textMuted: '#ddc1d1', border: '#70405e', accent: '#ff8066', accentSecondary: '#ffc857',
      accentText: '#32121f', focus: '#ffd782', shadow: '0 18px 45px rgba(20, 3, 24, .4)',
      feature: { background: '#ffc857', text: '#32121f' },
      button: { background: '#ff8066', text: '#32121f', shadow: '#9d3f43' },
      answer: { surface: '#431d46', selected: '#63324d' },
      leaderboard: { surface: '#431d46', highlight: '#684126' }, progress: '#ffc857',
      stage: {
        background: 'radial-gradient(circle at top right, #71334c, #26102d 64%)',
        playerBarBackground: '#32132f', playerBarText: '#fff4eb', playerBarMuted: '#ddc1d1',
        text: '#fff4eb', textMuted: '#ddc1d1', surface: '#5a2948cc',
        border: '#8b526f', roomAccent: '#ffc857', eyebrow: '#ff8066',
      },
    },
  },
  {
    id: 'arcade', name: 'Arcade',
    description: 'Near-black with crisp cyan, magenta and restrained lime.',
    category: 'entertainment', keywords: ['games', 'retro', 'neon', 'cyan', 'magenta', 'lime'],
    swatches: ['#080b12', '#22d3ee', '#f472d0'], typography: currentTypography,
    preview: { kind: 'tokens', label: 'Black, cyan and magenta theme preview' },
    tokens: {
      canvas: '#080b12', surface: '#111827', surfaceSecondary: '#172033', text: '#f4faff',
      textMuted: '#b8c2d2', border: '#3b4960', accent: '#22d3ee', accentSecondary: '#f472d0',
      accentText: '#061014', focus: '#a3e635', shadow: '0 18px 45px rgba(0, 0, 0, .48)',
      feature: { background: '#a3e635', text: '#101708' },
      button: { background: '#22d3ee', text: '#061014', shadow: '#0e7180' },
      answer: { surface: '#111d30', selected: '#29305c' },
      leaderboard: { surface: '#111d30', highlight: '#273b26' }, progress: '#a3e635',
      stage: {
        background: 'radial-gradient(circle at top right, #341342, #080b12 62%)',
        playerBarBackground: '#080b12', playerBarText: '#f4faff', playerBarMuted: '#b8c2d2',
        text: '#f4faff', textMuted: '#b8c2d2', surface: '#151f32dd',
        border: '#315870', roomAccent: '#a3e635', eyebrow: '#f472d0',
      },
    },
  },
  {
    id: 'mint', name: 'Mint',
    description: 'Deep teal with fresh mint and a warm neutral lift.',
    category: 'abstract', keywords: ['teal', 'mint', 'fresh', 'green', 'calm'],
    swatches: ['#073a38', '#72f2c2', '#ffe6b8'], typography: currentTypography,
    preview: { kind: 'tokens', label: 'Teal, mint and cream theme preview' },
    tokens: {
      canvas: '#073a38', surface: '#0d4b47', surfaceSecondary: '#155c55', text: '#effffb',
      textMuted: '#b7d9d1', border: '#37706a', accent: '#72f2c2', accentSecondary: '#ffe6b8',
      accentText: '#07312f', focus: '#ffe6b8', shadow: '0 18px 45px rgba(0, 24, 23, .42)',
      feature: { background: '#ffe6b8', text: '#07312f' },
      button: { background: '#72f2c2', text: '#07312f', shadow: '#278a70' },
      answer: { surface: '#104e49', selected: '#1d665d' },
      leaderboard: { surface: '#104e49', highlight: '#365d47' }, progress: '#ffe6b8',
      stage: {
        background: 'radial-gradient(circle at top right, #176a60, #073a38 64%)',
        playerBarBackground: '#073a38', playerBarText: '#effffb', playerBarMuted: '#b7d9d1',
        text: '#effffb', textMuted: '#b7d9d1', surface: '#155c55dd',
        border: '#4f8c83', roomAccent: '#ffe6b8', eyebrow: '#72f2c2',
      },
    },
  },
  {
    id: 'paper', name: 'Paper',
    description: 'Warm paper, dark ink and restrained red and blue.',
    category: 'abstract', keywords: ['paper', 'print', 'ink', 'warm', 'editorial'],
    swatches: ['#f6efdf', '#a83c35', '#2d5d86'], typography: currentTypography,
    preview: { kind: 'tokens', label: 'Paper, red and blue theme preview' },
    tokens: {
      canvas: '#f6efdf', surface: '#fffaf0', surfaceSecondary: '#efe4cf', text: '#28231c',
      textMuted: '#665e52', border: '#b9aa91', accent: '#a83c35', accentSecondary: '#2d5d86',
      accentText: '#fffaf0', focus: '#2d5d86', shadow: '0 18px 38px rgba(70, 52, 31, .17)',
      feature: { background: '#2d5d86', text: '#fffaf0' },
      button: { background: '#a83c35', text: '#fffaf0', shadow: '#65231f' },
      answer: { surface: '#fffaf0', selected: '#f2d8d2' },
      leaderboard: { surface: '#fffaf0', highlight: '#f0dfb0' }, progress: '#2d5d86',
      stage: {
        background: 'radial-gradient(circle at top right, #fffaf0, #e7dcc8 72%)',
        playerBarBackground: '#28231c', playerBarText: '#fffaf0', playerBarMuted: '#efe4cf',
        text: '#28231c', textMuted: '#665e52', surface: '#fffaf0e8',
        border: '#b9aa91', roomAccent: '#a83c35', eyebrow: '#a83c35',
      },
    },
  },
  ...visualThemeBatch1Themes,
  ...visualThemeBatch2Themes,
  ...visualThemeBatch3Themes,
]

const themesById = new Map(quizThemes.map((theme) => [theme.id, theme]))
const themeIds = new Set<string>(QUIZ_THEME_IDS)

export function isQuizThemeId(value: unknown): value is QuizThemeId {
  return typeof value === 'string' && themeIds.has(value)
}

export function normaliseQuizThemeId(value: unknown): QuizThemeId {
  return isQuizThemeId(value) ? value : DEFAULT_QUIZ_THEME_ID
}

export function getQuizTheme(value: unknown): QuizThemeDefinition {
  return themesById.get(normaliseQuizThemeId(value)) ?? quizThemes[0]
}
