import type { SafeQuestion } from '../../types/domain'
import { MAX_TYPED_ANSWER_LENGTH } from '../typed-answer/typedAnswer'
import { ConnectionClues } from './ConnectionClues'

export function PlayerConnectionsAnswer({ question, value, disabled, onChange }: {
  question: Extract<SafeQuestion, { type: 'connections' }>; value: string; disabled: boolean; onChange(value: string): void
}) {
  return <div className="connections-answer">
    <ConnectionClues question={question} />
    <label><span>Your connection</span><input type="text" value={value} maxLength={MAX_TYPED_ANSWER_LENGTH} disabled={disabled}
      autoComplete="off" onChange={event => onChange(event.target.value)} /></label>
    <p>One guess only. More clues mean fewer points.</p>
  </div>
}
