import type { HeadToHeadGameCompetitor, HeadToHeadResult } from '../../types/domain'

interface HeadToHeadResultCopy {
  role: 'Official question' | 'Playing along'
  status: '✓ Correct' | '✕ Incorrect' | 'Skipped'
  consequence: '+1 point' | '0 points' | 'No point — play-along' | 'Play-along'
}

function headToHeadResultCopy(result: HeadToHeadResult): HeadToHeadResultCopy {
  if (result.assigned) {
    return result.status === 'correct'
      ? { role: 'Official question', status: '✓ Correct', consequence: '+1 point' }
      : { role: 'Official question', status: '✕ Incorrect', consequence: '0 points' }
  }
  if (result.status === 'skipped') {
    return { role: 'Playing along', status: 'Skipped', consequence: 'Play-along' }
  }
  return {
    role: 'Playing along',
    status: result.status === 'correct' ? '✓ Correct' : '✕ Incorrect',
    consequence: 'No point — play-along',
  }
}

export function HeadToHeadResults({
  competitors,
  results,
}: {
  competitors: HeadToHeadGameCompetitor[]
  results: HeadToHeadResult[]
}) {
  const resultsByCompetitor = new Map(results.map((result) => [result.competitorId, result]))
  return (
    <div className="head-to-head-results">
      {[...competitors].sort((left, right) => left.displayOrder - right.displayOrder).map((competitor) => {
        const result = resultsByCompetitor.get(competitor.competitorId)
        if (!result) return null
        const copy = headToHeadResultCopy(result)
        return (
          <article key={competitor.competitorId} aria-label={`${competitor.displayName} result`}>
            <strong>{competitor.displayName}</strong>
            <span className="head-to-head-result__role">{copy.role}</span>
            <span className="head-to-head-result__status">{copy.status}</span>
            <span className="head-to-head-result__consequence">{copy.consequence}</span>
          </article>
        )
      })}
    </div>
  )
}
