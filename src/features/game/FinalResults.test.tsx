import { render, screen } from '@testing-library/react'
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

  it('keeps Head-to-Head draw and winner outcomes distinct from the podium', () => {
    const competitors = [
      { competitorId: 'one', displayName: 'Debs', displayOrder: 0 as const, claimed: true, connected: true, playerId: 'one', totalScore: 2, correctAnswerCount: 2 },
      { competitorId: 'two', displayName: 'Roger', displayOrder: 1 as const, claimed: true, connected: true, playerId: 'two', totalScore: 2, correctAnswerCount: 2 },
    ]
    const { rerender } = render(<HeadToHeadFinal competitors={competitors} variant="presentation" />)
    expect(screen.getByRole('heading', { name: 'It’s a draw!' })).toBeVisible()
    rerender(<HeadToHeadFinal competitors={[competitors[0], { ...competitors[1], totalScore: 1 }]} variant="presentation" />)
    expect(screen.getByRole('heading', { name: 'Debs wins!' })).toBeVisible()
  })
})
