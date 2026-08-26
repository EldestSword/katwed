import { AnswerTile } from '../../components/design-system/AnswerTile'
import type { AnswerColourTuple, AnswerPaletteId, PlayerAnswerPayload, RosterMember, SafeQuestion } from '../../types/domain'
import { answerColourStyle, CLASSIC_ANSWER_COLOURS, resolveAnswerColours } from '../answer-palettes/answerPalettes'
import { optionPosition } from '../questions/optionOrdering'
import { formatSliderValue } from './revealFormatting'

export function PlayerSubmissionSummary({
  answer,
  question,
  roster,
  answerPaletteId = 'classic',
  customAnswerColours = CLASSIC_ANSWER_COLOURS,
  label = 'Your answer',
}: {
  answer: PlayerAnswerPayload
  question: SafeQuestion
  roster: RosterMember[]
  answerPaletteId?: AnswerPaletteId
  customAnswerColours?: AnswerColourTuple
  label?: string
}) {
  const colours = resolveAnswerColours(answerPaletteId, customAnswerColours)
  const heading = <p className="submission-summary__label">{label}</p>

  if (answer.type === 'single-choice' && question.type === 'single-choice') {
    const option = question.options.find((candidate) => candidate.id === answer.optionId)
    const position = Math.max(0, optionPosition(question, answer.optionId))
    return <div className="submission-summary">{heading}<AnswerTile label={option?.label ?? 'Selected option'} position={position} state="locked" style={answerColourStyle(colours, position)} /></div>
  }

  if (answer.type === 'multiple-select' && question.type === 'multiple-select') {
    return (
      <div className="submission-summary">
        {heading}
        <div className="submission-summary__tiles">
          {answer.optionIds.map((optionId) => {
            const option = question.options.find((candidate) => candidate.id === optionId)
            const position = Math.max(0, optionPosition(question, optionId))
            return <AnswerTile key={optionId} label={option?.label ?? 'Selected option'} position={position} state="locked" style={answerColourStyle(colours, position)} />
          })}
        </div>
      </div>
    )
  }

  if (answer.type === 'true-false') {
    const position = answer.value ? 0 : 1
    return <div className="submission-summary">{heading}<AnswerTile label={answer.value ? 'True' : 'False'} position={position} state="locked" style={answerColourStyle(colours, position)} /></div>
  }

  let value = 'Answer submitted'
  if (answer.type === 'slider' && question.type === 'slider') value = formatSliderValue(answer.value, question)
  if (answer.type === 'pinpoint') value = 'Location selected'
  if (answer.type === 'typed-answer') value = answer.value
  if (answer.type === 'mashup') {
    value = answer.memberIds.map((id) => roster.find((member) => member.id === id)?.displayName ?? id).join(' + ')
  }

  return (
    <div className={`submission-summary submission-summary--${answer.type}`}>
      {heading}
      <strong className="submission-summary__value">{value}</strong>
      {answer.type === 'pinpoint' && (
        <span className="submission-summary__coordinates" aria-label="Submitted location retained">
          <i aria-hidden="true" style={{ left: `${answer.x * 100}%`, top: `${answer.y * 100}%` }} />
        </span>
      )}
    </div>
  )
}
