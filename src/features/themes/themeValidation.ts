import { contrastRatio, normaliseHexColour } from '../answer-palettes/colourContrast'
import { getThemeCategory } from './themeCategories'
import { getThemeFont } from './themeFonts'
import type { QuizThemeDefinition } from './quizThemes'

function requireContrast(
  issues: string[],
  theme: QuizThemeDefinition,
  label: string,
  foreground: string,
  background: string,
  minimum: number,
) {
  const ratio = contrastRatio(foreground, background)
  if (ratio === null || ratio < minimum) {
    issues.push(`${theme.id}: ${label} contrast must be at least ${minimum}:1.`)
  }
}

export function validateQuizThemeDefinition(theme: QuizThemeDefinition): readonly string[] {
  const issues: string[] = []
  const displayFont = getThemeFont(theme.typography.displayFontId)
  const uiFont = getThemeFont(theme.typography.uiFontId)
  if (!getThemeCategory(theme.category)) issues.push(`${theme.id}: category is not registered.`)
  if (!displayFont?.roleSuitability.display) issues.push(`${theme.id}: display font is not approved for display use.`)
  if (!uiFont?.roleSuitability.ui) issues.push(`${theme.id}: UI font is not approved for utility use.`)
  if (theme.swatches.some((colour) => normaliseHexColour(colour) === null)) {
    issues.push(`${theme.id}: swatches must be hexadecimal colours.`)
  }

  const { tokens } = theme
  requireContrast(issues, theme, 'surface text', tokens.text, tokens.surface, 7)
  requireContrast(issues, theme, 'surface muted text', tokens.textMuted, tokens.surface, 4.5)
  requireContrast(issues, theme, 'button text', tokens.button.text, tokens.button.background, 4.5)
  requireContrast(issues, theme, 'feature text', tokens.feature.text, tokens.feature.background, 4.5)
  requireContrast(issues, theme, 'player bar text', tokens.stage.playerBarText, tokens.stage.playerBarBackground, 4.5)
  requireContrast(issues, theme, 'player bar muted text', tokens.stage.playerBarMuted, tokens.stage.playerBarBackground, 4.5)
  return issues
}
