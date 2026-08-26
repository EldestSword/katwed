import {
  ANSWER_PALETTE_IDS,
  type AnswerColourTuple,
  type AnswerPaletteId,
} from '../../types/domain'
import { getContrastingTextColour, normaliseHexColour } from './colourContrast'

export interface AnswerPaletteDefinition {
  id: Exclude<AnswerPaletteId, 'custom'>
  name: string
  description: string
  colours: AnswerColourTuple
}

export const answerPalettes: readonly AnswerPaletteDefinition[] = [
  { id: 'classic', name: 'Classic', description: 'Bold quiz-night red, blue, green and yellow.', colours: ['#C62828', '#1565C0', '#2E7D32', '#F9A825', '#7B1FA2', '#00838F', '#EF6C00', '#455A64'] },
  { id: 'katwed', name: 'Katwed!', description: 'Katwed purple, coral, cyan and gold.', colours: ['#5B2A86', '#D94862', '#087F8C', '#B7791F', '#7C3AED', '#C2415D', '#0E7490', '#9A6700'] },
  { id: 'festive', name: 'Festive', description: 'Red, evergreen, gold and crisp winter ice.', colours: ['#B91C1C', '#166534', '#A16207', '#CFFAFE', '#7F1D1D', '#14532D', '#CA8A04', '#E0F2FE'] },
  { id: 'tropical', name: 'Tropical', description: 'Turquoise, mango, coral and vivid lime.', colours: ['#0F766E', '#D97706', '#DC4C64', '#4D7C0F', '#0369A1', '#C2410C', '#BE185D', '#3F6212'] },
  { id: 'summer', name: 'Summer', description: 'Sunshine, sky, watermelon and aqua.', colours: ['#D99A00', '#1976D2', '#D9485F', '#008C95', '#F59E0B', '#0E7490', '#C0265E', '#2563EB'] },
  { id: 'sports', name: 'Sports', description: 'Cobalt, scarlet, emerald and medal gold.', colours: ['#1D4ED8', '#BE123C', '#047857', '#B7791F', '#3730A3', '#9F1239', '#065F46', '#92400E'] },
  { id: 'arcade', name: 'Arcade', description: 'Cyan, magenta, lime and violet energy.', colours: ['#007C91', '#C0268C', '#4D7C0F', '#6D28D9', '#0369A1', '#A21CAF', '#3F6212', '#7E22CE'] },
  { id: 'neon', name: 'Neon', description: 'Electric blue, hot pink, acid green and orange.', colours: ['#0066FF', '#D10072', '#4D8F00', '#D94F00', '#5B21B6', '#008E9B', '#B91C1C', '#A16207'] },
  { id: 'pastel', name: 'Pastel', description: 'Lavender, mint, peach and powder blue.', colours: ['#C4B5FD', '#A7F3D0', '#FDBA9A', '#BAE6FD', '#FBCFE8', '#FDE68A', '#BFDBFE', '#D9F99D'] },
  { id: 'retro', name: 'Retro', description: 'Mustard, burnt orange, teal and warm cream.', colours: ['#B7791F', '#C2410C', '#0F766E', '#F5E6C8', '#92400E', '#9A3412', '#155E75', '#E7D3A8'] },
  { id: 'ocean', name: 'Ocean', description: 'Deep blue, aqua, turquoise and coral.', colours: ['#1E3A8A', '#0E7490', '#0F766E', '#D94862', '#1D4ED8', '#0369A1', '#115E59', '#BE123C'] },
  { id: 'forest', name: 'Forest', description: 'Pine, moss, clay and sandy earth.', colours: ['#14532D', '#4D7C0F', '#9A3412', '#D6B98C', '#166534', '#3F6212', '#7C2D12', '#C4A46B'] },
  { id: 'galaxy', name: 'Galaxy', description: 'Indigo, violet, cyan and cosmic pink.', colours: ['#3730A3', '#6D28D9', '#0E7490', '#BE185D', '#312E81', '#7E22CE', '#0369A1', '#9D174D'] },
  { id: 'sunset', name: 'Sunset', description: 'Coral, amber, plum and deep rose.', colours: ['#D94862', '#B7791F', '#7E225B', '#BE185D', '#C2410C', '#A16207', '#6B214E', '#9F1239'] },
  { id: 'autumn', name: 'Autumn', description: 'Rust, mustard, olive and burgundy.', colours: ['#9A3412', '#A16207', '#4D7C0F', '#881337', '#C2410C', '#854D0E', '#3F6212', '#701A2D'] },
  { id: 'winter', name: 'Winter', description: 'Ice blue, navy, silver and snow white.', colours: ['#BAE6FD', '#1E3A8A', '#CBD5E1', '#FFFFFF', '#7DD3FC', '#172554', '#94A3B8', '#E0F2FE'] },
  { id: 'halloween', name: 'Halloween', description: 'Pumpkin, purple, eerie green and charcoal.', colours: ['#C2410C', '#6B21A8', '#4D7C0F', '#374151', '#EA580C', '#581C87', '#3F6212', '#111827'] },
]

export const DEFAULT_ANSWER_PALETTE_ID: AnswerPaletteId = 'classic'
export const CLASSIC_ANSWER_COLOURS = answerPalettes[0].colours

const paletteIds = new Set<string>(ANSWER_PALETTE_IDS)
const palettesById = new Map(answerPalettes.map((palette) => [palette.id, palette]))
const sixDigitHex = /^#[0-9A-F]{6}$/

export function isAnswerPaletteId(value: unknown): value is AnswerPaletteId {
  return typeof value === 'string' && paletteIds.has(value)
}

export function isAnswerColourTuple(value: unknown): value is AnswerColourTuple {
  return Array.isArray(value) && value.length === 8 && value.every((colour) => (
    typeof colour === 'string' && sixDigitHex.test(colour)
  ))
}

export function normaliseAnswerColourTuple(value: unknown): AnswerColourTuple | null {
  if (!Array.isArray(value) || value.length !== 8) return null
  const colours = value.map((colour) => normaliseHexColour(colour))
  if (colours.some((colour) => colour === null)) return null
  return colours as unknown as AnswerColourTuple
}

export function normaliseAnswerPalette(
  paletteId: unknown,
  customColours: unknown,
): { answerPaletteId: AnswerPaletteId; customAnswerColours: AnswerColourTuple } {
  const answerPaletteId = isAnswerPaletteId(paletteId) ? paletteId : DEFAULT_ANSWER_PALETTE_ID
  const customAnswerColours = normaliseAnswerColourTuple(customColours) ?? [...CLASSIC_ANSWER_COLOURS] as AnswerColourTuple
  return { answerPaletteId, customAnswerColours }
}

export function getAnswerPaletteDefinition(value: unknown): AnswerPaletteDefinition | null {
  return isAnswerPaletteId(value) && value !== 'custom' ? palettesById.get(value) ?? null : null
}

export function resolveAnswerColours(
  paletteId: unknown,
  customColours: unknown,
): AnswerColourTuple {
  const normalised = normaliseAnswerPalette(paletteId, customColours)
  if (normalised.answerPaletteId === 'custom') return normalised.customAnswerColours
  return getAnswerPaletteDefinition(normalised.answerPaletteId)?.colours ?? CLASSIC_ANSWER_COLOURS
}

export function answerColourAt(colours: readonly string[], position: number): string {
  return colours.length ? colours[((position % colours.length) + colours.length) % colours.length] : CLASSIC_ANSWER_COLOURS[0]
}

export function answerColourStyle(colours: readonly string[], position: number) {
  const backgroundColor = answerColourAt(colours, position)
  return {
    backgroundColor,
    color: getContrastingTextColour(backgroundColor) ?? '#111827',
  }
}
