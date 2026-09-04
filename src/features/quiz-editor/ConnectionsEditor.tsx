import type { ConnectionsQuestion } from '../../types/domain'
import { connectionStagePoints } from '../questions/connections'
import { MAX_TYPED_ANSWER_LENGTH, parseTypedAnswerAlternatives } from '../typed-answer/typedAnswer'

export function ConnectionsEditor({ question, onChange }: { question: ConnectionsQuestion; onChange(question: ConnectionsQuestion): void }) {
  const move = (index: number, direction: number) => {
    const clues = [...question.clues], target = index + direction
    if (target < 0 || target >= clues.length) return
    ;[clues[index], clues[target]] = [clues[target], clues[index]]
    onChange({ ...question, clues })
  }
  return <fieldset className="connections-editor"><legend>Connections</legend>
    <p>Clues appear in this order when the host reveals them.</p>
    {question.clues.map((clue, index) => <div className="connection-editor-row" key={clue.id}>
      <label><span>Clue {index + 1}</span><textarea rows={2} maxLength={200} value={clue.text} onChange={event => onChange({ ...question, clues: question.clues.map(item => item.id === clue.id ? { ...item, text: event.target.value } : item) })} /></label>
      <div className="arrangement-editor-controls">
        <button type="button" aria-label={`Move clue ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" aria-label={`Move clue ${index + 1} down`} disabled={index === question.clues.length - 1} onClick={() => move(index, 1)}>↓</button>
        <button type="button" aria-label={`Remove clue ${index + 1}`} disabled={question.clues.length <= 2} onClick={() => onChange({ ...question, clues: question.clues.filter(item => item.id !== clue.id) })}>Remove</button>
      </div>
    </div>)}
    <button type="button" className="button button--secondary" disabled={question.clues.length >= 6} onClick={() => onChange({ ...question, clues: [...question.clues, { id: crypto.randomUUID(), text: '' }] })}>Add clue</button>
    <label><span>Correct connection</span><input maxLength={MAX_TYPED_ANSWER_LENGTH} value={question.correctAnswer} onChange={event => onChange({ ...question, correctAnswer: event.target.value })} /></label>
    <label><span>Also accept</span><textarea key={question.id} rows={4} defaultValue={question.acceptedAnswers.join('\n')} placeholder="One alternative per line" onChange={event => onChange({ ...question, acceptedAnswers: parseTypedAnswerAlternatives(event.target.value) })} /></label>
    <p className="settings-note">Matching ignores capitals, spaces and punctuation. Add up to 19 alternatives. Only the primary answer is revealed.</p>
    <ol className="connection-points-ladder" aria-label="Points by clue stage">{question.clues.map((clue, index) => <li key={clue.id}>Clue {index + 1}<strong>{(connectionStagePoints(question.points, question.clues.length, index + 1) * (question.doubleScore ? 2 : 1)).toLocaleString('en-GB')} pts</strong></li>)}</ol>
  </fieldset>
}
