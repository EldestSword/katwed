import type { PlayerAnswerPayload, Question, QuestionType } from '../../types/domain'
import { scoreQuestion, type QuestionScore } from '../../utils/scoring'

export interface QuestionTypeDefinition {
  type: QuestionType
  name: string
  description: string
  icon: string
  classification: 'Knowledge scored'
  score(question: Question, answer: PlayerAnswerPayload): QuestionScore
}

function definition(
  type: QuestionType,
  name: string,
  description: string,
  icon: string,
): QuestionTypeDefinition {
  return { type, name, description, icon, classification: 'Knowledge scored', score: scoreQuestion }
}

export const questionTypeRegistry: Record<QuestionType, QuestionTypeDefinition> = {
  'single-choice': definition('single-choice', 'Single choice', 'Choose one correct option.', '●'),
  'multiple-select': definition('multiple-select', 'Multiple select', 'Choose the complete correct set.', '☑'),
  'true-false': definition('true-false', 'True or false', 'Decide whether a statement is true.', '↔'),
  slider: definition('slider', 'Slider', 'Place a value on a numeric scale.', '↔'),
  pinpoint: definition('pinpoint', 'Pinpoint', 'Mark a location on an image.', '⌖'),
  'typed-answer': definition('typed-answer', 'Typed answer', 'Type a short answer.', '⌨'),
  mashup: definition('mashup', 'Mash-up', 'Identify exactly two people.', '◉'),
}

export const questionTypes = Object.values(questionTypeRegistry)
