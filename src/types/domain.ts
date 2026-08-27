export type GamePhase = 'lobby' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'finished'
export type SessionStatus = 'active' | 'closed'
export type QuestionType =
  | 'single-choice'
  | 'multiple-select'
  | 'true-false'
  | 'slider'
  | 'pinpoint'
  | 'typed-answer'
  | 'mashup'

export type ImageRevealEffect = 'immediate' | 'blur' | 'pixelate' | 'tiles' | 'zoom-out'
export const TILE_GRID_SIZES = [6, 8, 12, 16] as const
export type TileGridSize = typeof TILE_GRID_SIZES[number]
export type MediaVisibility = 'presentation' | 'players' | 'both'
export type PresentationChoiceVisibility = 'show' | 'hide' | 'after-lock'

export const QUIZ_TYPE_IDS = ['standard', 'head-to-head'] as const
export type QuizType = typeof QUIZ_TYPE_IDS[number]

export const QUIZ_THEME_IDS = ['katwed', 'midnight', 'sunset', 'arcade', 'mint', 'paper'] as const
export type QuizThemeId = typeof QUIZ_THEME_IDS[number]
export type SoundPackId = 'katwed' | 'none'

export const QUIZ_BACKGROUND_IDS = [
  'katwed-bubbles',
  'katwed-confetti',
  'katwed-ribbons',
  'midnight-aurora',
  'midnight-glow',
  'midnight-stars',
  'sunset-horizon',
  'sunset-lights',
  'sunset-ribbons',
  'arcade-circuit',
  'arcade-grid',
  'arcade-neon',
  'mint-depth',
  'mint-shapes',
  'mint-waves',
  'paper-collage',
  'paper-geometry',
  'paper-notebook',
] as const
export type QuizBackgroundId = typeof QUIZ_BACKGROUND_IDS[number]

export const ANSWER_PALETTE_IDS = [
  'classic',
  'katwed',
  'festive',
  'tropical',
  'summer',
  'sports',
  'arcade',
  'neon',
  'pastel',
  'retro',
  'ocean',
  'forest',
  'galaxy',
  'sunset',
  'autumn',
  'winter',
  'halloween',
  'custom',
] as const
export type AnswerPaletteId = typeof ANSWER_PALETTE_IDS[number]
export type AnswerColourTuple = readonly [string, string, string, string, string, string, string, string]

export type QuestionMedia =
  | { type: 'none' }
  | {
      type: 'image'
      path: string
      altText: string
      revealEffect: ImageRevealEffect
      revealDurationSeconds: number
      tileGridSize?: TileGridSize
    }
  | {
      type: 'youtube'
      videoId: string
      startSeconds?: number
      endSeconds?: number
    }

export interface ChoiceOption {
  id: string
  label: string
  imagePath?: string
  imageAlt?: string
}

interface QuestionBase {
  id: string
  quizId: string
  assignedCompetitorId: string | null
  prompt: string
  supportingText: string
  timeLimitSeconds: number
  points: number
  speedScoringEnabled: boolean
  doubleScore: boolean
  displayOrder: number
  revealCaption: string
  media: QuestionMedia
  mediaVisibility: MediaVisibility
  presentationChoiceVisibility: PresentationChoiceVisibility
}

export interface SingleChoiceQuestion extends QuestionBase {
  type: 'single-choice'
  options: ChoiceOption[]
  correctOptionId: string
  randomiseOptions: boolean
}

export interface MultipleSelectQuestion extends QuestionBase {
  type: 'multiple-select'
  options: ChoiceOption[]
  correctOptionIds: string[]
  minimumSelections: number
  maximumSelections: number
  scoringMode: 'exact' | 'partial-wipeout'
  randomiseOptions: boolean
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'true-false'
  correctValue: boolean
}

export interface SliderQuestion extends QuestionBase {
  type: 'slider'
  minimum: number
  maximum: number
  step: number
  correctValue: number
  tolerance: number
  prefix: string
  suffix: string
  unitLabel: string
}

export interface PinpointQuestion extends QuestionBase {
  type: 'pinpoint'
  media: Extract<QuestionMedia, { type: 'image' }>
  targetX: number
  targetY: number
  targetRadius: number
}

export interface TypedAnswerQuestion extends QuestionBase {
  type: 'typed-answer'
  correctAnswer: string
  acceptedAnswers: string[]
}

export interface MashupQuestion extends QuestionBase {
  type: 'mashup'
  media: Extract<QuestionMedia, { type: 'image' }>
  correctMemberIds: readonly [string, string]
}

export type Question =
  | SingleChoiceQuestion
  | MultipleSelectQuestion
  | TrueFalseQuestion
  | SliderQuestion
  | PinpointQuestion
  | TypedAnswerQuestion
  | MashupQuestion

export type PlayerAnswerPayload =
  | { type: 'single-choice'; optionId: string }
  | { type: 'multiple-select'; optionIds: string[] }
  | { type: 'true-false'; value: boolean }
  | { type: 'slider'; value: number }
  | { type: 'pinpoint'; x: number; y: number }
  | { type: 'typed-answer'; value: string }
  | { type: 'mashup'; memberIds: readonly [string, string] }

export type HeadToHeadResolutionStatus = 'answered' | 'skipped'
export type HeadToHeadResultStatus = 'correct' | 'incorrect' | 'skipped'

export type SafeQuestion =
  | (Omit<SingleChoiceQuestion, 'correctOptionId' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<MultipleSelectQuestion, 'correctOptionIds' | 'scoringMode' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<TrueFalseQuestion, 'correctValue' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<SliderQuestion, 'correctValue' | 'tolerance' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<PinpointQuestion, 'targetX' | 'targetY' | 'targetRadius' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<TypedAnswerQuestion, 'correctAnswer' | 'acceptedAnswers' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<MashupQuestion, 'correctMemberIds' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)

interface SafeAssignment {
  assignedCompetitorId?: string | null
}

interface QuestionProgress {
  questionNumber: number
  totalQuestions: number
}

export type RevealPayload =
  | {
      type: 'single-choice'
      correctOptionId: string
      caption: string
      optionCounts: Record<string, number>
    }
  | {
      type: 'multiple-select'
      correctOptionIds: string[]
      scoringMode: 'exact' | 'partial-wipeout'
      caption: string
      optionCounts: Record<string, number>
    }
  | {
      type: 'true-false'
      correctValue: boolean
      caption: string
      counts: { true: number; false: number }
    }
  | {
      type: 'slider'
      correctValue: number
      tolerance: number
      caption: string
      values: number[]
    }
  | {
      type: 'pinpoint'
      targetX: number
      targetY: number
      targetRadius: number
      caption: string
      points: Array<{ x: number; y: number }>
    }
  | {
      type: 'mashup'
      correctMemberIds: readonly [string, string]
      correctNames: readonly [string, string]
      caption: string
    }
  | {
      type: 'typed-answer'
      correctAnswer: string
      caption: string
    }

export interface RosterMember {
  id: string
  quizId: string
  displayName: string
  shortName: string
  active: boolean
  displayOrder: number
}

export interface HeadToHeadCompetitor {
  id: string
  quizId: string
  displayName: string
  displayOrder: 0 | 1
}

export interface Quiz {
  id: string
  title: string
  quizType: QuizType
  headToHeadCompetitors: HeadToHeadCompetitor[]
  coverImagePath: string | null
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  answerPaletteId: AnswerPaletteId
  customAnswerColours: AnswerColourTuple
  soundPackId: SoundPackId
  roster: RosterMember[]
  questions: Question[]
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Player {
  id: string
  sessionId: string
  nickname: string
  competitorId?: string | null
  connected: boolean
  joinedAt: string
  totalScore: number
  correctAnswerCount: number
  totalCorrectResponseMs: number
}

export interface PlayerAnswer {
  id: string
  sessionId: string
  questionId: string
  playerId: string
  payload: PlayerAnswerPayload
  resolutionStatus?: HeadToHeadResolutionStatus
  submittedAt: string
  responseTimeMs: number
  correct: boolean
  pointsAwarded: number
}

export interface GameSession {
  id: string
  quizId: string
  roomCode: string
  status: SessionStatus
  phase: GamePhase
  currentQuestionIndex: number
  questionOpenedAt: string | null
  questionClosesAt: string | null
  startedAt: string | null
  endedAt: string | null
  players: Player[]
  answers: PlayerAnswer[]
}

export interface LeaderboardEntry {
  playerId: string
  nickname: string
  totalScore: number
  correctAnswerCount: number
  totalCorrectResponseMs: number
  rank: number
}

export interface SafeGameState {
  sessionId: string
  quizTitle: string
  quizType?: QuizType
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  answerPaletteId?: AnswerPaletteId
  customAnswerColours?: AnswerColourTuple
  soundPackId?: SoundPackId
  roomCode: string
  status: SessionStatus
  phase: GamePhase
  currentQuestion: SafeQuestion | null
  roster: RosterMember[]
  players: Player[]
  headToHeadCompetitors?: HeadToHeadGameCompetitor[]
  headToHeadResolutions?: HeadToHeadResolution[]
  headToHeadResults?: HeadToHeadResult[]
  submittedCount: number
  leaderboard: LeaderboardEntry[]
  reveal: RevealPayload | null
  questionOpenedAt: string | null
  questionClosesAt: string | null
}

export interface PlayerSession {
  playerId: string
  roomCode: string
  nickname: string
  competitorId?: string | null
  reconnectToken: string
}

export interface JoinResult {
  player: Player
  reconnectToken: string
}

export interface HeadToHeadJoinSlot {
  competitorId: string
  displayName: string
  displayOrder: 0 | 1
  claimed: boolean
  connected: boolean
}

export interface RoomJoinInfo {
  roomCode: string
  quizTitle: string
  quizType: QuizType
  status: SessionStatus
  phase: GamePhase
  headToHeadCompetitors: HeadToHeadJoinSlot[]
}

export interface HeadToHeadGameCompetitor extends HeadToHeadJoinSlot {
  playerId: string | null
  totalScore: number
  correctAnswerCount: number
}

export interface HeadToHeadResolution {
  playerId: string
  competitorId: string
  status: HeadToHeadResolutionStatus
}

export interface HeadToHeadResult {
  competitorId: string
  assigned: boolean
  status: HeadToHeadResultStatus
  pointsAwarded: 0 | 1
}

export type Unsubscribe = () => void
