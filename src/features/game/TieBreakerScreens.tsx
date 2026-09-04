import { useEffect, useState, type FormEvent } from 'react'
import { useCountdown } from '../../hooks/useCountdown'
import type { HostTieBreakerState, Player, SafeTieBreakerState } from '../../types/domain'
import { normaliseTieBreakerValue } from './tieBreakers'

function playerName(players: readonly Pick<Player, 'id' | 'nickname'>[], id: string | null | undefined): string {
  return players.find((player) => player.id === id)?.nickname ?? 'A finalist'
}
function finalistNames(players: readonly Pick<Player, 'id' | 'nickname'>[], ids: readonly string[]): string {
  const names = ids.map((id) => playerName(players, id))
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function valueWithUnit(value: string | null | undefined, unit: string): string {
  return value === null || value === undefined ? 'No answer' : `${value} ${unit}`
}

export function TieBreakerPlayer({ state, players, playerId, alreadySubmitted, working, onSubmit }: {
  state: SafeTieBreakerState
  players: readonly Player[]
  playerId: string
  alreadySubmitted: boolean
  working: boolean
  onSubmit(value: string): Promise<void>
}) {
  const [value, setValue] = useState('')
  const [validation, setValidation] = useState('')
  const remaining = useCountdown(state.status === 'question' ? state.closesAt : null)
  const contender = state.contenderPlayerIds.includes(playerId)
  const ownResult = state.results?.find((entry) => entry.playerId === playerId)
  useEffect(() => { setValue(''); setValidation('') }, [state.questionId])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const canonical = normaliseTieBreakerValue(value)
    if (!canonical) { setValidation('Enter a valid number.'); return }
    setValidation('')
    void onSubmit(canonical)
  }

  if (state.status === 'result') return <section className="game-state-card tiebreaker-player tiebreaker-result" aria-live="polite">
    <p className="eyebrow">Tie-breaker result · Round {state.round}</p>
    <h1>Correct value</h1>
    <strong className="tiebreaker-correct-value">{valueWithUnit(state.correctAnswer, state.unit)}</strong>
    {ownResult && <div className="tiebreaker-own-result"><span>Your answer</span><strong>{valueWithUnit(ownResult.value, state.unit)}</strong><small>{ownResult.absoluteError === null ? 'No answer submitted' : `${ownResult.absoluteError} away · ${(ownResult.responseTimeMs! / 1_000).toFixed(1)}s`}</small></div>}
    <p>{state.winnerPlayerId ? `${playerName(players, state.winnerPlayerId)} wins the tie-breaker` : 'Still tied. Another one is coming.'}</p>
  </section>

  if (!contender) return <section className="game-state-card tiebreaker-player tiebreaker-spectator" aria-live="polite">
    <p className="eyebrow">Tie-breaker · Round {state.round}</p>
    <h1>{finalistNames(players, state.contenderPlayerIds)} are playing for the win.</h1>
    <p>Waiting for their answers…</p>
  </section>

  return <section className="game-state-card tiebreaker-player" aria-live="polite">
    <p className="eyebrow">Tie-breaker · Round {state.round}</p>
    <h1>{state.prompt}</h1>
    {alreadySubmitted ? <div className="player-waiting__status"><span className="waiting-tick" aria-hidden="true">✓</span><div><p className="eyebrow">Submitted</p><h2>Answer locked</h2></div><p>Waiting for the other finalists…</p></div> : <form onSubmit={submit}>
      <label htmlFor="tiebreaker-value">Your estimate <span>{state.unit}</span></label>
      <div className="tiebreaker-input-row"><input id="tiebreaker-value" inputMode="decimal" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} aria-describedby={validation ? 'tiebreaker-error' : undefined} /><span>{state.unit}</span></div>
      {validation && <p id="tiebreaker-error" role="alert">{validation}</p>}
      <div className="tiebreaker-player__footer"><strong aria-label={`${remaining} seconds remaining`}>{remaining}</strong><button className="button button--primary" type="submit" disabled={working || remaining <= 0}>{working ? 'Locking in…' : 'Lock in'}</button></div>
    </form>}
  </section>
}

export function TieBreakerPresentation({ state, players, compact = false }: {
  state: SafeTieBreakerState
  players: readonly Player[]
  compact?: boolean
}) {
  const remaining = useCountdown(state.status === 'question' ? state.closesAt : null)
  if (state.status === 'question') return <div className="presentation-tiebreaker">
    <p className="eyebrow">Tie-breaker · Round {state.round}</p>
    <h1>{finalistNames(players, state.contenderPlayerIds)}</h1>
    <p className="presentation-tiebreaker__versus">playing for the win</p>
    <h2>{state.prompt}</h2>
    <p>Answer in {state.unit}</p>
    <div className="presentation-tiebreaker__status"><strong>{remaining}</strong><span>{state.submittedCount} / {state.contenderPlayerIds.length} locked in</span></div>
  </div>
  return <div className="presentation-tiebreaker presentation-tiebreaker--result">
    <p className="eyebrow">Tie-breaker result · Round {state.round}</p>
    <h1>{state.winnerPlayerId ? `${playerName(players, state.winnerPlayerId)} wins the tie-breaker` : 'Still tied'}</h1>
    <p>Correct answer</p><strong className="tiebreaker-correct-value">{valueWithUnit(state.correctAnswer, state.unit)}</strong>
    {!compact && <div className="presentation-tiebreaker__results">{state.results?.map((entry) => <article key={entry.playerId}><strong>{entry.nickname}</strong><span>{valueWithUnit(entry.value, state.unit)}</span><small>{entry.absoluteError === null ? 'No answer' : `${entry.absoluteError} away · ${(entry.responseTimeMs! / 1_000).toFixed(1)}s`}</small></article>)}</div>}
    {!state.winnerPlayerId && <p>Another tie-breaker is coming.</p>}
  </div>
}

export function HostTieBreakerPanel({ state, players, working, onResolve, onNext, onFinal }: {
  state: HostTieBreakerState
  players: readonly Player[]
  working: boolean
  onResolve(): void
  onNext(): void
  onFinal(): void
}) {
  const remaining = useCountdown(state.status === 'question' ? state.closesAt : null)
  if (state.status === 'question') return <section className="controller-tiebreaker">
    <p className="eyebrow">Tie-breaker · Round {state.round}</p><h2>{state.prompt}</h2><p>Answer in {state.unit}</p>
    <dl>{state.contenderPlayerIds.map((id) => <div key={id}><dt>{playerName(players, id)}</dt><dd>{state.submittedPlayerIds?.includes(id) ? 'Submitted' : 'Waiting'}</dd></div>)}</dl>
    <p><strong>{remaining}s</strong> · {state.submittedCount} / {state.contenderPlayerIds.length} locked in</p>
    <button className="button button--primary" disabled={working} type="button" onClick={onResolve}>Close tie-breaker now</button>
  </section>
  return <section className="controller-tiebreaker controller-tiebreaker--result">
    <p className="eyebrow">Tie-breaker result · Round {state.round}</p><h2>{state.winnerPlayerId ? `${playerName(players, state.winnerPlayerId)} wins` : 'Still tied'}</h2>
    <p><strong>Correct answer:</strong> {valueWithUnit(state.correctAnswer, state.unit)}</p>
    <dl>{state.results?.map((entry) => <div key={entry.playerId}><dt>{entry.nickname}</dt><dd>{entry.value === null ? 'No answer' : `${entry.value} · ${entry.absoluteError} away · ${(entry.responseTimeMs! / 1_000).toFixed(1)}s`}</dd></div>)}</dl>
    {state.sourceTitle && <p className="controller-tiebreaker__source">Source: <a href={state.sourceUrl} target="_blank" rel="noreferrer">{state.sourceTitle}</a>{state.sourceNote ? ` · ${state.sourceNote}` : ''}</p>}
    {state.winnerPlayerId
      ? <button className="button button--primary" disabled={working} type="button" onClick={onFinal}>Reveal final results</button>
      : <button className="button button--primary" disabled={working} type="button" onClick={onNext}>Next tie-breaker</button>}
  </section>
}
