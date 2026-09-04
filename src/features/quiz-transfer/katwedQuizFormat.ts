import { isPinpointTarget, normalisePinpointTarget } from '../game/pinpointTargets'
import { validTextItems, validPermutation, validMatchingPairs } from '../questions/arrangementQuestions'
import { validConnectionClues } from '../questions/connections'
import { defaultRound, normaliseQuizRounds, orderedRounds, orderedRoundQuestions } from '../quiz-editor/rounds'
import { TILE_GRID_SIZES } from '../../types/domain'
import type {
  ChoiceOption,
  PinpointTarget,
  AnswerColourTuple,
  AnswerPaletteId,
  ImageRevealEffect,
  MediaVisibility,
  PresentationChoiceVisibility,
  Question,
  QuestionMedia,
  Quiz,
  QuizBackgroundId,
  QuizThemeId,
  QuizType,
  SoundPackId,
} from '../../types/domain'
import type { QuizSaveInput } from '../../services/gameRepository'
import { validateQuizSave } from '../quiz-editor/validation'
import { isQuizType } from '../head-to-head/headToHead'
import { isQuizThemeId } from '../themes/quizThemes'
import { isQuizBackgroundCompatible, isQuizBackgroundId } from '../themes/quizBackgrounds'
import {
  CLASSIC_ANSWER_COLOURS,
  isAnswerColourTuple,
  isAnswerPaletteId,
} from '../answer-palettes/answerPalettes'
import { isSoundPackId } from '../audio/soundPacks'

export const KATWED_QUIZ_FORMAT = 'katwed-quiz' as const
export const KATWED_QUIZ_FORMAT_VERSION = 9 as const
export const KATWED_QUIZ_V8_FORMAT_VERSION = 8 as const
export const KATWED_QUIZ_V7_FORMAT_VERSION = 7 as const
export const KATWED_QUIZ_V6_FORMAT_VERSION = 6 as const
export const KATWED_QUIZ_V5_FORMAT_VERSION = 5 as const
export const KATWED_QUIZ_V4_FORMAT_VERSION = 4 as const
export const KATWED_QUIZ_V3_FORMAT_VERSION = 3 as const
export const KATWED_QUIZ_V2_FORMAT_VERSION = 2 as const
export const KATWED_QUIZ_LEGACY_FORMAT_VERSION = 1 as const
export const KATWED_QUIZ_FILE_EXTENSION = '.katwed.json'
export const KATWED_QUIZ_MAX_FILE_BYTES = 2 * 1024 * 1024

const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const imageRevealEffects = new Set<ImageRevealEffect>(['immediate', 'blur', 'pixelate', 'tiles', 'zoom-out'])
const mediaVisibilities = new Set<MediaVisibility>(['presentation', 'players', 'both'])
const presentationChoiceVisibilities = new Set<PresentationChoiceVisibility>(['show', 'hide', 'after-lock'])
const scoringModes = new Set(['exact', 'partial-wipeout'] as const)

type IdFactory = () => string
type JsonRecord = Record<string, unknown>

export interface PortableCompetitorV1 {
  key: string
  displayName: string
}

export interface PortableRosterMemberV1 {
  key: string
  displayName: string
  shortName: string
  active: boolean
}

export interface PortableChoiceOptionV1 {
  key: string
  label: string
  imagePath?: string
  imageAlt?: string
}

interface PortableQuestionBaseV1 {
  key: string
  type: Exclude<Question['type'], 'typed-answer' | 'ordering' | 'matching' | 'connections'>
  assignedTo?: string | null
  prompt: string
  supportingText?: string
  timeLimitSeconds?: number
  points?: number
  revealCaption?: string
  media?: QuestionMedia
  mediaVisibility?: MediaVisibility
  presentationChoiceVisibility?: PresentationChoiceVisibility
}

export type PortableQuestionV1 =
  | (PortableQuestionBaseV1 & {
      type: 'single-choice'
      options: PortableChoiceOptionV1[]
      correctOptionKey: string
      randomiseOptions?: boolean
    })
  | (PortableQuestionBaseV1 & {
      type: 'multiple-select'
      options: PortableChoiceOptionV1[]
      correctOptionKeys: string[]
      minimumSelections: number
      maximumSelections: number
      scoringMode: 'exact' | 'partial-wipeout'
      randomiseOptions?: boolean
    })
  | (PortableQuestionBaseV1 & {
      type: 'true-false'
      correctValue: boolean
    })
  | (PortableQuestionBaseV1 & {
      type: 'slider'
      minimum: number
      maximum: number
      step: number
      correctValue: number
      tolerance: number
      prefix?: string
      suffix?: string
      unitLabel?: string
    })
  | (PortableQuestionBaseV1 & {
      type: 'pinpoint'
      media: Extract<QuestionMedia, { type: 'image' }>
      targetX: number
      targetY: number
      targetRadius: number
    })
  | (PortableQuestionBaseV1 & {
      type: 'mashup'
      media: Extract<QuestionMedia, { type: 'image' }>
      correctPersonKeys: [string, string]
    })

export interface PortableQuizV1 {
  title: string
  quizType: QuizType
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  coverImagePath: string | null
  competitors: PortableCompetitorV1[]
  roster: PortableRosterMemberV1[]
  questions: PortableQuestionV1[]
}

export interface KatwedQuizFileV1 {
  format: typeof KATWED_QUIZ_FORMAT
  formatVersion: typeof KATWED_QUIZ_LEGACY_FORMAT_VERSION
  quiz: PortableQuizV1
}

export type PortableQuestionV2 = PortableQuestionV1 | (Omit<PortableQuestionBaseV1, 'type'> & {
  type: 'typed-answer'
  correctAnswer: string
  acceptedAnswers: string[]
})

export interface PortableQuizV2 extends Omit<PortableQuizV1, 'questions'> {
  questions: PortableQuestionV2[]
}

export interface KatwedQuizFileV2 {
  format: typeof KATWED_QUIZ_FORMAT
  formatVersion: typeof KATWED_QUIZ_V2_FORMAT_VERSION
  quiz: PortableQuizV2
}

type WithV3Scoring<T> = T extends unknown ? T & {
  speedScoringEnabled?: boolean
  doubleScore?: boolean
} : never

export type PortableQuestionV3 = WithV3Scoring<PortableQuestionV2>

export interface PortableQuizV3 extends Omit<PortableQuizV2, 'questions'> {
  questions: PortableQuestionV3[]
}

export interface KatwedQuizFileV3 {
  format: typeof KATWED_QUIZ_FORMAT
  formatVersion: typeof KATWED_QUIZ_V3_FORMAT_VERSION
  quiz: PortableQuizV3
}

export interface PortableQuizV4 extends PortableQuizV3 {
  answerPaletteId: AnswerPaletteId
  customAnswerColours: AnswerColourTuple
}

export interface KatwedQuizFileV4 {
  format: typeof KATWED_QUIZ_FORMAT
  formatVersion: typeof KATWED_QUIZ_V4_FORMAT_VERSION
  quiz: PortableQuizV4
}

export interface PortableQuizV5 extends PortableQuizV4 {
  soundPackId: SoundPackId
}

export interface KatwedQuizFileV5 {
  format: typeof KATWED_QUIZ_FORMAT
  formatVersion: typeof KATWED_QUIZ_V5_FORMAT_VERSION
  quiz: PortableQuizV5
}

export type PortableQuestionV6 = Exclude<PortableQuestionV3, { type: 'pinpoint' }> | (
  Omit<Extract<PortableQuestionV3, { type: 'pinpoint' }>, 'targetX' | 'targetY' | 'targetRadius'> & { target: PinpointTarget }
)
export interface PortableQuizV6 extends Omit<PortableQuizV5, 'questions'> { questions: PortableQuestionV6[] }
export interface KatwedQuizFileV6 {
  format: typeof KATWED_QUIZ_FORMAT
  formatVersion: typeof KATWED_QUIZ_V6_FORMAT_VERSION
  quiz: PortableQuizV6
}

export interface PortableRoundV7 { key: string; title: string; subtitle: string; introEnabled: boolean }
export type PortableQuestionV7 = PortableQuestionV6 & { roundKey: string }
export interface PortableQuizV7 extends Omit<PortableQuizV6, 'questions'> { rounds: PortableRoundV7[]; questions: PortableQuestionV7[] }
export interface KatwedQuizFileV7 { format: typeof KATWED_QUIZ_FORMAT; formatVersion: typeof KATWED_QUIZ_V7_FORMAT_VERSION; quiz: PortableQuizV7 }

export interface PortableTextItemV8 { key: string; label: string }
type ArrangementBaseV8 = WithV3Scoring<Omit<PortableQuestionBaseV1, 'type'>> & { roundKey: string }
export type PortableQuestionV8 = PortableQuestionV7
  | (ArrangementBaseV8 & { type: 'ordering'; items: PortableTextItemV8[]; correctItemKeys: string[] })
  | (ArrangementBaseV8 & { type: 'matching'; leftItems: PortableTextItemV8[]; rightItems: PortableTextItemV8[]; correctPairs: { leftKey: string; rightKey: string }[]; scoringMode: 'exact' | 'partial' })
export interface PortableQuizV8 extends Omit<PortableQuizV7, 'questions'> { questions: PortableQuestionV8[] }
export interface KatwedQuizFileV8 { format: typeof KATWED_QUIZ_FORMAT; formatVersion: typeof KATWED_QUIZ_V8_FORMAT_VERSION; quiz: PortableQuizV8 }

export type PortableQuestionV9 = PortableQuestionV8 | (ArrangementBaseV8 & {
  type: 'connections'; clues: { key: string; text: string }[]; correctAnswer: string; acceptedAnswers: string[]
})
export interface PortableQuizV9 extends Omit<PortableQuizV8, 'questions'> { questions: PortableQuestionV9[] }
export interface KatwedQuizFileV9 { format: typeof KATWED_QUIZ_FORMAT; formatVersion: typeof KATWED_QUIZ_FORMAT_VERSION; quiz: PortableQuizV9 }

export type KatwedQuizFile = KatwedQuizFileV1 | KatwedQuizFileV2 | KatwedQuizFileV3 | KatwedQuizFileV4 | KatwedQuizFileV5 | KatwedQuizFileV6 | KatwedQuizFileV7 | KatwedQuizFileV8 | KatwedQuizFileV9
type PortableQuiz = PortableQuizV1 | PortableQuizV2 | PortableQuizV3 | PortableQuizV4 | PortableQuizV5 | PortableQuizV6 | PortableQuizV7 | PortableQuizV8 | PortableQuizV9
type PortableQuestion = PortableQuestionV1 | PortableQuestionV2 | PortableQuestionV3 | PortableQuestionV6 | PortableQuestionV7 | PortableQuestionV8 | PortableQuestionV9
// Common metadata is normalised while each question retains its source-version fields.
type ParsedPortableQuiz = Omit<PortableQuizV6, 'questions'> & { rounds?: PortableRoundV7[]; questions: PortableQuestion[] }

export interface QuizImportSummary {
  title: string
  quizType: QuizType
  questionCount: number
  competitorNames: string[]
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  answerPaletteId: AnswerPaletteId
  soundPackId: SoundPackId
  hasReferencedMedia: boolean
}

export interface ParsedKatwedQuiz {
  portable: KatwedQuizFile
  input: QuizSaveInput
  summary: QuizImportSummary
}

export class KatwedQuizFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KatwedQuizFormatError'
  }
}

function fail(message: string): never {
  throw new KatwedQuizFormatError(message)
}

function record(value: unknown, subject: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${subject} must be an object.`)
  return value as JsonRecord
}

function exactKeys(value: JsonRecord, allowed: readonly string[], subject: string): void {
  const permitted = new Set(allowed)
  const unexpected = Object.keys(value).find((key) => !permitted.has(key))
  if (unexpected) fail(`${subject} contains the unsupported field “${unexpected}”.`)
}

function stringField(value: JsonRecord, key: string, subject: string): string {
  if (typeof value[key] !== 'string') fail(`${subject} must include a text ${key} field.`)
  return value[key]
}

function optionalString(value: JsonRecord, key: string, fallback: string, subject: string): string {
  if (value[key] === undefined) return fallback
  return stringField(value, key, subject)
}

function numberField(value: JsonRecord, key: string, subject: string): number {
  const result = value[key]
  if (typeof result !== 'number' || !Number.isFinite(result)) fail(`${subject} must include a numeric ${key} field.`)
  return result
}

function optionalNumber(value: JsonRecord, key: string, fallback: number, subject: string): number {
  return value[key] === undefined ? fallback : numberField(value, key, subject)
}

function booleanField(value: JsonRecord, key: string, subject: string): boolean {
  if (typeof value[key] !== 'boolean') fail(`${subject} must include a Boolean ${key} field.`)
  return value[key]
}

function optionalBoolean(value: JsonRecord, key: string, fallback: boolean, subject: string): boolean {
  return value[key] === undefined ? fallback : booleanField(value, key, subject)
}

function arrayField(value: JsonRecord, key: string, subject: string): unknown[] {
  if (!Array.isArray(value[key])) fail(`${subject} must include an array ${key} field.`)
  return value[key]
}

function parseKey(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !keyPattern.test(value)) {
    fail(`${subject} must use 1–64 letters, numbers, underscores or hyphens, beginning with a letter or number.`)
  }
  return value
}

function uniqueKey(key: string, keys: Set<string>, subject: string): void {
  if (keys.has(key)) fail(`${subject} keys must be unique.`)
  keys.add(key)
}

export function isSafeKatwedMediaReference(value: string): boolean {
  const reference = value.trim()
  if (!reference || [...reference].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })) return false
  if (reference.startsWith('/') && !reference.startsWith('//') && !reference.startsWith('/\\')) return true
  if (/^demo-image:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) return true
  try {
    return new URL(reference).protocol === 'https:'
  } catch {
    return false
  }
}

function safeMediaReference(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !isSafeKatwedMediaReference(value)) {
    fail(`${subject} must use a safe HTTPS or Katwed application image reference.`)
  }
  return value.trim()
}

function parseMedia(value: unknown, subject: string, formatVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): QuestionMedia {
  const media = record(value, `${subject} media`)
  const type = stringField(media, 'type', `${subject} media`)
  switch (type) {
    case 'none':
      exactKeys(media, ['type'], `${subject} media`)
      return { type }
    case 'image': {
      exactKeys(
        media,
        formatVersion >= 3
          ? ['type', 'path', 'altText', 'revealEffect', 'revealDurationSeconds', 'tileGridSize']
          : ['type', 'path', 'altText', 'revealEffect', 'revealDurationSeconds'],
        `${subject} media`,
      )
      const revealEffect = stringField(media, 'revealEffect', `${subject} media`)
      if (!imageRevealEffects.has(revealEffect as ImageRevealEffect)) fail(`${subject} has an unsupported image reveal effect.`)
      const result: Extract<QuestionMedia, { type: 'image' }> = {
        type,
        path: safeMediaReference(media.path, `${subject} image path`),
        altText: stringField(media, 'altText', `${subject} media`),
        revealEffect: revealEffect as ImageRevealEffect,
        revealDurationSeconds: numberField(media, 'revealDurationSeconds', `${subject} media`),
      }
      if (media.tileGridSize !== undefined) {
        const tileGridSize = numberField(media, 'tileGridSize', `${subject} media`)
        if (revealEffect !== 'tiles' || !TILE_GRID_SIZES.includes(tileGridSize as 6 | 8 | 12 | 16)) {
          fail(`${subject} has an unsupported tile grid.`)
        }
        result.tileGridSize = tileGridSize as 6 | 8 | 12 | 16
      }
      return result
    }
    case 'youtube': {
      exactKeys(media, ['type', 'videoId', 'startSeconds', 'endSeconds'], `${subject} media`)
      const result: Extract<QuestionMedia, { type: 'youtube' }> = {
        type,
        videoId: stringField(media, 'videoId', `${subject} media`),
      }
      if (media.startSeconds !== undefined) result.startSeconds = numberField(media, 'startSeconds', `${subject} media`)
      if (media.endSeconds !== undefined) result.endSeconds = numberField(media, 'endSeconds', `${subject} media`)
      return result
    }
    default:
      return fail(`${subject} has an unsupported media type.`)
  }
}

function parseTextItems(value: unknown, subject: string): PortableTextItemV8[] {
  if (!Array.isArray(value)) fail(`${subject} needs an item array.`)
  const items = value.map((item) => {
    const row = record(item, subject)
    exactKeys(row, ['key', 'label'], subject)
    return { key: parseKey(row.key, subject), label: stringField(row, 'label', subject).trim() }
  })
  if (!validTextItems(items.map((item) => ({ id: item.key, label: item.label })))) fail(`${subject} needs 2–8 unique text items of 1–120 characters.`)
  return items
}

function parseOption(value: unknown, questionNumber: number, optionNumber: number): PortableChoiceOptionV1 {
  const subject = `Question ${questionNumber} option ${optionNumber}`
  const option = record(value, subject)
  exactKeys(option, ['key', 'label', 'imagePath', 'imageAlt'], subject)
  const result: PortableChoiceOptionV1 = {
    key: parseKey(option.key, `${subject} key`),
    label: stringField(option, 'label', subject),
  }
  if (option.imagePath !== undefined) result.imagePath = safeMediaReference(option.imagePath, `${subject} image path`)
  if (option.imageAlt !== undefined) result.imageAlt = stringField(option, 'imageAlt', subject)
  return result
}

const commonQuestionKeys = [
  'key', 'type', 'assignedTo', 'prompt', 'supportingText', 'timeLimitSeconds', 'points',
  'revealCaption', 'media', 'mediaVisibility', 'presentationChoiceVisibility',
] as const

function parseQuestion(value: unknown, index: number, formatVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): PortableQuestion {
  const subject = `Question ${index + 1}`
  const question = record(value, subject)
  const type = stringField(question, 'type', subject)
  const variantKeys: Record<Question['type'], readonly string[]> = {
    connections: ['clues', 'correctAnswer', 'acceptedAnswers'],
    'single-choice': ['options', 'correctOptionKey', 'randomiseOptions'],
    'multiple-select': ['options', 'correctOptionKeys', 'minimumSelections', 'maximumSelections', 'scoringMode', 'randomiseOptions'],
    'true-false': ['correctValue'],
    slider: ['minimum', 'maximum', 'step', 'correctValue', 'tolerance', 'prefix', 'suffix', 'unitLabel'],
    pinpoint: formatVersion >= 6 ? ['target'] : ['targetX', 'targetY', 'targetRadius'],
    'typed-answer': ['correctAnswer', 'acceptedAnswers'],
    mashup: ['correctPersonKeys'],
    ordering: ['items', 'correctItemKeys'],
    matching: ['leftItems', 'rightItems', 'correctPairs', 'scoringMode'],
  }
  if (!(type in variantKeys)) fail(`${subject} has an unsupported question type.`)
  if (formatVersion < 9 && type === 'connections') fail(`${subject} requires format version 9.`)
  if (formatVersion < 8 && (type === 'ordering' || type === 'matching')) fail(`${subject} requires format version 8.`)
  if (formatVersion === 1 && type === 'typed-answer') fail(`${subject} uses Typed Answer, which requires format version 2.`)
  const scoringKeys = formatVersion >= 3 ? ['speedScoringEnabled', 'doubleScore'] : []
  exactKeys(question, [...commonQuestionKeys, ...(formatVersion >= 7 ? ['roundKey'] : []), ...scoringKeys, ...variantKeys[type as Question['type']]], subject)

  const key = parseKey(question.key, `${subject} key`)
  const assignedTo = question.assignedTo === undefined || question.assignedTo === null
    ? null
    : parseKey(question.assignedTo, `${subject} assignment`)
  const mediaVisibility = optionalString(question, 'mediaVisibility', 'both', subject)
  if (!mediaVisibilities.has(mediaVisibility as MediaVisibility)) fail(`${subject} has an unsupported media visibility.`)
  const presentationChoiceVisibility = optionalString(question, 'presentationChoiceVisibility', 'show', subject)
  if (!presentationChoiceVisibilities.has(presentationChoiceVisibility as PresentationChoiceVisibility)) {
    fail(`${subject} has an unsupported presentation choice visibility.`)
  }
  const base = {
    key,
    ...(formatVersion >= 7 ? { roundKey: parseKey(question.roundKey, `${subject} round reference`) } : {}),
    type: type as Question['type'],
    assignedTo,
    prompt: stringField(question, 'prompt', subject),
    supportingText: optionalString(question, 'supportingText', '', subject),
    timeLimitSeconds: optionalNumber(question, 'timeLimitSeconds', 30, subject),
    points: optionalNumber(question, 'points', 1000, subject),
    revealCaption: optionalString(question, 'revealCaption', '', subject),
    media: question.media === undefined ? { type: 'none' } as const : parseMedia(question.media, subject, formatVersion),
    mediaVisibility: mediaVisibility as MediaVisibility,
    presentationChoiceVisibility: presentationChoiceVisibility as PresentationChoiceVisibility,
    ...(formatVersion >= 3 ? {
      speedScoringEnabled: optionalBoolean(question, 'speedScoringEnabled', false, subject),
      doubleScore: optionalBoolean(question, 'doubleScore', false, subject),
    } : {}),
  }

  switch (type) {
    case 'connections': {
      const clues = arrayField(question, 'clues', subject).map(value => {
        const clue = record(value, subject)
        exactKeys(clue, ['key', 'text'], subject)
        return { key: parseKey(clue.key, subject), text: stringField(clue, 'text', subject).trim() }
      })
      if (!validConnectionClues(clues.map(clue => ({ id: clue.key, text: clue.text })))) fail(`${subject} needs 2–6 distinct valid clues.`)
      return { ...base, roundKey: parseKey(question.roundKey, subject), type, clues, speedScoringEnabled: false,
        correctAnswer: stringField(question, 'correctAnswer', subject), acceptedAnswers: arrayField(question, 'acceptedAnswers', subject).map(value => {
          if (typeof value !== 'string') fail(`${subject} alternatives must be text.`)
          return value
        }) }
    }
    case 'ordering': {
      const items = parseTextItems(question.items, subject)
      const correctItemKeys = question.correctItemKeys
      if (!validPermutation(correctItemKeys, items.map((item) => item.key))) fail(`${subject} needs a complete correct order.`)
      return { ...base, roundKey: parseKey(question.roundKey, subject), type, items, correctItemKeys }
    }
    case 'matching': {
      const leftItems = parseTextItems(question.leftItems, subject)
      const rightItems = parseTextItems(question.rightItems, subject)
      const correctPairs = arrayField(question, 'correctPairs', subject).map((value) => {
        const pair = record(value, subject)
        exactKeys(pair, ['leftKey', 'rightKey'], subject)
        return { leftKey: parseKey(pair.leftKey, subject), rightKey: parseKey(pair.rightKey, subject) }
      })
      const allKeys = [...leftItems, ...rightItems].map((item) => item.key)
      if (new Set(allKeys).size !== allKeys.length || !validMatchingPairs(correctPairs.map((pair) => ({ leftId: pair.leftKey, rightId: pair.rightKey })), leftItems.map((item) => item.key), rightItems.map((item) => item.key))) fail(`${subject} needs a complete one-to-one mapping.`)
      const scoringMode = question.scoringMode
      if (scoringMode !== 'exact' && scoringMode !== 'partial') fail(`${subject} has an unsupported scoring mode.`)
      return { ...base, roundKey: parseKey(question.roundKey, subject), type, leftItems, rightItems, correctPairs, scoringMode }
    }
    case 'single-choice': {
      const keys = new Set<string>()
      const options = arrayField(question, 'options', subject).map((option, optionIndex) => {
        const parsed = parseOption(option, index + 1, optionIndex + 1)
        uniqueKey(parsed.key, keys, `${subject} option`)
        return parsed
      })
      const correctOptionKey = parseKey(question.correctOptionKey, `${subject} correct option reference`)
      if (!keys.has(correctOptionKey)) fail(`${subject} has an invalid correct option reference.`)
      return { ...base, type, options, correctOptionKey, randomiseOptions: optionalBoolean(question, 'randomiseOptions', false, subject) }
    }
    case 'multiple-select': {
      const keys = new Set<string>()
      const options = arrayField(question, 'options', subject).map((option, optionIndex) => {
        const parsed = parseOption(option, index + 1, optionIndex + 1)
        uniqueKey(parsed.key, keys, `${subject} option`)
        return parsed
      })
      const correctOptionKeys = arrayField(question, 'correctOptionKeys', subject).map((item) => (
        parseKey(item, `${subject} correct option reference`)
      ))
      if (new Set(correctOptionKeys).size !== correctOptionKeys.length) fail(`${subject} repeats a correct option reference.`)
      if (correctOptionKeys.some((optionKey) => !keys.has(optionKey))) fail(`${subject} has an invalid correct option reference.`)
      const scoringMode = stringField(question, 'scoringMode', subject)
      if (!scoringModes.has(scoringMode as 'exact' | 'partial-wipeout')) fail(`${subject} has an unsupported scoring mode.`)
      return {
        ...base,
        type,
        options,
        correctOptionKeys,
        minimumSelections: numberField(question, 'minimumSelections', subject),
        maximumSelections: numberField(question, 'maximumSelections', subject),
        scoringMode: scoringMode as 'exact' | 'partial-wipeout',
        randomiseOptions: optionalBoolean(question, 'randomiseOptions', false, subject),
      }
    }
    case 'true-false':
      return { ...base, type, correctValue: booleanField(question, 'correctValue', subject) }
    case 'slider':
      return {
        ...base,
        type,
        minimum: numberField(question, 'minimum', subject),
        maximum: numberField(question, 'maximum', subject),
        step: numberField(question, 'step', subject),
        correctValue: numberField(question, 'correctValue', subject),
        tolerance: numberField(question, 'tolerance', subject),
        prefix: optionalString(question, 'prefix', '', subject),
        suffix: optionalString(question, 'suffix', '', subject),
        unitLabel: optionalString(question, 'unitLabel', '', subject),
      }
    case 'pinpoint': {
      if (base.media.type !== 'image') fail(`${subject} must use image media for Pinpoint.`)
      if (formatVersion >= 6) {
        if (!isPinpointTarget(question.target)) fail(`${subject} has an invalid Pinpoint target area.`)
        return { ...base, type, media: base.media, target: structuredClone(question.target) }
      }
      return {
        ...base,
        type,
        media: base.media,
        targetX: numberField(question, 'targetX', subject),
        targetY: numberField(question, 'targetY', subject),
        targetRadius: numberField(question, 'targetRadius', subject),
      }
    }
    case 'typed-answer':
      return {
        ...base,
        type,
        correctAnswer: stringField(question, 'correctAnswer', subject),
        acceptedAnswers: arrayField(question, 'acceptedAnswers', subject).map((answer) => {
          if (typeof answer !== 'string') fail(`${subject} accepted answers must be text.`)
          return answer
        }),
      }
    case 'mashup': {
      if (base.media.type !== 'image') fail(`${subject} must use image media for Mash-up.`)
      const correctPersonKeys = arrayField(question, 'correctPersonKeys', subject).map((item) => (
        parseKey(item, `${subject} correct person reference`)
      ))
      if (correctPersonKeys.length !== 2 || new Set(correctPersonKeys).size !== 2) {
        fail(`${subject} must reference exactly two different correct people.`)
      }
      return { ...base, type, media: base.media, correctPersonKeys: correctPersonKeys as [string, string] }
    }
    default:
      return fail(`${subject} has an unsupported question type.`)
  }
}

function parsePortableQuiz(value: unknown, formatVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): ParsedPortableQuiz {
  const quiz = record(value, 'The quiz')
  exactKeys(quiz, [
    'title', 'quizType', 'themeId', 'backgroundId', 'coverImagePath', 'competitors', 'roster', 'questions',
    ...(formatVersion >= 4 ? ['answerPaletteId', 'customAnswerColours'] : []),
    ...(formatVersion >= 5 ? ['soundPackId'] : []),
    ...(formatVersion >= 7 ? ['rounds'] : []),
  ], 'The quiz')
  const quizType = stringField(quiz, 'quizType', 'The quiz')
  if (!isQuizType(quizType)) fail('The quiz has an unsupported quiz type.')
  const themeId = stringField(quiz, 'themeId', 'The quiz')
  if (!isQuizThemeId(themeId)) fail('The quiz has an unsupported theme.')
  const background = quiz.backgroundId
  if (background !== null && !isQuizBackgroundId(background)) fail('The quiz has an unsupported background.')
  if (background !== null && !isQuizBackgroundCompatible(background, themeId)) {
    fail('The quiz background does not belong to its selected theme.')
  }
  const coverImagePath = quiz.coverImagePath === null
    ? null
    : safeMediaReference(quiz.coverImagePath, 'The quiz cover image path')
  const answerPaletteId = formatVersion >= 4
    ? stringField(quiz, 'answerPaletteId', 'The quiz')
    : 'classic'
  if (!isAnswerPaletteId(answerPaletteId)) fail('The quiz has an unsupported answer palette.')
  const customAnswerColours = formatVersion >= 4
    ? arrayField(quiz, 'customAnswerColours', 'The quiz')
    : [...CLASSIC_ANSWER_COLOURS]
  if (!isAnswerColourTuple(customAnswerColours)) {
    fail('The quiz must include exactly eight valid six-digit custom answer colours.')
  }
  const soundPackId = formatVersion >= 5 ? stringField(quiz, 'soundPackId', 'The quiz') : 'katwed'
  if (!isSoundPackId(soundPackId)) fail('The quiz has an unsupported sound pack.')

  const competitorKeys = new Set<string>()
  const competitors = arrayField(quiz, 'competitors', 'The quiz').map((value, index): PortableCompetitorV1 => {
    const subject = `Competitor ${index + 1}`
    const competitor = record(value, subject)
    exactKeys(competitor, ['key', 'displayName'], subject)
    const key = parseKey(competitor.key, `${subject} key`)
    uniqueKey(key, competitorKeys, 'Competitor')
    return { key, displayName: stringField(competitor, 'displayName', subject) }
  })
  if (quizType === 'standard' && competitors.length !== 0) fail('Standard quizzes cannot contain competitors.')
  if (quizType === 'head-to-head' && competitors.length !== 2) fail('Head-to-Head quizzes need exactly two competitors.')

  const rosterKeys = new Set<string>()
  const roster = arrayField(quiz, 'roster', 'The quiz').map((value, index): PortableRosterMemberV1 => {
    const subject = `Person ${index + 1}`
    const member = record(value, subject)
    exactKeys(member, ['key', 'displayName', 'shortName', 'active'], subject)
    const key = parseKey(member.key, `${subject} key`)
    uniqueKey(key, rosterKeys, 'People bank')
    return {
      key,
      displayName: stringField(member, 'displayName', subject),
      shortName: stringField(member, 'shortName', subject),
      active: booleanField(member, 'active', subject),
    }
  })

  const roundKeys = new Set<string>()
  const rounds = formatVersion >= 7 ? arrayField(quiz, 'rounds', 'The quiz').map((value, index): PortableRoundV7 => {
    const subject = `Round ${index + 1}`
    const round = record(value, subject)
    exactKeys(round, ['key', 'title', 'subtitle', 'introEnabled'], subject)
    const key = parseKey(round.key, `${subject} key`)
    uniqueKey(key, roundKeys, 'Round')
    const title = stringField(round, 'title', subject)
    const subtitle = stringField(round, 'subtitle', subject)
    if (!title.trim() || title.length > 80) fail(`${subject} needs a title of 1–80 characters.`)
    if (subtitle.length > 200) fail(`${subject} subtitle must be 200 characters or fewer.`)
    return { key, title, subtitle, introEnabled: booleanField(round, 'introEnabled', subject) }
  }) : undefined
  if (rounds && !rounds.length) fail('A quiz needs at least one round.')
  if (rounds && quizType === 'head-to-head' && rounds.length !== 1) fail('Head-to-Head supports exactly one round.')

  const questionKeys = new Set<string>()
  const questions = arrayField(quiz, 'questions', 'The quiz').map((value, index) => {
    const question = parseQuestion(value, index, formatVersion)
    uniqueKey(question.key, questionKeys, 'Question')
    if (formatVersion >= 7 && (!('roundKey' in question) || !roundKeys.has(String(question.roundKey)))) fail(`Question ${index + 1} has an invalid round reference.`)
    if (quizType === 'standard' && question.assignedTo !== null) fail(`Question ${index + 1} cannot be assigned in a Standard quiz.`)
    if (quizType === 'head-to-head') {
      if (question.type === 'connections') fail('Connections is Standard-only and cannot be imported in Head-to-Head.')
      if (!question.assignedTo) fail(`Question ${index + 1} must be assigned to a competitor.`)
      if (!competitorKeys.has(question.assignedTo)) fail(`Question ${index + 1} has an invalid competitor assignment.`)
      if (
        ('speedScoringEnabled' in question && question.speedScoringEnabled) ||
        ('doubleScore' in question && question.doubleScore)
      ) {
        fail(`Question ${index + 1} cannot use Standard scoring settings in Head-to-Head.`)
      }
    }
    if (question.type === 'mashup') {
      if (question.correctPersonKeys.some((key) => !rosterKeys.has(key))) {
        fail(`Question ${index + 1} has an invalid people-bank reference.`)
      }
      if (question.correctPersonKeys.some((key) => !roster.find((member) => member.key === key)?.active)) {
        fail(`Question ${index + 1} must reference two active people.`)
      }
    }
    return question
  })

  return {
    title: stringField(quiz, 'title', 'The quiz'),
    ...(rounds ? { rounds } : {}),
    quizType,
    themeId,
    backgroundId: background,
    coverImagePath,
    answerPaletteId,
    customAnswerColours,
    soundPackId,
    competitors,
    roster,
    questions,
  }
}

function mapOption(option: PortableChoiceOptionV1, id: string): ChoiceOption {
  const mapped: ChoiceOption = { id, label: option.label }
  if (option.imagePath !== undefined) mapped.imagePath = option.imagePath
  if (option.imageAlt !== undefined) mapped.imageAlt = option.imageAlt
  return mapped
}

export function createQuizSaveInputFromPortable(
  quiz: PortableQuiz | ParsedPortableQuiz,
  createId: IdFactory = () => crypto.randomUUID(),
): QuizSaveInput {
  const quizId = createId()
  const roundIds = new Map<string, string>()
  const rounds = 'rounds' in quiz && quiz.rounds ? quiz.rounds.map((round, displayOrder) => {
    const id = createId()
    roundIds.set(round.key, id)
    return { id, quizId, title: round.title, subtitle: round.subtitle, introEnabled: round.introEnabled, displayOrder }
  }) : [defaultRound(quizId)]
  const competitorIds = new Map<string, string>()
  const headToHeadCompetitors = quiz.competitors.map((competitor, index) => {
    const id = createId()
    competitorIds.set(competitor.key, id)
    return { id, quizId, displayName: competitor.displayName, displayOrder: index as 0 | 1 }
  })
  const rosterIds = new Map<string, string>()
  const roster = quiz.roster.map((member, index) => {
    const id = createId()
    rosterIds.set(member.key, id)
    return { id, quizId, displayName: member.displayName, shortName: member.shortName, active: member.active, displayOrder: index }
  })
  const questions: Question[] = quiz.questions.map((question, index) => {
    const subject = `Question ${index + 1}`
    const base = {
      id: createId(),
      quizId,
      roundId: 'roundKey' in question ? roundIds.get(question.roundKey) ?? fail(`${subject} has an invalid round reference.`) : rounds[0].id,
      assignedCompetitorId: question.assignedTo === null || question.assignedTo === undefined
        ? null
        : competitorIds.get(question.assignedTo) ?? fail(`${subject} has an invalid competitor assignment.`),
      prompt: question.prompt,
      supportingText: question.supportingText ?? '',
      timeLimitSeconds: question.timeLimitSeconds ?? 30,
      points: question.points ?? 1000,
      speedScoringEnabled: 'speedScoringEnabled' in question ? question.speedScoringEnabled ?? false : false,
      doubleScore: 'doubleScore' in question ? question.doubleScore ?? false : false,
      displayOrder: index,
      revealCaption: question.revealCaption ?? '',
      media: structuredClone(question.media ?? { type: 'none' } as const),
      mediaVisibility: question.mediaVisibility ?? 'both',
      presentationChoiceVisibility: question.presentationChoiceVisibility ?? 'show',
    }
    switch (question.type) {
      case 'connections': return { ...base, type: question.type, speedScoringEnabled: false,
        clues: question.clues.map(clue => ({ id: createId(), text: clue.text.trim() })), correctAnswer: question.correctAnswer.trim(), acceptedAnswers: question.acceptedAnswers.map(answer => answer.trim()) }
      case 'ordering': {
        const ids = new Map(question.items.map((item) => [item.key, createId()]))
        return { ...base, type: question.type, items: question.items.map((item) => ({ id: requiredReference(ids, item.key, subject), label: item.label.trim() })), correctItemIds: question.correctItemKeys.map((key) => requiredReference(ids, key, subject)) }
      }
      case 'matching': {
        const ids = new Map([...question.leftItems, ...question.rightItems].map((item) => [item.key, createId()]))
        const mapItems = (items: PortableTextItemV8[]) => items.map((item) => ({ id: requiredReference(ids, item.key, subject), label: item.label.trim() }))
        return { ...base, type: question.type, leftItems: mapItems(question.leftItems), rightItems: mapItems(question.rightItems), correctPairs: question.correctPairs.map((pair) => ({ leftId: requiredReference(ids, pair.leftKey, subject), rightId: requiredReference(ids, pair.rightKey, subject) })), scoringMode: question.scoringMode }
      }
      case 'single-choice': {
        const optionIds = new Map<string, string>()
        const options = question.options.map((option) => {
          const id = createId()
          optionIds.set(option.key, id)
          return mapOption(option, id)
        })
        return {
          ...base,
          type: question.type,
          options,
          correctOptionId: optionIds.get(question.correctOptionKey) ?? fail(`${subject} has an invalid correct option reference.`),
          randomiseOptions: question.randomiseOptions ?? false,
        }
      }
      case 'multiple-select': {
        const optionIds = new Map<string, string>()
        const options = question.options.map((option) => {
          const id = createId()
          optionIds.set(option.key, id)
          return mapOption(option, id)
        })
        return {
          ...base,
          type: question.type,
          options,
          correctOptionIds: question.correctOptionKeys.map((key) => (
            optionIds.get(key) ?? fail(`${subject} has an invalid correct option reference.`)
          )),
          minimumSelections: question.minimumSelections,
          maximumSelections: question.maximumSelections,
          scoringMode: question.scoringMode,
          randomiseOptions: question.randomiseOptions ?? false,
        }
      }
      case 'true-false':
        return { ...base, type: question.type, correctValue: question.correctValue }
      case 'slider':
        return {
          ...base,
          type: question.type,
          minimum: question.minimum,
          maximum: question.maximum,
          step: question.step,
          correctValue: question.correctValue,
          tolerance: question.tolerance,
          prefix: question.prefix ?? '',
          suffix: question.suffix ?? '',
          unitLabel: question.unitLabel ?? '',
        }
      case 'pinpoint':
        return {
          ...base,
          type: question.type,
          media: structuredClone(question.media),
          target: normalisePinpointTarget(question),
        }
      case 'typed-answer':
        return {
          ...base,
          type: question.type,
          correctAnswer: question.correctAnswer,
          acceptedAnswers: [...question.acceptedAnswers],
        }
      case 'mashup':
        return {
          ...base,
          type: question.type,
          media: structuredClone(question.media),
          correctMemberIds: question.correctPersonKeys.map((key) => (
            rosterIds.get(key) ?? fail(`${subject} has an invalid people-bank reference.`)
          )) as [string, string],
        }
    }
  })
  const input: QuizSaveInput = {
    title: quiz.title,
    quizType: quiz.quizType,
    headToHeadCompetitors,
    rounds,
    coverImagePath: quiz.coverImagePath,
    themeId: quiz.themeId,
    backgroundId: quiz.backgroundId,
    answerPaletteId: 'answerPaletteId' in quiz ? quiz.answerPaletteId : 'classic',
    customAnswerColours: 'customAnswerColours' in quiz ? quiz.customAnswerColours : CLASSIC_ANSWER_COLOURS,
    soundPackId: 'soundPackId' in quiz ? quiz.soundPackId : 'katwed',
    roster,
    questions,
  }
  const validation = validateQuizSave(input)
  if (validation.length) fail(`The quiz definition is invalid. ${validation[0]}`)
  return input
}

function hasReferencedMedia(quiz: PortableQuiz | ParsedPortableQuiz): boolean {
  return Boolean(quiz.coverImagePath) || quiz.questions.some((question) => (
    question.media?.type === 'image' ||
    ('options' in question && question.options.some((option) => Boolean(option.imagePath)))
  ))
}

export function parseKatwedQuizJson(
  json: string,
  createId: IdFactory = () => crypto.randomUUID(),
): ParsedKatwedQuiz {
  if (new TextEncoder().encode(json).byteLength > KATWED_QUIZ_MAX_FILE_BYTES) {
    fail('Choose a Katwed quiz file no larger than 2 MB.')
  }
  let value: unknown
  try {
    value = JSON.parse(json) as unknown
  } catch {
    return fail('The selected file is not valid JSON.')
  }
  const file = record(value, 'The file')
  exactKeys(file, ['format', 'formatVersion', 'quiz'], 'The file')
  if (file.format !== KATWED_QUIZ_FORMAT) fail('This is not a Katwed quiz file.')
  if (
    file.formatVersion !== KATWED_QUIZ_LEGACY_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V2_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V3_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V4_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V5_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V6_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V7_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_V8_FORMAT_VERSION &&
    file.formatVersion !== KATWED_QUIZ_FORMAT_VERSION
  ) {
    fail('This Katwed quiz format version is not supported.')
  }
  const formatVersion = file.formatVersion as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  const quiz = parsePortableQuiz(file.quiz, formatVersion)
  const portable = {
    format: KATWED_QUIZ_FORMAT,
    formatVersion,
    quiz,
  } as KatwedQuizFile
  return {
    portable,
    input: createQuizSaveInputFromPortable(quiz, createId),
    summary: {
      title: quiz.title,
      quizType: quiz.quizType,
      questionCount: quiz.questions.length,
      competitorNames: quiz.competitors.map((competitor) => competitor.displayName),
      themeId: quiz.themeId,
      backgroundId: quiz.backgroundId,
      answerPaletteId: quiz.answerPaletteId,
      soundPackId: quiz.soundPackId,
      hasReferencedMedia: hasReferencedMedia(quiz),
    },
  }
}

export async function parseKatwedQuizFile(
  file: File,
  createId: IdFactory = () => crypto.randomUUID(),
): Promise<ParsedKatwedQuiz> {
  if (file.size > KATWED_QUIZ_MAX_FILE_BYTES) fail('Choose a Katwed quiz file no larger than 2 MB.')
  if (!file.name.toLocaleLowerCase('en-GB').endsWith(KATWED_QUIZ_FILE_EXTENSION) && file.type !== 'application/json') {
    fail('Choose a .katwed.json quiz file.')
  }
  const json = typeof file.text === 'function'
    ? await file.text()
    : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new KatwedQuizFormatError('The quiz file could not be read.'))
        reader.onerror = () => reject(new KatwedQuizFormatError('The quiz file could not be read.'))
        reader.readAsText(file)
      })
  return parseKatwedQuizJson(json, createId)
}

function requiredReference(map: ReadonlyMap<string, string>, id: string, subject: string): string {
  return map.get(id) ?? fail(`The quiz cannot be exported because ${subject} is invalid.`)
}

function exportOptions(options: readonly ChoiceOption[]): { options: PortableChoiceOptionV1[]; keys: Map<string, string> } {
  const keys = new Map<string, string>()
  const portable = options.map((option, index) => {
    const key = `option-${index + 1}`
    keys.set(option.id, key)
    const result: PortableChoiceOptionV1 = { key, label: option.label }
    if (option.imagePath !== undefined) result.imagePath = option.imagePath
    if (option.imageAlt !== undefined) result.imageAlt = option.imageAlt
    return result
  })
  return { options: portable, keys }
}

export function exportQuizToPortable(source: Quiz): KatwedQuizFileV9 {
  const quiz = normaliseQuizRounds(source)
  const validation = validateQuizSave(quiz)
  if (validation.length) fail(validation[0])
  const rounds = orderedRounds(quiz.rounds)
  const roundKeys = new Map(rounds.map((round, index) => [round.id, `round-${index + 1}`]))
  const competitors = [...quiz.headToHeadCompetitors].sort((a, b) => a.displayOrder - b.displayOrder)
  const competitorKeys = new Map(competitors.map((competitor, index) => [competitor.id, `competitor-${index + 1}`]))
  const roster = [...quiz.roster].sort((a, b) => a.displayOrder - b.displayOrder)
  const rosterKeys = new Map(roster.map((member, index) => [member.id, `person-${index + 1}`]))
  const questions = orderedRoundQuestions(quiz).map((question, index): PortableQuestionV9 => {
    const base = {
      key: `q${index + 1}`,
      roundKey: requiredReference(roundKeys, question.roundId, 'round reference'),
      assignedTo: question.assignedCompetitorId === null
        ? null
        : requiredReference(competitorKeys, question.assignedCompetitorId, `question ${index + 1}'s competitor assignment`),
      prompt: question.prompt,
      supportingText: question.supportingText,
      timeLimitSeconds: question.timeLimitSeconds,
      points: question.points,
      speedScoringEnabled: question.speedScoringEnabled,
      doubleScore: question.doubleScore,
      revealCaption: question.revealCaption,
      media: structuredClone(question.media),
      mediaVisibility: question.mediaVisibility,
      presentationChoiceVisibility: question.presentationChoiceVisibility,
    }
    switch (question.type) {
      case 'connections': return { ...base, type: question.type, speedScoringEnabled: false, clues: question.clues.map((clue, i) => ({ key: `clue-${i + 1}`, text: clue.text.trim() })), correctAnswer: question.correctAnswer.trim(), acceptedAnswers: question.acceptedAnswers.map(answer => answer.trim()) }
      case 'ordering': {
        const keys = new Map(question.items.map((item, i) => [item.id, `item-${i + 1}`]))
        return { ...base, type: question.type, items: question.items.map((item) => ({ key: requiredReference(keys, item.id, 'item'), label: item.label.trim() })), correctItemKeys: question.correctItemIds.map((id) => requiredReference(keys, id, 'correct order')) }
      }
      case 'matching': {
        const keys = new Map([...question.leftItems.map((item, i) => [item.id, `left-${i + 1}`] as const), ...question.rightItems.map((item, i) => [item.id, `right-${i + 1}`] as const)])
        const mapItems = (items: typeof question.leftItems) => items.map((item) => ({ key: requiredReference(keys, item.id, 'item'), label: item.label.trim() }))
        return { ...base, type: question.type, leftItems: mapItems(question.leftItems), rightItems: mapItems(question.rightItems), correctPairs: question.correctPairs.map((pair) => ({ leftKey: requiredReference(keys, pair.leftId, 'pair'), rightKey: requiredReference(keys, pair.rightId, 'pair') })), scoringMode: question.scoringMode }
      }
      case 'single-choice': {
        const { options, keys } = exportOptions(question.options)
        return {
          ...base,
          type: question.type,
          options,
          correctOptionKey: requiredReference(keys, question.correctOptionId, `question ${index + 1}'s correct option`),
          randomiseOptions: question.randomiseOptions,
        }
      }
      case 'multiple-select': {
        const { options, keys } = exportOptions(question.options)
        return {
          ...base,
          type: question.type,
          options,
          correctOptionKeys: question.correctOptionIds.map((id) => requiredReference(keys, id, `question ${index + 1}'s correct option`)),
          minimumSelections: question.minimumSelections,
          maximumSelections: question.maximumSelections,
          scoringMode: question.scoringMode,
          randomiseOptions: question.randomiseOptions,
        }
      }
      case 'true-false':
        return { ...base, type: question.type, correctValue: question.correctValue }
      case 'slider':
        return {
          ...base,
          type: question.type,
          minimum: question.minimum,
          maximum: question.maximum,
          step: question.step,
          correctValue: question.correctValue,
          tolerance: question.tolerance,
          prefix: question.prefix,
          suffix: question.suffix,
          unitLabel: question.unitLabel,
        }
      case 'pinpoint':
        return {
          ...base,
          type: question.type,
          media: structuredClone(question.media),
          target: normalisePinpointTarget(question)!,
        }
      case 'typed-answer':
        return {
          ...base,
          type: question.type,
          correctAnswer: question.correctAnswer,
          acceptedAnswers: [...question.acceptedAnswers],
        }
      case 'mashup':
        return {
          ...base,
          type: question.type,
          media: structuredClone(question.media),
          correctPersonKeys: question.correctMemberIds.map((id) => (
            requiredReference(rosterKeys, id, `question ${index + 1}'s correct person`)
          )) as [string, string],
        }
    }
  })
  return {
    format: KATWED_QUIZ_FORMAT,
    formatVersion: KATWED_QUIZ_FORMAT_VERSION,
    quiz: {
      title: quiz.title,
      quizType: quiz.quizType,
      themeId: quiz.themeId,
      backgroundId: quiz.backgroundId,
      answerPaletteId: quiz.answerPaletteId,
      customAnswerColours: [...quiz.customAnswerColours] as unknown as AnswerColourTuple,
      soundPackId: quiz.soundPackId,
      coverImagePath: quiz.coverImagePath,
      competitors: competitors.map((competitor) => ({
        key: requiredReference(competitorKeys, competitor.id, 'a competitor key'),
        displayName: competitor.displayName,
      })),
      roster: roster.map((member) => ({
        key: requiredReference(rosterKeys, member.id, 'a people-bank key'),
        displayName: member.displayName,
        shortName: member.shortName,
        active: member.active,
      })),
      rounds: rounds.map((round) => ({ key: roundKeys.get(round.id)!, title: round.title, subtitle: round.subtitle, introEnabled: round.introEnabled })),
      questions,
    },
  }
}

export function serialiseKatwedQuiz(quiz: Quiz): string {
  return `${JSON.stringify(exportQuizToPortable(quiz), null, 2)}\n`
}

export function createKatwedQuizFilename(title: string): string {
  const stem = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return `${stem || 'katwed-quiz'}${KATWED_QUIZ_FILE_EXTENSION}`
}
