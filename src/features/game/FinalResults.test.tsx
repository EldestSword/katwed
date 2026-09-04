import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FinalResults, HeadToHeadFinal } from './FinalResults'

const entries = [
  { playerId: 'one', nickname: 'Debs', totalScore: 8420, correctAnswerCount: 8, totalCorrectResponseMs: 100, rank: 1 },
  { playerId: 'two', nickname: 'Roger', totalScore: 7930, correctAnswerCount: 7, totalCorrectResponseMs: 110, rank: 2 },
  { playerId: 'three', nickname: 'Jaki', totalScore: 7510, correctAnswerCount: 7, totalCorrectResponseMs: 120, rank: 3 },
  { playerId: 'four', nickname: 'Phil', totalScore: 6330, correctAnswerCount: 6, totalCorrectResponseMs: 130, rank: 4 },
]

describe('FinalResults', () => {
  it('creates winner, podium and remaining-standing hierarchy', () => {
    render(<FinalResults entries={entries} variant="presentation" />)
    expect(screen.getByRole('heading', { name: 'Debs wins!' })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Top final positions' })).toHaveTextContent('Debs')
    expect(screen.getByRole('list', { name: 'Top final positions' })).toHaveTextContent('Roger')
    expect(screen.getByRole('list', { name: 'Top final positions' })).toHaveTextContent('Jaki')
    expect(screen.getByRole('list', { name: 'Leaderboard' })).toHaveTextContent('Phil')
  })

  it('announces joint winners without selecting one tied player', () => {
    render(<FinalResults entries={[entries[0], { ...entries[1], rank: 1, totalScore: 8420 }]} variant="presentation" />)
    expect(screen.getByRole('heading', { name: 'Joint winners!' })).toBeVisible()
    expect(screen.getByText('A shared first place')).toBeVisible()
  })

  it.each([0, 1, 2, 3])('renders %i awards without empty cards or changing the podium', (count) => {
    const rows = entries.map((entry, index) => ({ ...entry, correctAnswerCount: count === 0 ? 0 : count === 1 ? 1 : 4 - index }))
    const { container } = render(<FinalResults entries={rows} variant="presentation" awardsBaseline={count === 3 ? new Map([['two', 8]]) : null} />)
    expect(container.querySelectorAll('.final-award')).toHaveLength(count)
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' }) !== null).toBe(count > 0)
    expect(within(screen.getByRole('list', { name: 'Top final positions' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('list', { name: 'Leaderboard' })).toHaveTextContent('Phil')
    if (count) expect(container.querySelector('.final-awards')?.previousElementSibling).toHaveClass('final-podium')
  })

  it('shows two tied names fairly and abbreviates larger ties with all names accessible', () => {
    const rows = entries.map((entry) => ({ ...entry, correctAnswerCount: 17 }))
    const { rerender } = render(<FinalResults entries={rows.slice(0, 2)} variant="player" />)
    expect(screen.getByRole('article', { name: 'Most Correct' })).toHaveTextContent('Debs & Roger')
    expect(screen.getByRole('article', { name: 'Most Correct' })).toHaveTextContent('17 correct each')
    rerender(<FinalResults entries={rows} variant="player" />)
    const card = screen.getByRole('article', { name: 'Most Correct' })
    expect(within(card).getByText('Debs + 3 others')).toHaveAttribute('aria-hidden', 'true')
    expect(within(card).getByText('Debs, Roger, Jaki, Phil')).toHaveClass('sr-only')
  })

  it('formats seconds and single/shared climbs truthfully, highlighting every current-player tie', () => {
    const rows = entries.map((entry) => ({ ...entry, correctAnswerCount: 3, totalCorrectResponseMs: 9600 }))
    const { rerender } = render(<FinalResults entries={rows} variant="player" currentPlayerId="three" awardsBaseline={new Map([['three', 9]])} />)
    expect(screen.getByRole('article', { name: 'Quickest Thinker' })).toHaveTextContent('3.2s average each')
    expect(screen.getByRole('article', { name: 'Quickest Thinker' })).toHaveClass('is-current')
    expect(screen.getByRole('article', { name: 'Biggest Climber' })).toHaveTextContent('9th → 3rd')
    rerender(<FinalResults entries={rows} variant="player" currentPlayerId="three" awardsBaseline={new Map([['two', 8], ['three', 9]])} />)
    const climb = screen.getByRole('article', { name: 'Biggest Climber' })
    expect(climb).toHaveTextContent('Roger & Jaki')
    expect(climb).toHaveTextContent('↑ 6 places each')
    expect(climb).toHaveTextContent('Roger: 8th to 2nd; Jaki: 9th to 3rd')
    expect(climb).toHaveClass('is-current')
  })

  it('keeps Head-to-Head draw and winner outcomes distinct from the podium', () => {
    const competitors = [
      { competitorId: 'one', displayName: 'Debs', displayOrder: 0 as const, claimed: true, connected: true, playerId: 'one', totalScore: 2, correctAnswerCount: 2 },
      { competitorId: 'two', displayName: 'Roger', displayOrder: 1 as const, claimed: true, connected: true, playerId: 'two', totalScore: 2, correctAnswerCount: 2 },
    ]
    const { rerender } = render(<HeadToHeadFinal competitors={competitors} variant="presentation" />)
    expect(screen.getByRole('heading', { name: 'It’s a draw!' })).toBeVisible()
    rerender(<HeadToHeadFinal competitors={[competitors[0], { ...competitors[1], totalScore: 1 }]} variant="presentation" />)
    expect(screen.getByRole('heading', { name: 'Debs wins!' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
  })
})
