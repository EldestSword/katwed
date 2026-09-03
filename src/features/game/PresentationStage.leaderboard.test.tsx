import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { board, currentBoard, previousBoard, standingsState } from '../../test/leaderboardFixtures'
import { PresentationStage } from './PresentationStage'

describe('Presentation leaderboard sequence', () => {
  afterEach(() => vi.useRealTimers())

  it('retains baseline across hidden phases, animates the next board, and uses that board on the following reveal', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<PresentationStage state={standingsState('leaderboard')} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    for (const phase of ['question', 'locked', 'reveal'] as const) {
      rerender(<PresentationStage state={standingsState(phase, [], 2)} />)
      expect(screen.queryByRole('list', { name: 'Leaderboard' })).toBeNull()
      expect(screen.queryByText('4,800 points')).toBeNull()
    }
    rerender(<PresentationStage state={standingsState('leaderboard', currentBoard, 2)} />)
    expect(container.querySelector('.animated-leaderboard')).toHaveAttribute('data-reveal-stage', 'holding')
    expect(container.querySelector('[data-player-id="jaki"] .leaderboard__points [aria-hidden]')).toHaveTextContent('4,400 points')
    await act(async () => { vi.advanceTimersByTime(2600) })
    expect([...container.querySelectorAll('li')].map((row) => row.dataset.playerId)).toEqual(['jaki', 'roger', 'carol', 'ross'])
    expect(screen.getByRole('status')).toHaveTextContent('Jaki takes the lead!')
    rerender(<PresentationStage state={standingsState('leaderboard', [...currentBoard], 2)} />)
    expect(container.querySelector('.animated-leaderboard')).toHaveAttribute('data-reveal-stage', 'settled')
    rerender(<PresentationStage state={standingsState('question', [], 3)} />)
    const third = board(['Ross', 'Jaki', 'Roger', 'Carol'], [5500, 5400, 4800, 4700])
    rerender(<PresentationStage state={standingsState('leaderboard', third, 3)} />)
    expect(container.querySelector('[data-player-id="jaki"] .leaderboard__points [aria-hidden]')).toHaveTextContent('5,000 points')
    expect(container.querySelector('[data-player-id="roger"] .leaderboard__movement')).toHaveTextContent('↓ 1')
    await act(async () => { vi.advanceTimersByTime(2600) })
    expect(screen.getByRole('status')).toHaveTextContent('Ross takes the lead!')
  })

  it('obeys rapid host advances and leaves final results on the existing renderer', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<PresentationStage state={standingsState('leaderboard')} />)
    rerender(<PresentationStage state={standingsState('question', [], 2)} />)
    rerender(<PresentationStage state={standingsState('leaderboard', currentBoard, 2)} />)
    await act(async () => { vi.advanceTimersByTime(1200) })
    rerender(<PresentationStage state={standingsState('question', [], 3)} />)
    expect(screen.getByRole('heading', { name: 'Question 3' })).toBeVisible()
    expect(container.querySelector('.animated-leaderboard')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    rerender(<PresentationStage state={standingsState('finished', previousBoard, 3)} />)
    expect(container.querySelector('.final-results')).toBeInTheDocument()
    expect(container.querySelector('.animated-leaderboard')).toBeNull()
    expect(container.querySelector('.leaderboard-commentary')).toBeNull()
  })
})
