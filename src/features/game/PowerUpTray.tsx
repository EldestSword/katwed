import { POWER_UP_IDS, type AnswerPowerUpId, type PersonalPowerUpState, type SafeQuestion } from '../../types/domain'
import { POWER_UP_NAMES, powerUpUnavailableReason } from './powerUps'
import './powerUps.css'

export function PowerUpTray({ question, state, selected, busy, disabled, onSelect, onFiftyFifty }: {
  question: SafeQuestion
  state: PersonalPowerUpState
  selected: AnswerPowerUpId | null
  busy: boolean
  disabled: boolean
  onSelect(value: AnswerPowerUpId | null): void
  onFiftyFifty(): void
}) {
  const current = state.uses.find(use => use.questionId === question.id)
  if (question.buzzInEnabled) return null
  if (current) return <p className="power-up-status">{POWER_UP_NAMES[current.powerUp]} used</p>
  if (state.uses.length === 3) return null
  return <section className="power-up-tray" aria-label="Power-Ups">
    <p className="eyebrow">Power-Ups · one per question</p>
    <div className="power-up-tray__cards">{POWER_UP_IDS.map(id => {
      const used = state.uses.some(use => use.powerUp === id)
      const reason = powerUpUnavailableReason(id, question)
      const armed = selected === id
      return <button type="button" key={id} aria-pressed={id === 'fifty-fifty' ? undefined : armed} disabled={disabled || busy || used || Boolean(reason) || (id === 'fifty-fifty' && selected !== null)} onClick={() => id === 'fifty-fifty' ? onFiftyFifty() : onSelect(armed ? null : id)}>
        <b aria-hidden="true">{id === 'double-up' ? '×2' : id === 'fast-five' ? '−5s' : '½'}</b>
        <strong>{POWER_UP_NAMES[id]}</strong>
        <small>{used ? 'Used' : reason ?? (armed ? 'Armed · tap to clear' : busy && id === 'fifty-fifty' ? 'Activating…' : id === 'fifty-fifty' ? 'Use now' : 'Available')}</small>
      </button>
    })}</div>
    <p className="power-up-tray__hint" role="status">{selected === 'double-up' ? 'Double Up armed. Positive points from this answer will be doubled.' : selected === 'fast-five' ? 'Fast Five armed. Your score will use a response time 5 seconds faster.' : 'Double Up boosts positive points; 50/50 leaves two choices; Fast Five improves scoring time.'}</p>
  </section>
}
