import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameTimer } from './GameTimer'

describe('GameTimer', () => {
  it('announces remaining time and switches to urgent styling at the threshold', () => {
    const { rerender } = render(<GameTimer seconds={6} totalSeconds={30} />)
    expect(screen.getByRole('timer', { name: '6 seconds remaining' })).not.toHaveClass('game-timer--urgent')
    rerender(<GameTimer seconds={5} totalSeconds={30} />)
    expect(screen.getByRole('timer', { name: '5 seconds remaining' })).toHaveClass('game-timer--urgent')
  })

  it('supports compact and zero states with a useful accessible label', () => {
    render(<GameTimer seconds={0} compact />)
    expect(screen.getByRole('timer', { name: '0 seconds remaining' })).toHaveClass('game-timer--compact', 'game-timer--urgent', 'game-timer--zero')
  })
})
