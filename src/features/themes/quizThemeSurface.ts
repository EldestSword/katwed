import type { CSSProperties, HTMLAttributes } from 'react'
import type { QuizBackgroundId, QuizThemeId } from '../../types/domain'
import { getQuizBackground, normaliseQuizBackgroundId } from './quizBackgrounds'
import { getThemeFont } from './themeFonts'
import { getQuizTheme } from './quizThemes'

type ThemeSurfaceProps = Pick<HTMLAttributes<HTMLElement>, 'style'> & {
  'data-quiz-theme': QuizThemeId
  'data-quiz-background'?: QuizBackgroundId
}

export function quizThemeSurfaceProps(
  themeId: unknown,
  backgroundId?: unknown,
): ThemeSurfaceProps {
  const theme = getQuizTheme(themeId)
  const displayFont = getThemeFont(theme.typography.displayFontId)
  const uiFont = getThemeFont(theme.typography.uiFontId)
  const { tokens } = theme
  const style = {
    '--quiz-bg': tokens.canvas,
    '--quiz-surface': tokens.surface,
    '--quiz-surface-secondary': tokens.surfaceSecondary,
    '--quiz-text': tokens.text,
    '--quiz-muted': tokens.textMuted,
    '--quiz-border': tokens.border,
    '--quiz-accent': tokens.accent,
    '--quiz-accent-secondary': tokens.accentSecondary,
    '--quiz-feature-accent': tokens.feature.background,
    '--quiz-feature-text': tokens.feature.text,
    '--quiz-accent-text': tokens.accentText,
    '--quiz-button': tokens.button.background,
    '--quiz-button-text': tokens.button.text,
    '--quiz-button-shadow': tokens.button.shadow,
    '--quiz-answer-surface': tokens.answer.surface,
    '--quiz-answer-selected': tokens.answer.selected,
    '--quiz-leaderboard-surface': tokens.leaderboard.surface,
    '--quiz-leaderboard-highlight': tokens.leaderboard.highlight,
    '--quiz-progress': tokens.progress,
    '--quiz-focus': tokens.focus,
    '--quiz-stage-bg': tokens.stage.background,
    '--quiz-player-bar-bg': tokens.stage.playerBarBackground,
    '--quiz-player-bar-text': tokens.stage.playerBarText,
    '--quiz-player-bar-muted': tokens.stage.playerBarMuted,
    '--quiz-stage-text': tokens.stage.text,
    '--quiz-stage-muted': tokens.stage.textMuted,
    '--quiz-stage-surface': tokens.stage.surface,
    '--quiz-stage-border': tokens.stage.border,
    '--quiz-room-accent': tokens.stage.roomAccent,
    '--quiz-stage-eyebrow': tokens.stage.eyebrow,
    '--quiz-shadow': tokens.shadow,
    '--quiz-font-display': displayFont?.family ?? 'system-ui, sans-serif',
    '--quiz-font-ui': uiFont?.family ?? 'system-ui, sans-serif',
  } as CSSProperties

  const compatibleBackgroundId = normaliseQuizBackgroundId(backgroundId, theme.id)
  const background = getQuizBackground(compatibleBackgroundId)
  if (background) {
    Object.assign(style, {
      '--quiz-background-image': `url("${background.assetPath}")`,
    })
  }

  return {
    'data-quiz-theme': theme.id,
    ...(background ? { 'data-quiz-background': background.id } : {}),
    style,
  }
}
