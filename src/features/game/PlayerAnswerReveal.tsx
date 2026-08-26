import type { AnswerColourTuple, AnswerPaletteId, PlayerAnswerPayload, RevealPayload, SafeQuestion } from '../../types/domain'
import { PinpointSurface } from './PinpointSurface'
import { RevealAnswerCard } from './RevealAnswerCard'
import { formatSliderValue } from './revealFormatting'
import { orderedQuestionOptions, optionPosition } from '../questions/optionOrdering'
import { CLASSIC_ANSWER_COLOURS, answerColourStyle, resolveAnswerColours } from '../answer-palettes/answerPalettes'

export function PlayerAnswerReveal({
  reveal,
  question,
  submittedAnswer,
  answerPaletteId = 'classic',
  customAnswerColours = CLASSIC_ANSWER_COLOURS,
}: {
  reveal: RevealPayload
  question: SafeQuestion
  submittedAnswer: PlayerAnswerPayload | null
  answerPaletteId?: AnswerPaletteId
  customAnswerColours?: AnswerColourTuple
}) {
  const answerColours = resolveAnswerColours(answerPaletteId, customAnswerColours)
  switch (reveal.type) {
    case 'single-choice': {
      const label = question.type === 'single-choice'
        ? question.options.find((option) => option.id === reveal.correctOptionId)?.label
        : null
      const position = question.type === 'single-choice' ? optionPosition(question, reveal.correctOptionId) : -1
      return <RevealAnswerCard className="answer-colour-reveal" style={answerColourStyle(answerColours, Math.max(0, position))}><h1>{label ?? 'Correct option unavailable'}</h1></RevealAnswerCard>
    }
    case 'multiple-select': {
      const labels = question.type === 'multiple-select'
        ? orderedQuestionOptions(question)
          .filter((option) => reveal.correctOptionIds.includes(option.id))
          .map((option, index) => ({ option, position: optionPosition(question, option.id), index }))
        : []
      return (
        <RevealAnswerCard className="player-correct-set">
          <h1>Complete correct set</h1>
          <ul>{labels.map(({ option, position }) => <li className="answer-colour-result" style={answerColourStyle(answerColours, position)} key={option.id}>{option.label}</li>)}</ul>
          <p>{reveal.scoringMode === 'exact'
            ? 'The complete set was required.'
            : 'Partial credit was available, but any incorrect option wiped out the score.'}</p>
        </RevealAnswerCard>
      )
    }
    case 'true-false':
      return <RevealAnswerCard className="answer-colour-reveal" style={answerColourStyle(answerColours, reveal.correctValue ? 0 : 1)}><h1>{reveal.correctValue ? 'True' : 'False'}</h1></RevealAnswerCard>
    case 'slider': {
      if (question.type !== 'slider') return <RevealAnswerCard><h1>{reveal.correctValue}</h1></RevealAnswerCard>
      const correct = formatSliderValue(reveal.correctValue, question)
      return (
        <RevealAnswerCard>
          <h1>{correct}</h1>
          <p className="answer-range">{reveal.tolerance > 0
            ? `Accepted range: ${formatSliderValue(reveal.correctValue - reveal.tolerance, question)}–${formatSliderValue(reveal.correctValue + reveal.tolerance, question)}`
            : 'Exact value required.'}</p>
        </RevealAnswerCard>
      )
    }
    case 'pinpoint': {
      if (question.type !== 'pinpoint') return <h1>The correct target area is highlighted on the image.</h1>
      const playerMarker = submittedAnswer?.type === 'pinpoint'
        ? [{ x: submittedAnswer.x, y: submittedAnswer.y, kind: 'player' as const, label: 'Your pin' }]
        : []
      return (
        <div className="player-pinpoint-reveal">
          <RevealAnswerCard><h1>The correct target area is highlighted on the image.</h1></RevealAnswerCard>
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
      return <RevealAnswerCard><h1>{reveal.correctAnswer}</h1></RevealAnswerCard>
    case 'mashup':
      return <RevealAnswerCard><h1>{reveal.correctNames[0]} <span>+</span> {reveal.correctNames[1]}</h1></RevealAnswerCard>
  }
}
