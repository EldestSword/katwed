import { GameBadge } from '../../components/design-system/GameBadge'
import type { AnswerColourTuple, AnswerPaletteId, PlayerAnswerPayload, RevealPayload, RosterMember, SafeQuestion } from '../../types/domain'
import { CLASSIC_ANSWER_COLOURS, answerColourStyle, resolveAnswerColours } from '../answer-palettes/answerPalettes'
import { orderedQuestionOptions, optionPosition } from '../questions/optionOrdering'
import { normaliseTypedAnswer } from '../typed-answer/typedAnswer'
import { PinpointSurface } from './PinpointSurface'
import { PlayerSubmissionSummary } from './PlayerSubmissionSummary'
import { RevealAnswerCard } from './RevealAnswerCard'
import { formatSliderValue } from './revealFormatting'

type RevealOutcome = 'correct' | 'incorrect' | 'unknown'

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function revealOutcome(reveal: RevealPayload, answer: PlayerAnswerPayload | null, playerId?: string): RevealOutcome {
  if (!answer || answer.type !== reveal.type) return 'unknown'
  switch (reveal.type) {
    case 'single-choice': return answer.type === 'single-choice' && answer.optionId === reveal.correctOptionId ? 'correct' : 'incorrect'
    case 'multiple-select': {
      if (answer.type !== 'multiple-select') return 'unknown'
      if (sameSet(answer.optionIds, reveal.correctOptionIds)) return 'correct'
      if (reveal.scoringMode === 'exact' || answer.optionIds.some((id) => !reveal.correctOptionIds.includes(id))) return 'incorrect'
      return 'unknown'
    }
    case 'true-false': return answer.type === 'true-false' && answer.value === reveal.correctValue ? 'correct' : 'incorrect'
    case 'slider': return answer.type === 'slider' && Math.abs(answer.value - reveal.correctValue) <= reveal.tolerance ? 'correct' : 'incorrect'
    case 'pinpoint': return answer.type === 'pinpoint' && Math.hypot(answer.x - reveal.targetX, answer.y - reveal.targetY) <= reveal.targetRadius ? 'correct' : 'incorrect'
    case 'mashup': return answer.type === 'mashup' && sameSet(answer.memberIds, reveal.correctMemberIds) ? 'correct' : 'incorrect'
    case 'typed-answer':
      if (answer.type !== 'typed-answer') return 'unknown'
      if (reveal.correctPlayerIds && playerId) return reveal.correctPlayerIds.includes(playerId) ? 'correct' : 'incorrect'
      return normaliseTypedAnswer(answer.value) === normaliseTypedAnswer(reveal.correctAnswer) ? 'correct' : 'unknown'
  }
}

function OutcomeHeading({ outcome }: { outcome: RevealOutcome }) {
  const content = outcome === 'correct'
    ? { icon: '✓', heading: 'You got it right!', note: 'Nicely played.', tone: 'success' as const }
    : outcome === 'incorrect'
      ? { icon: '×', heading: 'Not this time', note: 'Here’s the correct answer.', tone: 'warning' as const }
      : { icon: '!', heading: 'Answer revealed', note: 'See how yours compares.', tone: 'info' as const }
  return (
    <div className={`player-reveal-outcome player-reveal-outcome--${outcome}`} role="status">
      <GameBadge tone={content.tone}>{content.icon} {outcome === 'correct' ? 'Correct' : outcome === 'incorrect' ? 'Incorrect' : 'Revealed'}</GameBadge>
      <h1>{content.heading}</h1><p>{content.note}</p>
    </div>
  )
}

export function PlayerAnswerReveal({
  reveal,
  question,
  submittedAnswer,
  roster = [],
  answerPaletteId = 'classic',
  customAnswerColours = CLASSIC_ANSWER_COLOURS,
  playerId,
}: {
  reveal: RevealPayload
  question: SafeQuestion
  submittedAnswer: PlayerAnswerPayload | null
  roster?: RosterMember[]
  answerPaletteId?: AnswerPaletteId
  customAnswerColours?: AnswerColourTuple
  playerId?: string
}) {
  const answerColours = resolveAnswerColours(answerPaletteId, customAnswerColours)
  const outcome = revealOutcome(reveal, submittedAnswer, playerId)
  let correctAnswer

  switch (reveal.type) {
    case 'single-choice': {
      const label = question.type === 'single-choice' ? question.options.find((option) => option.id === reveal.correctOptionId)?.label : null
      const position = question.type === 'single-choice' ? optionPosition(question, reveal.correctOptionId) : -1
      correctAnswer = <RevealAnswerCard className="answer-colour-reveal" style={answerColourStyle(answerColours, Math.max(0, position))}><p>Correct answer</p><h2>{label ?? 'Correct option unavailable'}</h2></RevealAnswerCard>
      break
    }
    case 'multiple-select': {
      const labels = question.type === 'multiple-select' ? orderedQuestionOptions(question).filter((option) => reveal.correctOptionIds.includes(option.id)).map((option) => ({ option, position: optionPosition(question, option.id) })) : []
      correctAnswer = <RevealAnswerCard className="player-correct-set"><p>Complete correct set</p><ul>{labels.map(({ option, position }) => <li className="answer-colour-result" style={answerColourStyle(answerColours, position)} key={option.id}>{option.label}</li>)}</ul><small>{reveal.scoringMode === 'exact' ? 'The complete set was required.' : 'Incorrect selections wipe out partial points.'}</small></RevealAnswerCard>
      break
    }
    case 'true-false': {
      correctAnswer = <RevealAnswerCard className="answer-colour-reveal" style={answerColourStyle(answerColours, reveal.correctValue ? 0 : 1)}><p>Correct answer</p><h2>{reveal.correctValue ? 'True' : 'False'}</h2></RevealAnswerCard>
      break
    }
    case 'slider': {
      const correct = question.type === 'slider' ? formatSliderValue(reveal.correctValue, question) : String(reveal.correctValue)
      correctAnswer = <RevealAnswerCard><p>Correct value</p><h2>{correct}</h2>{question.type === 'slider' && <p className="answer-range">{reveal.tolerance > 0 ? `Accepted range: ${formatSliderValue(reveal.correctValue - reveal.tolerance, question)}–${formatSliderValue(reveal.correctValue + reveal.tolerance, question)}` : 'Exact value required.'}</p>}</RevealAnswerCard>
      break
    }
    case 'pinpoint': {
      if (question.type === 'pinpoint') {
        const playerMarker = submittedAnswer?.type === 'pinpoint' ? [{ x: submittedAnswer.x, y: submittedAnswer.y, kind: 'player' as const, label: 'Your pin' }] : []
        correctAnswer = <div className="player-pinpoint-reveal"><RevealAnswerCard><p>Correct answer</p><h2>Target area</h2></RevealAnswerCard><PinpointSurface path={question.media.path} alt={question.media.altText} mode="player-reveal" markers={playerMarker} target={{ x: reveal.targetX, y: reveal.targetY, radius: reveal.targetRadius }} /><div className="pinpoint-legend" aria-label="Pinpoint answer legend">{playerMarker.length > 0 && <span><i className="pinpoint-key pinpoint-key--player" />Your pin</span>}<span><i className="pinpoint-key pinpoint-key--target" />Correct area</span></div><p className="sr-only">The correct target location has been displayed.</p></div>
      }
      break
    }
    case 'typed-answer': correctAnswer = <RevealAnswerCard><p>Correct answer</p><h2>{reveal.correctAnswer}</h2></RevealAnswerCard>; break
    case 'mashup': correctAnswer = <RevealAnswerCard className="mashup-reveal-card"><p>Correct pair</p><h2><strong>{reveal.correctNames[0]}</strong><span>+</span><strong>{reveal.correctNames[1]}</strong></h2></RevealAnswerCard>; break
  }

  return (
    <div className="player-answer-reveal">
      <OutcomeHeading outcome={outcome} />
      {submittedAnswer && <PlayerSubmissionSummary answer={submittedAnswer} question={question} roster={roster} answerPaletteId={answerPaletteId} customAnswerColours={customAnswerColours} />}
      <div className="player-answer-reveal__correct">{correctAnswer}</div>
      {question.doubleScore && <GameBadge tone="accent" large>Double Score question</GameBadge>}
    </div>
  )
}
