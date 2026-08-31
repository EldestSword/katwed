import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { QuestionImage } from '../QuestionImage'
import type { ContentDensity } from '../../features/game/liveQuestionTypography'
import { FittedAnswerLabel } from './FittedAnswerLabel'
import { PositionMarker } from './PositionMarker'

export type AnswerTileState = 'default' | 'locked' | 'correct' | 'incorrect'

export interface AnswerTileProps {
  label: ReactNode
  accessibleLabel?: string
  position: number
  style?: CSSProperties
  className?: string
  optionId?: string
  image?: { path: string; alt: string }
  selected?: boolean
  disabled?: boolean
  state?: AnswerTileState
  textDensity?: ContentDensity
  fitSingleWords?: boolean
  onLabelNeedsMoreWidth?(): void
  onSelect?: MouseEventHandler<HTMLButtonElement>
  onEnlarge?(): void
}

function statusLabel(state: AnswerTileState, selected: boolean, disabled: boolean): string | null {
  if (disabled) return 'Unavailable'
  if (state === 'locked') return 'Locked'
  if (state === 'correct') return 'Correct'
  if (state === 'incorrect') return 'Incorrect'
  return selected ? 'Selected' : null
}

export function AnswerTile({
  label,
  accessibleLabel,
  position,
  style,
  className = '',
  optionId,
  image,
  selected = false,
  disabled = false,
  state = 'default',
  textDensity = 'short',
  fitSingleWords = false,
  onLabelNeedsMoreWidth,
  onSelect,
  onEnlarge,
}: AnswerTileProps) {
  const status = statusLabel(state, selected, disabled)
  const classes = [
    'answer-tile',
    selected && 'is-selected',
    disabled && 'is-disabled',
    state !== 'default' && `is-${state}`,
    className,
  ].filter(Boolean).join(' ')
  const contents = (
    <>
      {image && <span className="answer-tile__image"><QuestionImage path={image.path} alt={image.alt} /></span>}
      <PositionMarker position={position} />
      {fitSingleWords ? <FittedAnswerLabel onNeedsMoreWidth={onLabelNeedsMoreWidth}>{label}</FittedAnswerLabel> : <span className="answer-tile__label">{label}</span>}
      {status && <span className="answer-tile__status">{status}</span>}
      <span className="sr-only">Answer {position + 1}</span>
    </>
  )

  if (!onSelect) {
    return <div className={`${classes} answer-tile--static`} data-answer-density={textDensity} data-option-id={optionId} data-state={state} style={style}>{contents}</div>
  }

  return (
    <div className={classes} data-answer-density={textDensity} data-option-id={optionId} data-state={state} style={style}>
      <button
        className="answer-tile__select"
        type="button"
        aria-label={accessibleLabel}
        aria-pressed={selected}
        disabled={disabled || state === 'locked'}
        style={style}
        onClick={onSelect}
      >
        {contents}
      </button>
      {image && onEnlarge && (
        <button className="answer-tile__enlarge" type="button" onClick={onEnlarge}>
          Enlarge
        </button>
      )}
    </div>
  )
}
