import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SafeQuestion } from '../../types/domain'
import { PlayerSliderAnswer } from './PlayerSliderAnswer'

const question: Extract<SafeQuestion, { type: 'slider' }> = {
  id: 'slider', type: 'slider', prompt: 'Choose a value', supportingText: '',
  media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'hide',
  points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
  minimum: 0, maximum: 10, step: .1, prefix: '', suffix: '', unitLabel: 'kg',
}

function Control({ initialValue = null, scale = question, onChange = vi.fn() }: {
  initialValue?: number | null
  scale?: typeof question
  onChange?: (value: number) => void
}) {
  const [value, setValue] = useState(initialValue)
  return <PlayerSliderAnswer question={scale} value={value} onChange={(next) => { setValue(next); onChange(next) }} />
}

afterEach(() => vi.unstubAllGlobals())

describe('PlayerSliderAnswer', () => {
  it('starts at an explicitly unchosen midpoint without emitting an answer on render or focus', () => {
    const onChange = vi.fn()
    render(<Control onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'kg' })
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveValue('5')
    expect(slider).toHaveAttribute('aria-valuetext', 'No value chosen. Starting at 5 kg')
    expect(screen.getByText(/No value chosen. Tap or drag/)).toBeVisible()
    slider.focus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('updates on successive native input events before change or blur', () => {
    const onChange = vi.fn()
    render(<Control onChange={onChange} />)
    const slider = screen.getByRole('slider')
    for (const value of ['1.1', '1.2', '1.3']) {
      fireEvent.input(slider, { target: { value } })
      expect(screen.getByRole('status')).toHaveTextContent(`${value} kg`)
    }
    expect(onChange.mock.calls).toEqual([[1.1], [1.2], [1.3]])
  })

  it('nudges decimal steps in both directions and disables only the applicable endpoint', async () => {
    const user = userEvent.setup()
    render(<Control initialValue={0} />)
    const decrease = screen.getByRole('button', { name: 'Decrease answer' })
    const increase = screen.getByRole('button', { name: 'Increase answer' })
    expect(decrease).toBeDisabled()
    for (const value of ['0.1', '0.2', '0.3']) {
      await user.click(increase)
      expect(screen.getByRole('slider')).toHaveValue(value)
    }
    await user.click(decrease)
    expect(screen.getByRole('slider')).toHaveValue('0.2')
    fireEvent.input(screen.getByRole('slider'), { target: { value: '9.9' } })
    await user.click(increase)
    expect(screen.getByRole('slider')).toHaveValue('10')
    expect(increase).toBeDisabled()
    expect(decrease).toBeEnabled()
  })

  it('disables increase at the last legal step when maximum is not step-aligned', () => {
    render(<Control initialValue={.9} scale={{ ...question, maximum: 1, step: .3 }} />)
    expect(screen.getByRole('button', { name: 'Increase answer' })).toBeDisabled()
  })

  it.each([
    [{ prefix: '£', suffix: '', unitLabel: '' }, '£1.5'],
    [{ prefix: '', suffix: '%', unitLabel: '' }, '1.5%'],
    [{ prefix: '', suffix: '', unitLabel: 'kg' }, '1.5 kg'],
  ])('formats the bubble and accessible value with %s', (format, expected) => {
    render(<Control initialValue={1.5} scale={{ ...question, ...format }} />)
    expect(screen.getByRole('status')).toHaveTextContent(expected)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', expected)
  })

  it.each(['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'])('allows native %s handling and selects on deliberate keyboard interaction', (key) => {
    const onChange = vi.fn()
    render(<Control onChange={onChange} />)
    // jsdom does not implement native range key stepping; the real browser checks its resulting values.
    expect(fireEvent.keyDown(screen.getByRole('slider'), { key })).toBe(true)
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('captures a pointer and updates during movement, ignores competing input, and stops on cancellation', () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number
      isPrimary: boolean
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.isPrimary = init.isPrimary ?? true
      }
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    const onChange = vi.fn()
    const { container } = render(<Control onChange={onChange} />)
    const slider = screen.getByRole('slider')
    slider.getBoundingClientRect = () => ({ left: 100, width: 240 } as DOMRect)
    slider.setPointerCapture = vi.fn()
    slider.hasPointerCapture = () => true
    slider.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(slider, { clientX: 120, pointerId: 3 })
    expect(slider.setPointerCapture).toHaveBeenCalledWith(3)
    expect(slider).toHaveFocus()
    expect(slider).toHaveValue('0')
    fireEvent.pointerMove(slider, { clientX: 170, pointerId: 3 })
    expect(screen.getByRole('status')).toHaveTextContent('2.5 kg')
    fireEvent.pointerMove(slider, { clientX: 220, pointerId: 3 })
    expect(screen.getByRole('status')).toHaveTextContent('5 kg')
    fireEvent.input(slider, { target: { value: '9' } })
    expect(onChange.mock.calls).toEqual([[0], [2.5], [5]])
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 4 })
    expect(onChange).toHaveBeenCalledTimes(3)
    fireEvent.pointerCancel(slider, { pointerId: 3 })
    expect(slider.releasePointerCapture).toHaveBeenCalledWith(3)
    expect(container.querySelector('[data-dragging]')).toBeNull()
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 3 })
    expect(onChange).toHaveBeenCalledTimes(3)
    fireEvent.pointerDown(slider, { clientX: 320, pointerId: 5 })
    fireEvent.pointerUp(slider, { clientX: 320, pointerId: 5 })
    expect(slider).toHaveValue('10')
    expect(container.querySelector('[data-dragging]')).toBeNull()
  })

  it('disables all adjustment controls while an answer is unavailable', () => {
    render(<PlayerSliderAnswer question={question} value={5} disabled onChange={vi.fn()} />)
    expect(screen.getByRole('slider')).toBeDisabled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
})
