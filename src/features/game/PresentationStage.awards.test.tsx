import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { currentBoard, standingsState } from '../../test/leaderboardFixtures'
import { PresentationStage } from './PresentationStage'

describe('Presentation final awards', () => {
  it.each([false, true])('keeps first-question history through the final reveal (compact %s)', (compact) => {
    const first = { ...standingsState('leaderboard'), questionOpenedAt: '2026-09-04T10:00:00Z' }
    const { rerender } = render(<PresentationStage state={first} compact={compact} />)
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
    rerender(<PresentationStage state={standingsState('question', [], 2)} compact={compact} />)
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
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
