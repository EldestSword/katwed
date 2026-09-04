import type { Question, QuizType } from '../../types/domain'
import { canOfferProgressiveReveal, progressiveRevealScore, progressiveRevealValidation } from '../scoring/progressiveReveal'

export function ProgressiveRevealSettings({ question, quizType, update }: { question: Question; quizType: QuizType; update(updater: (question: Question) => Question): void }) {
  if (!canOfferProgressiveReveal(question, quizType) || question.media.type !== 'image') return null
  const duration = Math.max(1, Math.round(question.media.revealDurationSeconds * 1000))
  return <fieldset className="progressive-settings"><legend>Progressive Reveal</legend>
    <label><input type="checkbox" checked={Boolean(question.progressiveRevealEnabled)} onChange={event => { const enabled = event.currentTarget.checked; update(current => ({ ...current, progressiveRevealEnabled: enabled, ...(enabled ? { buzzInEnabled: false } : {}) })) }} /> Score falls as the image becomes clearer</label>
    <p>Players can answer at any time. The available score falls from 100% to 25% while the image reveals.</p>
    {question.progressiveRevealEnabled && <>
      {progressiveRevealValidation(question, quizType).map(message => <p className="settings-note" key={message}>{message}</p>)}
      <ol aria-label="Progressive score preview">{[0, .25, .5, .75, 1].map(fraction => <li key={fraction}><span>{fraction ? `${duration * fraction / 1000} sec` : 'Start'}</span><strong>{(progressiveRevealScore(question.points, duration * fraction, duration) * (question.doubleScore ? 2 : 1)).toLocaleString('en-GB')} pts</strong></li>)}</ol>
    </>}
  </fieldset>
}
