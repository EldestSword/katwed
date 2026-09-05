import type { ConnectionsQuestion, SafeQuestion } from '../../types/domain'

export function HostConnectionsControls({ question, definition, disabled, onReveal }: {
  question: Extract<SafeQuestion, { type: 'connections' }>; definition: ConnectionsQuestion; disabled: boolean; onReveal(): void
}) {
  const next = definition.clues[question.revealedClueCount]
  return <section className="host-connections" aria-label="Connections controls">
    <p>Clue {question.revealedClueCount} of {question.totalClues} · <strong>{question.availablePoints.toLocaleString('en-GB')} points available</strong></p>
    {next ? <div><p className="eyebrow">Next clue · private</p><strong>{next.text}</strong></div> : <p>All clues are visible.</p>}
    <button type="button" className="button button--secondary" disabled={disabled || !next} onClick={onReveal}>Reveal next clue</button>
  </section>
}
