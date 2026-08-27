import type { QuestionType } from '../../types/domain'
import { questionTypeRegistry } from '../questions/registry'

export function QuestionTypeIntro({ type, compact = false }: { type: QuestionType; compact?: boolean }) {
  const definition = questionTypeRegistry[type]
  return (
    <section className={`question-type-intro ${compact ? 'question-type-intro--compact' : ''}`} aria-live="polite">
      <span aria-hidden="true">{definition.icon}</span>
      <p>Next question</p>
      <h1>{definition.introLabel}</h1>
    </section>
  )
}
