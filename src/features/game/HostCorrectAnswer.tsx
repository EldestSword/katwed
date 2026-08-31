import type { Question, RosterMember } from '../../types/domain'
import { formatHostAnswer } from './hostAnswerFormatting'

export function HostCorrectAnswer({ question, roster }: { question: Question; roster: readonly RosterMember[] }) {
  const answer = formatHostAnswer(question, roster)

  return (
    <section className="controller-correct-answer" aria-labelledby="controller-correct-answer-heading">
      <div className="controller-section-heading">
        <div><p className="eyebrow">Private host view</p><h2 id="controller-correct-answer-heading">Current correct answer</h2></div>
        <span>Host only</span>
      </div>
      <p><span>{answer.label}</span><strong>{answer.value}</strong></p>
      {answer.detail && <small>{answer.detail}</small>}
    </section>
  )
}
