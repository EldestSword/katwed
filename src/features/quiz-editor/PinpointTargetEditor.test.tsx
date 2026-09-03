import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PinpointQuestion, PinpointTarget } from '../../types/domain'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { loadPinpointImage } from '../../test/pinpointImage'
import { PinpointTargetEditor } from './PinpointTargetEditor'

const question = mixedDemoQuiz.questions.find((q): q is PinpointQuestion => q.type === 'pinpoint')!
function Harness() {
  const [value, setValue] = useState(question)
  return <><PinpointTargetEditor question={value} onChange={(target) => setValue({ ...value, target })} /><output data-testid="target-value">{JSON.stringify(value.target)}</output></>
}
function pointer(layer: HTMLElement, name: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } })
  fireEvent(layer, event)
}
async function setup() {
  render(<Harness />)
  await loadPinpointImage(question.media.altText)
  const layer = screen.getByTestId('pinpoint-coordinate-layer')
  Object.assign(layer, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 200, top: 0, width: 400, height: 400 }) })
  return layer
}
function value() { return JSON.parse(screen.getByTestId('target-value').textContent!) as PinpointTarget | null }
function polygonValue() {
  const target = value()
  if (target?.kind !== 'polygon') throw new Error('Expected a polygon')
  return target
}

describe('visual Pinpoint authoring', () => {
  it('draws on the contained image and keeps values after resize', async () => {
    const layer = await setup()
    expect(layer).toHaveStyle({ left: '200px', width: '400px' })
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    pointer(layer, 'pointerdown', 300, 100)
    pointer(layer, 'pointermove', 500, 300)
    pointer(layer, 'pointerup', 500, 300)
    expect(value()).toEqual({ kind: 'rectangle', x: .25, y: .25, width: .5, height: .5 })
    expect(screen.getByTestId('pinpoint-correct-target')).toHaveAttribute('data-shape', 'rectangle')
    await loadPinpointImage(question.media.altText, 300, 600)
    fireEvent(window, new Event('resize'))
    expect(value()).toEqual({ kind: 'rectangle', x: .25, y: .25, width: .5, height: .5 })
    expect(layer).toHaveStyle({ left: '0px', top: '150px', width: '300px' })
  })

  it('draws circles, cancels unfinished gestures and ignores a second pointer', async () => {
    const layer = await setup()
    pointer(layer, 'pointerdown', 400, 200)
    pointer(layer, 'pointermove', 440, 200, 2)
    pointer(layer, 'pointerup', 440, 200)
    expect(value()).toEqual({ kind: 'circle', x: .5, y: .5, radius: expect.closeTo(.1) })
    const previous = value()
    pointer(layer, 'pointerdown', 300, 100)
    pointer(layer, 'pointermove', 500, 200)
    fireEvent.keyDown(layer, { key: 'Escape' })
    pointer(layer, 'pointerup', 500, 200)
    expect(value()).toEqual(previous)
    pointer(layer, 'pointerdown', 300, 100)
    pointer(layer, 'pointercancel', 500, 200)
    expect(value()).toEqual(previous)
  })

  it('closes and simplifies freehand paths and keeps the previous area for invalid strokes', async () => {
    const layer = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Freehand' }))
    pointer(layer, 'pointerdown', 300, 100)
    for (let i = 1; i <= 20; i++) pointer(layer, 'pointermove', 300 + i * 10, 100)
    pointer(layer, 'pointermove', 500, 300)
    pointer(layer, 'pointermove', 300, 300)
    pointer(layer, 'pointerup', 300, 100)
    expect(value()).toMatchObject({ kind: 'polygon' })
    expect(polygonValue().points).toHaveLength(4)
    const previous = value()
    pointer(layer, 'pointerdown', 300, 100)
    pointer(layer, 'pointerup', 301, 101)
    expect(value()).toEqual(previous)
    expect(screen.getByText(/Draw a larger area/)).toHaveAttribute('role', 'status')
  })

  it('offers keyboard-only creation, numeric editing and clearing', async () => {
    await setup()
    const user = userEvent.setup()
    const freehand = screen.getByRole('button', { name: 'Freehand' })
    freehand.focus()
    await user.keyboard('{Enter}')
    screen.getByText(/Advanced settings/).focus()
    await user.keyboard('{Enter}')
    screen.getByRole('button', { name: 'Create freehand area with keyboard' }).focus()
    await user.keyboard('{Enter}')
    const horizontal = screen.getByRole('spinbutton', { name: 'Point 1 horizontal' })
    horizontal.focus()
    await user.keyboard('{Control>}a{/Control}0.2')
    expect(polygonValue().points[0].x).toBe(.2)
    screen.getByRole('button', { name: 'Clear area' }).focus()
    await user.keyboard('{Enter}')
    expect(value()).toBeNull()
    expect(screen.queryByTestId('pinpoint-correct-target')).not.toBeInTheDocument()
  })
})
