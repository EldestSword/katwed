import type { PlayerAnswerPayload, RevealPayload, SafeQuestion } from '../../types/domain'
import { PinpointSurface } from './PinpointSurface'
import { formatSliderValue } from './revealFormatting'

export function PlayerAnswerReveal({
  reveal,
  question,
  submittedAnswer,
}: {
  reveal: RevealPayload
  question: SafeQuestion
  submittedAnswer: PlayerAnswerPayload | null
}) {
  switch (reveal.type) {
    case 'single-choice': {
      const label = question.type === 'single-choice'
        ? question.options.find((option) => option.id === reveal.correctOptionId)?.label
        : null
      return <h1>{label ?? 'Correct option unavailable'}</h1>
    }
    case 'multiple-select': {
      const labels = question.type === 'multiple-select'
        ? question.options
          .filter((option) => reveal.correctOptionIds.includes(option.id))
          .map((option) => option.label)
        : []
      return (
        <div className="player-correct-set">
          <h1>Complete correct set</h1>
          <ul>{labels.map((label) => <li key={label}>{label}</li>)}</ul>
          <p>{reveal.scoringMode === 'exact'
            ? 'The complete set was required.'
            : 'Partial credit was available, but any incorrect option wiped out the score.'}</p>
        </div>
      )
    }
    case 'true-false':
      return <h1>{reveal.correctValue ? 'True' : 'False'}</h1>
    case 'slider': {
      if (question.type !== 'slider') return <h1>{reveal.correctValue}</h1>
      const correct = formatSliderValue(reveal.correctValue, question)
      return (
        <>
          <h1>{correct}</h1>
          <p className="answer-range">{reveal.tolerance > 0
            ? `Accepted range: ${formatSliderValue(reveal.correctValue - reveal.tolerance, question)}–${formatSliderValue(reveal.correctValue + reveal.tolerance, question)}`
            : 'Exact value required.'}</p>
        </>
      )
    }
    case 'pinpoint': {
      if (question.type !== 'pinpoint') return <h1>The correct target area is highlighted on the image.</h1>
      const playerMarker = submittedAnswer?.type === 'pinpoint'
        ? [{ x: submittedAnswer.x, y: submittedAnswer.y, kind: 'player' as const, label: 'Your pin' }]
        : []
      return (
        <div className="player-pinpoint-reveal">
          <h1>The correct target area is highlighted on the image.</h1>
          <PinpointSurface
            path={question.media.path}
            alt={question.media.altText}
            mode="player-reveal"
            markers={playerMarker}
            target={{ x: reveal.targetX, y: reveal.targetY, radius: reveal.targetRadius }}
          />
          <div className="pinpoint-legend" aria-label="Pinpoint answer legend">
            {playerMarker.length > 0 && <span><i className="pinpoint-key pinpoint-key--player" />Your pin</span>}
            <span><i className="pinpoint-key pinpoint-key--target" />Correct area</span>
          </div>
          <p className="sr-only">The correct target location has been displayed.</p>
        </div>
      )
    }
    case 'typed-answer':
      return <h1>{reveal.correctAnswer}</h1>
    case 'mashup':
      return <h1>{reveal.correctNames[0]} <span>+</span> {reveal.correctNames[1]}</h1>
  }
}
