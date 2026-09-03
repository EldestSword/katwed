import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { currentBoard, previousBoard } from '../../test/leaderboardFixtures'
import { PlayerLeaderboard } from './PlayerLeaderboard'

describe('personal leaderboard movement', () => {
  it.each([['jaki', '↑ 2', '1st'], ['roger', '↓ 1', '2nd']])('shows only %s’s own movement and final rank', (currentPlayerId, change, rank) => {
    const { container } = render(<PlayerLeaderboard reveal={{ id: 2, previous: previousBoard, entries: currentBoard }} currentPlayerId={currentPlayerId} onSettled={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(change)
    expect(screen.getByRole('status')).toHaveTextContent(`You’re now ${rank}`)
    expect(screen.queryByText(/takes the lead/)).toBeNull()
    expect(container.querySelector('.leaderboard-commentary')).toBeNull()
    expect(container.querySelector('.is-current')).toHaveAttribute('data-player-id', currentPlayerId)
  })

  it.each(['ross', 'new-player'])('does not manufacture a message for unchanged or unknown player %s', (currentPlayerId) => {
    render(<PlayerLeaderboard reveal={{ id: 2, previous: previousBoard, entries: currentBoard }} currentPlayerId={currentPlayerId} onSettled={vi.fn()} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows no rank claim on the first leaderboard or after refresh', () => {
    render(<PlayerLeaderboard reveal={{ id: 1, previous: null, entries: currentBoard }} currentPlayerId="jaki" onSettled={vi.fn()} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('list', { name: 'Leaderboard' })).toBeVisible()
  })
})
