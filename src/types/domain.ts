export type GamePhase = 'lobby' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'finished'
export type SessionStatus = 'active' | 'closed'
export type QuestionType =
  | 'single-choice'
  | 'multiple-select'
  | 'true-false'
  | 'slider'
  | 'pinpoint'
  | 'mashup'

export type ImageRevealEffect = 'immediate' | 'blur' | 'pixelate' | 'tiles' | 'zoom-out'
export type MediaVisibility = 'presentation' | 'players' | 'both'
export type PresentationChoiceVisibility = 'show' | 'hide' | 'after-lock'

export const QUIZ_TYPE_IDS = ['standard', 'head-to-head'] as const
export type QuizType = typeof QUIZ_TYPE_IDS[number]

export const QUIZ_THEME_IDS = ['katwed', 'midnight', 'sunset', 'arcade', 'mint', 'paper'] as const
export type QuizThemeId = typeof QUIZ_THEME_IDS[number]

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

export type QuestionMedia =
  | { type: 'none' }
  | {
      type: 'image'
      path: string
      altText: string
      revealEffect: ImageRevealEffect
      revealDurationSeconds: number
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
  | MashupQuestion

export type PlayerAnswerPayload =
  | { type: 'single-choice'; optionId: string }
  | { type: 'multiple-select'; optionIds: string[] }
  | { type: 'true-false'; value: boolean }
  | { type: 'slider'; value: number }
  | { type: 'pinpoint'; x: number; y: number }
  | { type: 'mashup'; memberIds: readonly [string, string] }

export type SafeQuestion =
  | (Omit<SingleChoiceQuestion, 'correctOptionId' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress)
  | (Omit<MultipleSelectQuestion, 'correctOptionIds' | 'scoringMode' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress)
  | (Omit<TrueFalseQuestion, 'correctValue' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress)
  | (Omit<SliderQuestion, 'correctValue' | 'tolerance' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress)
  | (Omit<PinpointQuestion, 'targetX' | 'targetY' | 'targetRadius' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress)
  | (Omit<MashupQuestion, 'correctMemberIds' | 'quizId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress)

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
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  roomCode: string
  status: SessionStatus
  phase: GamePhase
  currentQuestion: SafeQuestion | null
  roster: RosterMember[]
  players: Player[]
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
  reconnectToken: string
}

export interface JoinResult {
  player: Player
  reconnectToken: string
}

export type Unsubscribe = () => void
