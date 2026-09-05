import type { FinalAward } from './finalAwards'
import { ordinalRank } from './leaderboardMovement'

const labels = { 'most-correct': 'Most Correct', 'quickest-thinker': 'Quickest Thinker', 'biggest-climber': 'Biggest Climber' }
const marks = { 'most-correct': '✓', 'quickest-thinker': 'ϟ', 'biggest-climber': '↗' }

function AwardCard({ award, currentPlayerId }: { award: FinalAward; currentPlayerId?: string }) {
  const names = award.winners.map((winner) => winner.nickname)
  const shared = names.length > 1
  const abbreviated = names.length > 2
  const name = abbreviated ? `${names[0]} + ${names.length - 1} others` : names.join(' & ')
  const metric = award.kind === 'most-correct' ? `${award.correctAnswerCount} correct${shared ? ' each' : ''}`
    : award.kind === 'quickest-thinker' ? `${(award.averageResponseMs / 1000).toFixed(1)}s average${shared ? ' each' : ''}`
    : `↑ ${award.places} ${award.places === 1 ? 'place' : 'places'}${shared ? ' each' : ''}`
  const current = award.winners.some((winner) => winner.playerId === currentPlayerId)
  return <article className={`final-award${current ? ' is-current' : ''}`} aria-label={labels[award.kind]}>
    <h3><span aria-hidden="true">{marks[award.kind]}</span>{labels[award.kind]}</h3>
    <p className="final-award__winner"><span aria-hidden={abbreviated || undefined}>{name}</span>{abbreviated && <span className="sr-only">{names.join(', ')}</span>}</p>
    {award.kind === 'biggest-climber' && !shared && <p className="final-award__ranks">{ordinalRank(award.winners[0].firstRank)} → {ordinalRank(award.winners[0].finalRank)}</p>}
    <p className="final-award__metric">{metric}</p>
    {award.kind === 'biggest-climber' && shared && <p className="sr-only">{award.winners.map((winner) => `${winner.nickname}: ${ordinalRank(winner.firstRank)} to ${ordinalRank(winner.finalRank)}`).join('; ')}.</p>}
    {current && <span className="sr-only">You earned this award.</span>}
  </article>
}

export function FinalAwardCards({ awards, currentPlayerId, heading = 'Tonight’s awards' }: { awards: readonly FinalAward[]; currentPlayerId?: string; heading?: string }) {
  if (!awards.length) return null
  return <section className="final-awards" aria-label={heading}>
    <h2>{heading}</h2>
    <div className="final-awards__cards">{awards.map((award) => <AwardCard key={award.kind} award={award} currentPlayerId={currentPlayerId} />)}</div>
  </section>
}
