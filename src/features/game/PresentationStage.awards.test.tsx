import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentBoard, roundIntroState, standingsState } from '../../test/leaderboardFixtures'
import { PresentationStage } from './PresentationStage'

describe('Presentation final awards', () => {
  afterEach(() => vi.useRealTimers())

  it.each([false, true])('keeps animation and first-question award history across round intros (compact %s)', async (compact) => {
    vi.useFakeTimers()
    const first = { ...standingsState('leaderboard'), questionOpenedAt: '2026-09-04T10:00:00Z' }
    const { container, rerender } = render(<PresentationStage state={first} compact={compact} />)
    rerender(<PresentationStage state={roundIntroState()} compact={compact} />)
    expect(screen.getByRole('heading', { name: 'Next round' })).toBeVisible()
    expect(container.querySelector('.animated-leaderboard')).toBeNull()
    expect(container.querySelector('.leaderboard-commentary')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
    rerender(<PresentationStage state={standingsState('question', [], 2)} compact={compact} />)
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
    rerender(<PresentationStage state={standingsState('leaderboard', currentBoard, 2)} compact={compact} />)
    expect(container.querySelector('.animated-leaderboard')).toHaveAttribute('data-reveal-stage', 'holding')
    expect(container.querySelector('[data-player-id="jaki"] .leaderboard__points [aria-hidden]')).toHaveTextContent('4,400 points')
    await act(async () => { vi.advanceTimersByTime(2600) })
    expect(screen.getByRole('status')).toHaveTextContent('Jaki takes the lead!')
    rerender(<PresentationStage state={standingsState('finished', currentBoard, 5)} compact={compact} />)
    expect(screen.getByRole('heading', { name: 'Jaki wins!' })).toBeVisible()
    const card = screen.getByRole('article', { name: 'Biggest Climber' })
    expect(card).toHaveTextContent('3rd → 1st')
    expect(card).toHaveTextContent('↑ 2 places')
    expect(card.closest('.final-results--presentation')).not.toBeNull()
  })

  it('omits climber after a refresh at finished while retaining stat-based awards', () => {
    render(<PresentationStage state={standingsState('finished', currentBoard, 5)} />)
    expect(screen.queryByRole('article', { name: 'Biggest Climber' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Most Correct' })).toBeVisible()
  })
})
