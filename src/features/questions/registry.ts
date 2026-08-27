import type { PlayerAnswerPayload, Question, QuestionType } from '../../types/domain'
import { scoreQuestion, type QuestionScore } from '../../utils/scoring'

export interface QuestionTypeDefinition {
  type: QuestionType
  name: string
  description: string
  icon: string
  introLabel: string
  classification: 'Knowledge scored'
  score(question: Question, answer: PlayerAnswerPayload): QuestionScore
}

function definition(
  type: QuestionType,
  name: string,
  description: string,
  icon: string,
  introLabel: string,
): QuestionTypeDefinition {
  return { type, name, description, icon, introLabel, classification: 'Knowledge scored', score: scoreQuestion }
}

export const questionTypeRegistry: Record<QuestionType, QuestionTypeDefinition> = {
  'single-choice': definition('single-choice', 'Single choice', 'Choose one correct option.', '●', 'SELECT AN ANSWER'),
  'multiple-select': definition('multiple-select', 'Multiple select', 'Choose the complete correct set.', '☑', 'SELECT MULTIPLE ANSWERS'),
  'true-false': definition('true-false', 'True or false', 'Decide whether a statement is true.', '↔', 'TRUE OR FALSE'),
  slider: definition('slider', 'Slider', 'Place a value on a numeric scale.', '↔', 'SLIDER'),
  pinpoint: definition('pinpoint', 'Pinpoint', 'Mark a location on an image.', '⌖', 'PINPOINT'),
  'typed-answer': definition('typed-answer', 'Typed answer', 'Type a short answer.', '⌨', 'TYPE YOUR ANSWER'),
  mashup: definition('mashup', 'Mash-up', 'Identify exactly two people.', '◉', 'MASH-UP'),
}

export const questionTypes = Object.values(questionTypeRegistry)
