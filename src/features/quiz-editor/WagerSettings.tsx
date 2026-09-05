import type { Question } from '../../types/domain'
import { WAGER_PERCENTAGES, wagerStake } from '../scoring/wager'
import '../../styles/wager.css'

export function WagerSettings({ question, update }: { question: Question; update(change: (question: Question) => Question): void }) {
  return <div className="wager-settings">
    <p className="eyebrow">Wager question</p>
    <label><input type="checkbox" checked={question.wagerEnabled ?? false} onChange={event => update(current => ({ ...current, wagerEnabled: event.target.checked }))} /> Let players risk extra points</label>
    <p className="settings-note">Players can risk 25%, 50% or 100% of this question's base points. A fully correct answer wins the stake; anything else loses it.</p>
    {question.wagerEnabled && <div className="wager-settings__preview" aria-label="Wager preview">
      <p>Base question: <strong>{question.points.toLocaleString('en-GB')} pts</strong></p>
      <p>Wager options</p>
      <ul>{WAGER_PERCENTAGES.map(percent => <li key={percent}>{percent ? `${percent}% · ${wagerStake(Math.max(0, Math.floor(question.points || 0)), percent).toLocaleString('en-GB')} pts` : 'No wager'}</li>)}</ul>
      <p className="settings-note">The stake is added or lost after ordinary scoring. Double Score does not double the stake. Scores can go below zero.</p>
    </div>}
  </div>
}
