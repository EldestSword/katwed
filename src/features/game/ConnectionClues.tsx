import type { SafeQuestion } from '../../types/domain'

export function ConnectionClues({ question, reveal = false }: { question: Extract<SafeQuestion, { type: 'connections' }>; reveal?: boolean }) {
  return <section className="connection-clues" data-dense={question.visibleClues.length > 4 || question.visibleClues.some(clue => clue.text.length > 100)} aria-label="Connection clues">
    <ol>{question.visibleClues.map((clue, index) => <li key={clue.id}><span>Clue {index + 1}</span><strong>{clue.text}</strong></li>)}</ol>
    {!reveal && <p className="connection-stage" role="status"><span>Clue {question.revealedClueCount} of {question.totalClues}</span><strong>{question.availablePoints.toLocaleString('en-GB')} points available</strong></p>}
  </section>
}
