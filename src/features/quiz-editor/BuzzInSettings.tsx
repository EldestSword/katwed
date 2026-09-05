import type { Question, QuizType } from '../../types/domain'
import { BUZZ_ANSWER_WINDOW_SECONDS, canUseBuzzIn } from '../game/buzz'

export function BuzzInSettings({ question, quizType, update }: { question: Question; quizType: QuizType; update(change: (question: Question) => Question): void }) {
  if (!canUseBuzzIn(question, quizType)) return null
  return <div className="buzz-settings">
    <p className="eyebrow">Buzz-In</p>
    <label><input type="checkbox" checked={question.buzzInEnabled ?? false} onChange={event => update(current => ({ ...current, buzzInEnabled: event.target.checked }))} /> First player to buzz gets the answer</label>
    <p className="settings-note">The first player to buzz gets {BUZZ_ANSWER_WINDOW_SECONDS} seconds to answer. Everyone else is locked out.</p>
    {question.buzzInEnabled && <div className="buzz-settings__summary"><strong>First buzz wins</strong><span>{BUZZ_ANSWER_WINDOW_SECONDS} second answer window</span></div>}
  </div>
}
