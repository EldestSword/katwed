import type { Question, Quiz } from '../../types/domain'
import { questionTypeRegistry } from '../questions/registry'
import { deleteRound, moveQuestionInRound, moveRound, orderedRounds, roundDeletionReason } from './rounds'

export function RoundNavigator({ quiz, selectedId, select, update, addQuestion }: {
  quiz: Quiz
  selectedId: string
  select(id: string): void
  update(updater: (quiz: Quiz) => Quiz): void
  addQuestion(roundId: string): void
}) {
  const standard = quiz.quizType === 'standard'
  const rounds = orderedRounds(quiz.rounds)
  return <aside className="question-navigator round-navigator">
    <div className="question-navigator__header"><div><p className="eyebrow">Structure</p><h2>Questions <span>{quiz.questions.length}</span></h2></div><button className="button button--primary button--compact" type="button" onClick={() => addQuestion(quiz.questions.find((question) => question.id === selectedId)?.roundId ?? rounds[0].id)}>+ Add</button></div>
    {!standard && <p className="round-navigator__hint">Head-to-Head uses one round. Multiple rounds and round intros are available in Standard quizzes.</p>}
    {rounds.map((round, roundIndex) => {
      const questions = quiz.questions.filter((question) => question.roundId === round.id)
      const reason = roundDeletionReason(quiz, round.id)
      const change = (patch: Partial<typeof round>) => update((current) => ({ ...current, rounds: current.rounds.map((item) => item.id === round.id ? { ...item, ...patch } : item) }))
      return <section className="round-group" aria-label={`Round ${roundIndex + 1}: ${round.title}`} key={round.id}>
        <header><strong>{round.title || `Round ${roundIndex + 1}`}</strong><span>{questions.length}</span></header>
        {standard && <details className="round-settings"><summary>Edit round {roundIndex + 1}</summary>
          <label><span>Round title</span><input maxLength={80} value={round.title} onChange={(event) => change({ title: event.target.value })} /></label>
          <label><span>Round subtitle</span><textarea maxLength={200} rows={2} value={round.subtitle} onChange={(event) => change({ subtitle: event.target.value })} /></label>
          <label className="round-intro-toggle"><input type="checkbox" checked={round.introEnabled} onChange={(event) => change({ introEnabled: event.target.checked })} /> Show round intro</label>
          <div className="round-actions"><button type="button" disabled={roundIndex === 0} aria-label={`Move round ${roundIndex + 1} up`} onClick={() => update((current) => moveRound(current, round.id, -1))}>↑</button><button type="button" disabled={roundIndex === rounds.length - 1} aria-label={`Move round ${roundIndex + 1} down`} onClick={() => update((current) => moveRound(current, round.id, 1))}>↓</button><button type="button" disabled={Boolean(reason)} onClick={() => update((current) => deleteRound(current, round.id))}>Delete round</button></div>
          {reason && <p className="round-navigator__hint">{reason}</p>}
        </details>}
        <ol>{questions.map((question, index) => {
          const number = quiz.questions.findIndex((item) => item.id === question.id) + 1
          return <li key={question.id}>
            <button className={question.id === selectedId ? 'is-selected' : ''} type="button" onClick={() => select(question.id)}>
              <span>{number}</span><span><strong>{question.prompt}</strong><small>{questionTypeRegistry[question.type].name}{assignmentLabel(quiz, question)}</small></span>
            </button>
            <div className="mini-actions"><button type="button" disabled={index === 0} aria-label={`Move question ${number} up`} onClick={() => update((current) => moveQuestionInRound(current, question.id, -1))}>↑</button><button type="button" disabled={index === questions.length - 1} aria-label={`Move question ${number} down`} onClick={() => update((current) => moveQuestionInRound(current, question.id, 1))}>↓</button></div>
          </li>
        })}</ol>
        <button className="button button--secondary button--compact" type="button" onClick={() => addQuestion(round.id)}>Add question to {round.title || `round ${roundIndex + 1}`}</button>
      </section>
    })}
    {standard && <button className="button button--primary" type="button" onClick={() => update((current) => ({ ...current, rounds: [...current.rounds, { id: crypto.randomUUID(), quizId: current.id, title: `Round ${current.rounds.length + 1}`, subtitle: '', displayOrder: current.rounds.length, introEnabled: true }] }))}>Add round</button>}
  </aside>
}

function assignmentLabel(quiz: Quiz, question: Question): string {
  if (quiz.quizType !== 'head-to-head') return ''
  const competitor = quiz.headToHeadCompetitors.find((item) => item.id === question.assignedCompetitorId)
  return competitor ? ` · ${competitor.displayName.trim() || `Competitor ${competitor.displayOrder + 1}`}` : ' · Unassigned'
}
