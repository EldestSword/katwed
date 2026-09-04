import { useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { SafeQuestion } from '../../types/domain'
import { formatSliderValue } from './revealFormatting'
import { nudgeSliderValue, sliderPercentage, sliderValueAtPointer, snapSliderValue } from './playerSlider'

interface PlayerSliderAnswerProps {
  question: Extract<SafeQuestion, { type: 'slider' }>
  value: number | null
  disabled?: boolean
  onChange(value: number): void
}

const THUMB_SIZE = 40

export function PlayerSliderAnswer({ question, value, disabled = false, onChange }: PlayerSliderAnswerProps) {
  const id = useId()
  const activePointer = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const current = value ?? snapSliderValue(question.minimum + (question.maximum - question.minimum) / 2, question)
  const formatted = formatSliderValue(current, question)
  const percentage = sliderPercentage(current, question)
  const style = { '--slider-position': `${percentage}%`, '--slider-thumb-size': `${THUMB_SIZE}px` } as CSSProperties

  function chooseAtPointer(event: PointerEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const bounds = input.getBoundingClientRect()
    const renderedThumbSize = input.clientWidth ? THUMB_SIZE * bounds.width / input.clientWidth : THUMB_SIZE
    onChange(sliderValueAtPointer(event.clientX, bounds, renderedThumbSize, question))
  }

  function endPointer(event: PointerEvent<HTMLInputElement>) {
    if (event.pointerId !== activePointer.current) return
    activePointer.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="slider-answer" style={style} data-dragging={dragging || undefined} data-chosen={value !== null}>
      <p className="eyebrow">{value === null ? 'Choose your value' : 'Your answer'}</p>
      <div className="slider-answer__interaction">
        <div className="slider-answer__bubble-rail">
          <output htmlFor={id} aria-live="polite" aria-atomic="true">{value === null ? '—' : formatted}</output>
        </div>
        <input
          id={id}
          type="range"
          min={question.minimum}
          max={question.maximum}
          step={question.step}
          value={current}
          disabled={disabled}
          aria-label={question.unitLabel || 'Answer value'}
          aria-valuetext={value === null ? `No value chosen. Starting at ${formatted}` : formatted}
          aria-describedby={`${id}-hint`}
          onKeyDown={(event) => {
            // Choosing an unchanged endpoint may not emit an input event (for example End on a two-step scale).
            if (value === null && ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) onChange(current)
          }}
          onChange={(event) => {
            // Pointer gestures have one update path; native input events serve keyboard and assistive technology.
            if (activePointer.current === null) onChange(snapSliderValue(event.currentTarget.valueAsNumber, question))
          }}
          onPointerDown={(event) => {
            if (disabled || !event.isPrimary || event.button !== 0 || activePointer.current !== null) return
            event.preventDefault()
            event.currentTarget.focus({ preventScroll: true })
            event.currentTarget.setPointerCapture(event.pointerId)
            activePointer.current = event.pointerId
            setDragging(true)
            chooseAtPointer(event)
          }}
          onPointerMove={(event) => {
            if (!disabled && event.pointerId === activePointer.current) chooseAtPointer(event)
          }}
          onPointerUp={(event) => {
            if (!disabled && event.pointerId === activePointer.current) chooseAtPointer(event)
            endPointer(event)
          }}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
        />
        <div className="slider-answer__limits">
          <span><small>Minimum</small>{question.prefix}{question.minimum}{question.suffix}</span>
          <span><small>Maximum</small>{question.prefix}{question.maximum}{question.suffix}</span>
        </div>
      </div>
      <div className="slider-answer__adjustments">
        <button type="button" className="slider-answer__nudge" aria-label="Decrease answer"
          disabled={disabled || current <= question.minimum}
          onClick={() => onChange(nudgeSliderValue(current, -1, question))}>−</button>
        <p id={`${id}-hint`}>{value === null ? 'No value chosen. Tap or drag, or use − and +.' : 'Fine-tune with − and +, then lock in.'}</p>
        <button type="button" className="slider-answer__nudge" aria-label="Increase answer"
          disabled={disabled || current >= snapSliderValue(question.maximum, question)}
          onClick={() => onChange(nudgeSliderValue(current, 1, question))}>+</button>
      </div>
    </div>
  )
}
