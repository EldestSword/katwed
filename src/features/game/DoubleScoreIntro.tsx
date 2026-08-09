export function DoubleScoreIntro({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`double-score-intro ${compact ? 'double-score-intro--compact' : ''}`} aria-live="polite">
      <p className="eyebrow">Next question</p>
      <h1>DOUBLE SCORE!</h1>
      <p>Worth twice the configured points.</p>
    </section>
  )
}

export function DoubleScoreBadge() {
  return <span className="double-score-badge">2x points</span>
}
