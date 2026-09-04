import { BrandBang } from '../../components/design-system/BrandBang'
import type { ReactNode } from 'react'
import { Leaderboard } from '../../components/Leaderboard'
import type { HeadToHeadGameCompetitor, LeaderboardEntry } from '../../types/domain'
import { calculateFinalAwards, type FinalAwardsBaseline } from './finalAwards'
import { FinalAwardCards } from './FinalAwardCards'

export function FinalResults({
  entries,
  currentPlayerId,
  variant,
  awardsBaseline = null,
  heading,
  standingsLabel = 'Final standings',
  awardContent,
  awardEntries,
}: {
  entries: LeaderboardEntry[]
  currentPlayerId?: string
  variant: 'player' | 'presentation'
  awardsBaseline?: FinalAwardsBaseline | null
  heading?: string
  standingsLabel?: string
  awardContent?: ReactNode
  awardEntries?: LeaderboardEntry[]
}) {
  const awards = calculateFinalAwards(awardEntries ?? entries, awardsBaseline)
  const podium = entries.filter((entry) => entry.rank <= 3)
  const remaining = entries.filter((entry) => entry.rank > 3)
  const winners = entries.filter((entry) => entry.rank === 1)
  const winnerHeading = winners.length > 1 ? 'Joint winners!' : winners[0] ? `${winners[0].nickname} wins!` : 'Final results'

  return (
    <div className={`final-results final-results--${variant}`}>
      <div className="final-results__celebration" aria-hidden="true"><BrandBang /><i /><i /><i /><i /></div>
      <p className="eyebrow">{standingsLabel}</p>
      <h1>{heading ?? winnerHeading}</h1>
      {winners.length > 1 && <p className="final-results__tie">A shared first place</p>}
      <ol className="final-podium" aria-label="Top final positions">
        {podium.map((entry) => (
          <li className={entry.playerId === currentPlayerId ? 'is-current' : ''} data-rank={entry.rank} key={entry.playerId}>
            <span className="final-podium__rank">{entry.rank}</span>
            <strong>{entry.nickname}</strong>
            <span>{entry.totalScore.toLocaleString()} points</span>
          </li>
        ))}
      </ol>
      {awardContent === undefined ? <FinalAwardCards awards={awards} currentPlayerId={currentPlayerId} /> : awardContent}
      {remaining.length > 0 && <Leaderboard entries={remaining} currentPlayerId={currentPlayerId} variant={variant} />}
    </div>
  )
}

export function HeadToHeadFinal({
  competitors,
  variant,
}: {
  competitors: HeadToHeadGameCompetitor[]
  variant: 'player' | 'presentation'
}) {
  const draw = competitors.length >= 2 && competitors[0].totalScore === competitors[1].totalScore
  const winner = draw ? null : [...competitors].sort((left, right) => right.totalScore - left.totalScore)[0]
  return (
    <div className={`head-to-head-final head-to-head-final--${variant}`}>
      <p className="eyebrow">Head-to-Head complete</p>
      <h1>{draw ? 'It’s a draw!' : `${winner?.displayName ?? 'Winner'} wins!`}</h1>
      <div className="head-to-head-final__competitors">
        {competitors.map((competitor) => (
          <article className={winner?.competitorId === competitor.competitorId ? 'is-winner' : ''} aria-label={`${competitor.displayName} final score`} key={competitor.competitorId}>
            <span>{winner?.competitorId === competitor.competitorId ? 'Winner' : draw ? 'Draw' : 'Final score'}</span>
            <strong>{competitor.displayName}</strong>
            <b>{competitor.totalScore}</b>
          </article>
        ))}
      </div>
    </div>
  )
}
