import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { standingsState } from '../../test/leaderboardFixtures'
import { loadPinpointImage } from '../../test/pinpointImage'
import type { PinpointTarget, SafeGameState } from '../../types/domain'
import { PresentationStage } from './PresentationStage'

const targets: PinpointTarget[] = [
  { kind: 'circle', x: .3, y: .4, radius: .1 },
  { kind: 'rectangle', x: .2, y: .3, width: .5, height: .4 },
  { kind: 'polygon', points: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .5, y: .8 }] },
]

describe('Presentation structured Pinpoint integration', () => {
  it.each(targets)('uses the $kind target only at answer reveal', async (target) => {
    const state: SafeGameState = {
      ...standingsState('question'),
      currentQuestion: { ...standingsState('question').currentQuestion!, type: 'pinpoint',
        media: { type: 'image', path: '/target.svg', altText: 'Target', revealEffect: 'immediate', revealDurationSeconds: 0 } },
    }
    const { rerender } = render(<PresentationStage state={state} />)
    expect(screen.queryByTestId('pinpoint-correct-target')).toBeNull()
    rerender(<PresentationStage state={{ ...state, phase: 'reveal',
      reveal: { type: 'pinpoint', target, points: [{ x: .5, y: .6 }], caption: '' } }} />)
    await loadPinpointImage('Target')
    expect(screen.getByTestId('pinpoint-correct-target')).toHaveAttribute('data-shape', target.kind)
    expect(screen.getByTestId('pinpoint-response-marker')).toBeInTheDocument()
  })
})
