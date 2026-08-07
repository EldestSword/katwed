import type { CSSProperties, HTMLAttributes } from 'react'
import type { QuizBackgroundId, QuizThemeId } from '../../types/domain'
import { getQuizBackground, normaliseQuizBackgroundId } from './quizBackgrounds'

type SurfaceProps = Pick<HTMLAttributes<HTMLElement>, 'style'> & {
  'data-quiz-background'?: QuizBackgroundId
}

export function quizBackgroundSurfaceProps(
  backgroundId: unknown,
  themeId: QuizThemeId,
): SurfaceProps {
  const compatibleId = normaliseQuizBackgroundId(backgroundId, themeId)
  const background = getQuizBackground(compatibleId)
  if (!background) return {}
  return {
    'data-quiz-background': background.id,
    style: {
      '--quiz-background-image': `url("${background.assetPath}")`,
    } as CSSProperties,
  }
}
