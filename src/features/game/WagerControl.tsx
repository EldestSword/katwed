import { useId } from 'react'
import type { WagerPercent } from '../../types/domain'
import { WAGER_PERCENTAGES, wagerStake } from '../scoring/wager'
import '../../styles/wager.css'

export function WagerControl({ points, value, disabled, onChange }: {
  points: number; value: WagerPercent; disabled: boolean; onChange(percent: WagerPercent): void
}) {
  const id = useId()
  return <fieldset className="wager-control" disabled={disabled} aria-describedby={`${id}-help`}>
    <legend>Your wager</legend>
    <div className="wager-control__options">{WAGER_PERCENTAGES.map(percent => <label key={percent}>
      <input type="radio" name={id} value={percent} checked={value === percent} onChange={() => onChange(percent)} />
      <span>{percent === 0 ? 'No wager' : `${percent}% · ${wagerStake(points, percent).toLocaleString('en-GB')} pts`}</span>
    </label>)}</div>
    <p id={`${id}-help`}>Only a fully correct answer wins your wager.</p>
    <p className="wager-stake" aria-live="polite">{value ? `Wager: +/− ${wagerStake(points, value).toLocaleString('en-GB')} pts` : 'No extra points at risk'}</p>
  </fieldset>
}

export function WagerSummary({ points, percent }: { points: number; percent: WagerPercent }) {
  return <p className="wager-summary">Wager: <strong>{wagerStake(points, percent).toLocaleString('en-GB')} points</strong> <span>({percent}%)</span></p>
}

export function WagerIndicator({ points }: { points: number }) {
  return <span className="wager-indicator">Wager question <span>· Up to {wagerStake(points, 100).toLocaleString('en-GB')} pts at risk</span></span>
}
