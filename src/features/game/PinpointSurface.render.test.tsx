import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PinpointTarget } from '../../types/domain'
import { loadPinpointImage } from '../../test/pinpointImage'
import { PinpointSurface } from './PinpointSurface'

describe('Pinpoint reveal overlays', () => {
  it('withholds the coordinate layer while a replacement image has not loaded', async () => {
    const { rerender } = render(<PinpointSurface path="/first.svg" alt="First" mode="author" target={{ kind: 'circle', x: .5, y: .5, radius: .1 }} />)
    await loadPinpointImage('First')
    expect(screen.getByTestId('pinpoint-coordinate-layer')).toBeInTheDocument()
    rerender(<PinpointSurface path="/second.svg" alt="Second" mode="author" target={{ kind: 'circle', x: .5, y: .5, radius: .1 }} />)
    expect(screen.queryByTestId('pinpoint-coordinate-layer')).not.toBeInTheDocument()
    await loadPinpointImage('Second', 300, 600, 1000, 500)
    expect(screen.getByTestId('pinpoint-coordinate-layer')).toHaveStyle({ top: '225px', height: '150px' })
  })
  const targets: PinpointTarget[] = [
    { kind: 'circle', x: .3, y: .4, radius: .1 },
    { kind: 'rectangle', x: .2, y: .3, width: .5, height: .4 },
    { kind: 'polygon', points: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .5, y: .8 }] },
  ]
  it.each(targets.flatMap((target) => (['player-reveal', 'presentation-reveal'] as const).map((mode) => ({ target, mode }))))('renders $target.kind in $mode alongside response markers', async ({ target, mode }) => {
    render(<PinpointSurface path="/target.svg" alt="Target" mode={mode} target={target} markers={[{ x: .5, y: .6, kind: 'response', label: 'Player answer' }]} />)
    expect(screen.queryByTestId('pinpoint-correct-target')).not.toBeInTheDocument()
    await loadPinpointImage('Target')
    const overlay = screen.getByTestId('pinpoint-correct-target')
    expect(overlay).toHaveAttribute('data-shape', target.kind)
    expect(overlay).toHaveAttribute('preserveAspectRatio', 'none')
    expect(overlay.querySelector(target.kind === 'rectangle' ? 'rect' : target.kind)).not.toBeNull()
    expect(screen.getByTestId('pinpoint-response-marker')).toHaveStyle({ left: '50%', top: '60%' })
  })
})
