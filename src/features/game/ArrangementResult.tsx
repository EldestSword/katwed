import type { PlayerAnswerPayload, SafeQuestion } from '../../types/domain'
import { itemLabel, matchingLabels } from '../questions/arrangementQuestions'

export function ArrangementResult({ question, answer, label }: { question: SafeQuestion; answer: PlayerAnswerPayload; label: string }) {
  const lines = question.type === 'ordering' && answer.type === 'ordering' ? answer.itemIds.map((id) => itemLabel(question.items, id))
    : question.type === 'matching' && answer.type === 'matching' ? matchingLabels(question, answer.pairs) : []
  return <section className="arrangement-result" data-dense={lines.length > 4} aria-label={label}><h2>{label}</h2><ol>{lines.map((line, index) => <li key={index}><span className="arrangement-marker">{index + 1}</span><strong>{line}</strong></li>)}</ol></section>
}

export function ArrangementPrompt({ question }: { question: Extract<SafeQuestion, { type: 'ordering' | 'matching' }> }) {
  const groups = question.type === 'ordering' ? [{ label: 'Put these in order', items: question.items }] : [{ label: 'Left items', items: question.leftItems }, { label: 'Right items', items: question.rightItems }]
  return <div className={`arrangement-prompt arrangement-prompt--${question.type}`} data-dense={groups[0].items.length > 4}>{groups.map((group) => <section key={group.label} aria-label={group.label}><h2>{group.label}</h2><ul>{group.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul></section>)}</div>
}
