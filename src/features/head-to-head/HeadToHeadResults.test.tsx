import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HeadToHeadGameCompetitor, HeadToHeadResult, HeadToHeadResultStatus } from '../../types/domain'
import { HeadToHeadResults } from './HeadToHeadResults'

const competitors: HeadToHeadGameCompetitor[] = [
  { competitorId: 'jess', displayName: 'Jess', displayOrder: 0, claimed: true, connected: true, playerId: 'p1', totalScore: 0, correctAnswerCount: 0 },
  { competitorId: 'ross', displayName: 'Ross', displayOrder: 1, claimed: true, connected: true, playerId: 'p2', totalScore: 0, correctAnswerCount: 0 },
]

function result(competitorId: string, assigned: boolean, status: HeadToHeadResultStatus): HeadToHeadResult {
  return { competitorId, assigned, status, pointsAwarded: assigned && status === 'correct' ? 1 : 0 }
}

describe('HeadToHeadResults', () => {
  it.each([
    ['correct', 'correct', '✓ Correct', '+1 point', '✓ Correct', 'No point — play-along'],
    ['incorrect', 'correct', '✕ Incorrect', '0 points', '✓ Correct', 'No point — play-along'],
    ['correct', 'incorrect', '✓ Correct', '+1 point', '✕ Incorrect', 'No point — play-along'],
    ['incorrect', 'skipped', '✕ Incorrect', '0 points', 'Skipped', 'Play-along'],
  ] as const)(
    'labels assigned %s and play-along %s without ambiguous scoring language',
    (assignedStatus, playAlongStatus, officialLabel, officialPoints, playAlongLabel, playAlongPoints) => {
      render(<HeadToHeadResults competitors={competitors} results={[
        result('ross', false, playAlongStatus),
        result('jess', true, assignedStatus),
      ]} />)

      const cards = screen.getAllByRole('article')
      expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Jess result', 'Ross result'])

      const official = within(screen.getByRole('article', { name: 'Jess result' }))
      expect(official.getByText('Official question')).toBeVisible()
      expect(official.getByText(officialLabel)).toBeVisible()
      expect(official.getByText(officialPoints)).toBeVisible()

      const playAlong = within(screen.getByRole('article', { name: 'Ross result' }))
      expect(playAlong.getByText('Playing along')).toBeVisible()
      expect(playAlong.getByText(playAlongLabel)).toBeVisible()
      expect(playAlong.getByText(playAlongPoints)).toBeVisible()
      expect(screen.queryByText(/Also got it right/i)).not.toBeInTheDocument()
    },
  )
})
