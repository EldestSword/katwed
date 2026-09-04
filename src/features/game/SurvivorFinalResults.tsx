import { BrandBang } from '../../components/design-system/BrandBang'
import { Leaderboard } from '../../components/Leaderboard'
import type { Player } from '../../types/domain'
import { calculateFinalAwards } from './finalAwards'
import { FinalAwardCards } from './FinalAwardCards'
import { survivorStandings, survivorStatusLabel } from './survivor'
import { applyTieBreakerWinner } from './tieBreakers'

export function SurvivorFinalResults({ players, currentPlayerId, variant, tieBreakerWinnerPlayerId }: {
  players: readonly Player[]
  currentPlayerId?: string
  variant: 'player' | 'presentation'
  tieBreakerWinnerPlayerId?: string | null
}) {
  const entries = applyTieBreakerWinner(survivorStandings(players), tieBreakerWinnerPlayerId)
  const alive = entries.filter((entry) => (entry.survivorLivesRemaining ?? 0) > 0)
  const title = alive.length === 0 ? 'TOTAL WIPEOUT' : alive.length === 1 ? 'LAST PLAYER STANDING' : 'SURVIVOR WINNER'
  const subtitle = alive.length === 0 ? 'Nobody survived.' : entries[0]?.nickname ?? 'Final result'
  const podium = entries.filter((entry) => entry.rank <= 3)
  const remaining = entries.filter((entry) => entry.rank > 3)
  return <div className={`final-results survivor-final final-results--${variant}`}>
    <div className="final-results__celebration" aria-hidden="true"><BrandBang /><i /><i /><i /><i /></div>
    <p className="eyebrow">Final survival standings</p>
    <h1>{title}</h1>
    <p className="survivor-final__winner">{subtitle}</p>
    {alive.length === 0 && tieBreakerWinnerPlayerId && entries[0] && <p className="final-results__tie">{entries[0].nickname} wins the tie-breaker.</p>}
    <ol className="final-podium" aria-label="Top final survival positions">
      {podium.map((entry) => <li className={entry.playerId === currentPlayerId ? 'is-current' : ''} data-rank={entry.rank} key={entry.playerId}>
        <span className="final-podium__rank">{entry.rank}</span><strong>{entry.nickname}</strong>
        <span>{survivorStatusLabel(entry, true)} · {entry.totalScore.toLocaleString('en-GB')} points</span>
      </li>)}
    </ol>
    <FinalAwardCards awards={calculateFinalAwards(entries, null)} currentPlayerId={currentPlayerId} heading="Quiz honours" />
    {remaining.length > 0 && <Leaderboard entries={remaining} currentPlayerId={currentPlayerId} variant={variant} />}
  </div>
}
