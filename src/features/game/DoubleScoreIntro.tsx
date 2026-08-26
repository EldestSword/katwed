import { GameBadge } from '../../components/design-system/GameBadge'
import { BrandBang } from '../../components/design-system/BrandBang'

export function DoubleScoreIntro({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`double-score-intro ${compact ? 'double-score-intro--compact' : ''}`} aria-live="polite">
      <div className="double-score-intro__motif" aria-hidden="true"><BrandBang /><BrandBang /><BrandBang /></div>
      <p className="eyebrow">Next question</p>
      <h1 aria-label="DOUBLE SCORE!"><span>Double</span><span>Score</span></h1>
      <p>Twice the points. Same nerve.</p>
    </section>
  )
}

export function DoubleScoreBadge() {
  return <GameBadge tone="accent" large className="double-score-badge">2x points</GameBadge>
}
