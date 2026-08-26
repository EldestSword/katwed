import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Leaderboard } from './Leaderboard'

const entries = [
  { playerId: 'one', nickname: 'A Very Long Player Name That Must Not Hide Points', totalScore: 3000, correctAnswerCount: 3, totalCorrectResponseMs: 100, rank: 1 },
  { playerId: 'two', nickname: 'Zero Player', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0, rank: 2 },
]

describe('Leaderboard variants', () => {
  it('uses the presentation layout while retaining names, totals and zero-score players', () => {
    const { container } = render(<Leaderboard entries={entries} variant="presentation" />)
    expect(container.querySelector('.leaderboard--presentation')).toHaveAttribute('data-variant', 'presentation')
    expect(screen.getByText(entries[0].nickname)).toBeInTheDocument()
    expect(screen.getByText('3,000 points')).toBeInTheDocument()
    expect(screen.getByText('Zero Player')).toBeInTheDocument()
    expect(screen.getByText('0 points')).toBeInTheDocument()
    expect(container.querySelector('[data-rank="1"]')).toHaveClass('is-top-rank')
  })

  it('keeps the player leaderboard on its original variant', () => {
    const { container } = render(<Leaderboard entries={entries} currentPlayerId="one" />)
    expect(container.querySelector('.leaderboard--player')).toHaveAttribute('data-variant', 'player')
    expect(container.querySelector('.leaderboard--presentation')).not.toBeInTheDocument()
  })
})
