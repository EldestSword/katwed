import {
  QUIZ_BACKGROUND_IDS,
  type QuizBackgroundId,
  type QuizThemeId,
} from '../../types/domain'
import { visualThemeBatch1Backgrounds } from '../../generated/visualThemeBatch1'
import { visualThemeBatch2Backgrounds } from '../../generated/visualThemeBatch2'
import { visualThemeBatch3Backgrounds } from '../../generated/visualThemeBatch3'

export interface QuizBackgroundDefinition {
  id: QuizBackgroundId
  name: string
  themeId: QuizThemeId
  assetPath: `/backgrounds/${QuizBackgroundId}.webp`
}

export const quizBackgrounds: readonly QuizBackgroundDefinition[] = [
  { id: 'katwed-bubbles', name: 'Bubbles', themeId: 'katwed', assetPath: '/backgrounds/katwed-bubbles.webp' },
  { id: 'katwed-confetti', name: 'Confetti', themeId: 'katwed', assetPath: '/backgrounds/katwed-confetti.webp' },
  { id: 'katwed-ribbons', name: 'Ribbons', themeId: 'katwed', assetPath: '/backgrounds/katwed-ribbons.webp' },
  { id: 'midnight-aurora', name: 'Aurora', themeId: 'midnight', assetPath: '/backgrounds/midnight-aurora.webp' },
  { id: 'midnight-glow', name: 'Glow', themeId: 'midnight', assetPath: '/backgrounds/midnight-glow.webp' },
  { id: 'midnight-stars', name: 'Stars', themeId: 'midnight', assetPath: '/backgrounds/midnight-stars.webp' },
  { id: 'sunset-horizon', name: 'Horizon', themeId: 'sunset', assetPath: '/backgrounds/sunset-horizon.webp' },
  { id: 'sunset-lights', name: 'Lights', themeId: 'sunset', assetPath: '/backgrounds/sunset-lights.webp' },
  { id: 'sunset-ribbons', name: 'Ribbons', themeId: 'sunset', assetPath: '/backgrounds/sunset-ribbons.webp' },
  { id: 'arcade-circuit', name: 'Circuit', themeId: 'arcade', assetPath: '/backgrounds/arcade-circuit.webp' },
  { id: 'arcade-grid', name: 'Grid', themeId: 'arcade', assetPath: '/backgrounds/arcade-grid.webp' },
  { id: 'arcade-neon', name: 'Neon', themeId: 'arcade', assetPath: '/backgrounds/arcade-neon.webp' },
  { id: 'mint-depth', name: 'Depth', themeId: 'mint', assetPath: '/backgrounds/mint-depth.webp' },
  { id: 'mint-shapes', name: 'Shapes', themeId: 'mint', assetPath: '/backgrounds/mint-shapes.webp' },
  { id: 'mint-waves', name: 'Waves', themeId: 'mint', assetPath: '/backgrounds/mint-waves.webp' },
  { id: 'paper-collage', name: 'Collage', themeId: 'paper', assetPath: '/backgrounds/paper-collage.webp' },
  { id: 'paper-geometry', name: 'Geometry', themeId: 'paper', assetPath: '/backgrounds/paper-geometry.webp' },
  { id: 'paper-notebook', name: 'Notebook', themeId: 'paper', assetPath: '/backgrounds/paper-notebook.webp' },
  ...visualThemeBatch1Backgrounds,
  ...visualThemeBatch2Backgrounds,
  ...visualThemeBatch3Backgrounds,
]

const backgroundIds = new Set<string>(QUIZ_BACKGROUND_IDS)
const backgroundsById = new Map(quizBackgrounds.map((background) => [background.id, background]))

export function isQuizBackgroundId(value: unknown): value is QuizBackgroundId {
  return typeof value === 'string' && backgroundIds.has(value)
}

export function getQuizBackground(value: unknown): QuizBackgroundDefinition | null {
  return isQuizBackgroundId(value) ? backgroundsById.get(value) ?? null : null
}

export function backgroundsForTheme(themeId: QuizThemeId): readonly QuizBackgroundDefinition[] {
  return quizBackgrounds.filter((background) => background.themeId === themeId)
}

export function isQuizBackgroundCompatible(
  backgroundId: QuizBackgroundId,
  themeId: QuizThemeId,
): boolean {
  return backgroundsById.get(backgroundId)?.themeId === themeId
}

export function normaliseQuizBackgroundId(
  value: unknown,
  themeId: QuizThemeId,
): QuizBackgroundId | null {
  return isQuizBackgroundId(value) && isQuizBackgroundCompatible(value, themeId) ? value : null
}
