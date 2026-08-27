import { TILE_GRID_SIZES, type Question, type RosterMember } from '../../types/domain'
import type { QuizSaveInput } from '../../services/gameRepository'
import { isQuizThemeId } from '../themes/quizThemes'
import { isQuizBackgroundCompatible, isQuizBackgroundId } from '../themes/quizBackgrounds'
import { isQuizType } from '../head-to-head/headToHead'
import { isAnswerColourTuple, isAnswerPaletteId } from '../answer-palettes/answerPalettes'
import { isSoundPackId } from '../audio/soundPacks'
import {
  MAX_TYPED_ANSWER_LENGTH,
  MAX_TYPED_ANSWER_VARIANTS,
  isMeaningfulTypedAnswer,
  normaliseTypedAnswer,
} from '../typed-answer/typedAnswer'

export interface QuestionValidation {
  valid: boolean
  messages: string[]
}

function validateMedia(question: Question, messages: string[]): void {
  if (question.media.type === 'image') {
    if (!question.media.path.trim()) messages.push('Add a question image.')
    if (
      !Number.isFinite(question.media.revealDurationSeconds) ||
      question.media.revealDurationSeconds < 0 ||
      question.media.revealDurationSeconds > 180
    ) messages.push('Set an image reveal duration between 0 and 180 seconds.')
    if (question.media.tileGridSize !== undefined && (
      question.media.revealEffect !== 'tiles' || !TILE_GRID_SIZES.includes(question.media.tileGridSize)
    )) messages.push('Choose a supported tile grid for the Tiles reveal effect.')
  }
  if (question.media.type === 'youtube') {
    if (!/^[A-Za-z0-9_-]{11}$/.test(question.media.videoId)) messages.push('Add a valid YouTube video.')
    if (
      question.media.startSeconds !== undefined &&
      (!Number.isFinite(question.media.startSeconds) || question.media.startSeconds < 0)
    ) messages.push('YouTube start time cannot be negative.')
    if (
      question.media.endSeconds !== undefined &&
      (!Number.isFinite(question.media.endSeconds) ||
        question.media.endSeconds <= (question.media.startSeconds ?? 0))
    ) messages.push('YouTube end time must be after its start time.')
  }
}

function validateOptions(
  options: Question['type'] extends never ? never : Array<{ id: string; label: string; imagePath?: string }>,
  messages: string[],
): Set<string> {
  if (options.length < 2 || options.length > 8) messages.push('Choice questions need between 2 and 8 options.')
  const ids = new Set<string>()
  options.forEach((option) => {
    if (!option.id || ids.has(option.id)) messages.push('Answer options must have unique IDs.')
    ids.add(option.id)
    if (!option.label.trim() && !option.imagePath?.trim()) messages.push('Every option needs text or an image.')
  })
  return ids
}

export function validateQuestion(question: Question, roster: readonly RosterMember[]): QuestionValidation {
  const messages: string[] = []
  if (!question.prompt.trim() || question.prompt.length > 300) {
    messages.push('Give the question a prompt of 1–300 characters.')
  }
  if (!Number.isInteger(question.timeLimitSeconds) || question.timeLimitSeconds < 5 || question.timeLimitSeconds > 300) {
    messages.push('Set a timer between 5 and 300 seconds.')
  }
  if (!Number.isInteger(question.points) || question.points < 1 || question.points > 100000) {
    messages.push('Set an integer points value between 1 and 100,000.')
  }
  if (typeof question.speedScoringEnabled !== 'boolean' || typeof question.doubleScore !== 'boolean') {
    messages.push('Choose valid Standard scoring settings.')
  }
  if (question.revealCaption.length > 500) messages.push('Reveal captions must be 500 characters or fewer.')
  validateMedia(question, messages)

  switch (question.type) {
    case 'single-choice': {
      const optionIds = validateOptions(question.options, messages)
      if (!optionIds.has(question.correctOptionId)) messages.push('Choose exactly one correct option.')
      break
    }
    case 'multiple-select': {
      const optionIds = validateOptions(question.options, messages)
      const correctIds = new Set(question.correctOptionIds)
      if (
        correctIds.size !== question.correctOptionIds.length ||
        correctIds.size < 2 ||
        question.correctOptionIds.some((id) => !optionIds.has(id))
      ) messages.push('Choose at least two valid correct options.')
      if (
        !Number.isInteger(question.minimumSelections) ||
        !Number.isInteger(question.maximumSelections) ||
        question.minimumSelections < 1 ||
        question.maximumSelections < question.minimumSelections ||
        question.maximumSelections > question.options.length
      ) messages.push('Set valid minimum and maximum selection counts.')
      if (
        question.correctOptionIds.length < question.minimumSelections ||
        question.correctOptionIds.length > question.maximumSelections
      ) messages.push('The correct set must fit within the selection limits.')
      break
    }
    case 'true-false':
      break
    case 'slider':
      if (!Number.isFinite(question.minimum) || !Number.isFinite(question.maximum) || question.minimum >= question.maximum) {
        messages.push('Slider minimum must be lower than its maximum.')
      }
      if (!Number.isFinite(question.step) || question.step <= 0 || question.step > question.maximum - question.minimum) {
        messages.push('Set a valid positive slider step.')
      }
      if (question.correctValue < question.minimum || question.correctValue > question.maximum) {
        messages.push('The slider answer must be inside its range.')
      }
      if (!Number.isFinite(question.tolerance) || question.tolerance < 0) {
        messages.push('Slider tolerance cannot be negative.')
      }
      break
    case 'pinpoint':
      if (
        question.targetX < 0 || question.targetX > 1 ||
        question.targetY < 0 || question.targetY > 1
      ) messages.push('Pinpoint coordinates must be normalised between 0 and 1.')
      if (question.targetRadius <= 0 || question.targetRadius > 1) {
        messages.push('Pinpoint radius must be greater than 0 and no more than 1.')
      }
      break
    case 'typed-answer': {
      const answers = [question.correctAnswer, ...question.acceptedAnswers]
      if (answers.length > MAX_TYPED_ANSWER_VARIANTS) {
        messages.push('Typed Answer supports one primary answer and up to 19 alternatives.')
      }
      if (answers.some((answer) => answer.length > MAX_TYPED_ANSWER_LENGTH)) {
        messages.push('Typed answers must be 120 characters or fewer.')
      }
      if (answers.some((answer) => !answer.trim() || !isMeaningfulTypedAnswer(answer))) {
        messages.push('Every typed answer must contain at least one letter or number.')
      }
      const normalised = answers.map(normaliseTypedAnswer)
      if (new Set(normalised).size !== normalised.length) {
        messages.push('Typed answers must be different after ignoring capitals, spaces and punctuation.')
      }
      break
    }
    case 'mashup': {
      const activeIds = new Set(roster.filter((member) => member.active).map((member) => member.id))
      if (
        question.correctMemberIds.length !== 2 ||
        new Set(question.correctMemberIds).size !== 2 ||
        question.correctMemberIds.some((id) => !id)
      ) {
        messages.push('Choose exactly two different correct people.')
      } else if (question.correctMemberIds.some((id) => !activeIds.has(id))) {
        messages.push('Both correct people must be active.')
      }
      break
    }
  }

  return { valid: messages.length === 0, messages: [...new Set(messages)] }
}

export function validateQuizSave(input: QuizSaveInput): string[] {
  const messages: string[] = []
  const title = input.title.trim()
  if (!isQuizType(input.quizType)) messages.push('Choose a supported quiz type.')
  if (!title || title.length > 120) messages.push('Give the quiz a title of 1–120 characters.')
  if (!isQuizThemeId(input.themeId)) messages.push('Choose a supported quiz theme.')
  if (input.answerPaletteId !== undefined && !isAnswerPaletteId(input.answerPaletteId)) messages.push('Choose a supported answer palette.')
  if (input.customAnswerColours !== undefined && !isAnswerColourTuple(input.customAnswerColours)) {
    messages.push('Set all eight custom answer colours using six-digit hexadecimal values.')
  }
  if (input.soundPackId !== undefined && !isSoundPackId(input.soundPackId)) messages.push('Choose a supported sound pack.')
  if (input.backgroundId !== null) {
    if (!isQuizBackgroundId(input.backgroundId)) messages.push('Choose a supported quiz background.')
    else if (!isQuizBackgroundCompatible(input.backgroundId, input.themeId)) {
      messages.push('Choose a background that belongs to the selected quiz theme.')
    }
  }

  const memberIds = new Set<string>()
  const memberNames = new Set<string>()
  for (const member of input.roster) {
    const name = member.displayName.trim()
    if (!member.id || memberIds.has(member.id)) messages.push('People bank members must have unique IDs.')
    memberIds.add(member.id)
    if (!name || name.length > 60) messages.push('Every people bank member needs a display name of 1–60 characters.')
    const nameKey = name.toLocaleLowerCase('en-GB')
    if (nameKey && memberNames.has(nameKey)) messages.push('People bank names must be unique.')
    memberNames.add(nameKey)
    if (member.shortName.length > 30) messages.push('Short names must be 30 characters or fewer.')
  }

  const questionIds = new Set<string>()
  for (const question of input.questions) {
    if (!question.id || questionIds.has(question.id)) messages.push('Questions must have unique IDs.')
    questionIds.add(question.id)
    messages.push(...validateQuestion(question, input.roster).messages)
  }

  if (input.quizType === 'standard') {
    if (input.headToHeadCompetitors.length > 0) {
      messages.push('Standard quizzes cannot contain Head-to-Head competitors.')
    }
    if (input.questions.some((question) => question.assignedCompetitorId !== null)) {
      messages.push('Standard questions cannot be assigned to Head-to-Head competitors.')
    }
  }

  if (input.quizType === 'head-to-head') {
    if (input.questions.some((question) => question.speedScoringEnabled || question.doubleScore)) {
      messages.push('Head-to-Head questions cannot use Speed Scoring or Double Score.')
    }
    if (input.headToHeadCompetitors.length !== 2) {
      messages.push('Head-to-Head quizzes need exactly two competitors.')
    }
    const competitorIds = new Set<string>()
    const competitorNames = new Set<string>()
    const orders = new Set<number>()
    let invalidName = false
    let duplicateName = false
    for (const competitor of input.headToHeadCompetitors) {
      const name = competitor.displayName.trim()
      if (!competitor.id || competitorIds.has(competitor.id)) {
        messages.push('Head-to-Head competitors must have unique IDs.')
      }
      competitorIds.add(competitor.id)
      if (!name || name.length > 30) invalidName = true
      const nameKey = name.toLocaleLowerCase('en-GB')
      if (nameKey && competitorNames.has(nameKey)) duplicateName = true
      competitorNames.add(nameKey)
      orders.add(competitor.displayOrder)
    }
    if (invalidName) messages.push('Enter a name of 1-30 characters for both Head-to-Head competitors.')
    if (duplicateName) messages.push('Head-to-Head competitor names must be different.')
    if (orders.size !== 2 || !orders.has(0) || !orders.has(1)) {
      messages.push('Head-to-Head competitors must use the two configured positions.')
    }
    if (input.questions.some((question) => question.assignedCompetitorId === null)) {
      messages.push('Assign every question to a competitor.')
    }
    input.questions.forEach((question, index) => {
      if (question.assignedCompetitorId !== null && !competitorIds.has(question.assignedCompetitorId)) {
        messages.push(`Question ${index + 1} is assigned to an invalid competitor.`)
      }
    })
  }

  return [...new Set(messages)]
}
