import {
  VISUAL_THEME_BATCH_1_BACKGROUND_IDS,
  VISUAL_THEME_BATCH_1_THEME_IDS,
} from '../generated/visualThemeBatch1'
import {
  VISUAL_THEME_BATCH_2_BACKGROUND_IDS,
  VISUAL_THEME_BATCH_2_THEME_IDS,
} from '../generated/visualThemeBatch2'
import {
  VISUAL_THEME_BATCH_3_BACKGROUND_IDS,
  VISUAL_THEME_BATCH_3_THEME_IDS,
} from '../generated/visualThemeBatch3'

export type GamePhase = 'lobby' | 'round-intro' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'tiebreaker' | 'tiebreaker-result' | 'finished'
export type SessionStatus = 'active' | 'closed'
export type QuestionType =
  | 'single-choice'
  | 'multiple-select'
  | 'true-false'
  | 'slider'
  | 'pinpoint'
  | 'typed-answer'
  | 'ordering'
  | 'matching'
  | 'connections'
  | 'mashup'

export type ImageRevealEffect = 'immediate' | 'blur' | 'pixelate' | 'tiles' | 'zoom-out'
export const TILE_GRID_SIZES = [6, 8, 12, 16] as const
export type TileGridSize = typeof TILE_GRID_SIZES[number]
export type MediaVisibility = 'presentation' | 'players' | 'both'
export type PresentationChoiceVisibility = 'show' | 'hide' | 'after-lock'

export const QUIZ_TYPE_IDS = ['standard', 'head-to-head'] as const
export type QuizType = typeof QUIZ_TYPE_IDS[number]

export const QUIZ_THEME_IDS = [
  'katwed', 'midnight', 'sunset', 'arcade', 'mint', 'paper',
  ...VISUAL_THEME_BATCH_1_THEME_IDS,
  ...VISUAL_THEME_BATCH_2_THEME_IDS,
  ...VISUAL_THEME_BATCH_3_THEME_IDS,
] as const
export type QuizThemeId = typeof QUIZ_THEME_IDS[number]
export type SoundPackId = string
export type QuestionPreludeKind = 'double-score' | 'question-type' | null
export type CompetitionMode = 'points' | 'survivor'
export type SurvivorStartingLives = 1 | 3

export interface LaunchGameSettings {
  powerUpsEnabled?: boolean
  automaticTieBreakersEnabled?: boolean
  competitionMode?: CompetitionMode
  survivorStartingLives?: SurvivorStartingLives
  playMode?: SessionPlayMode
  teamAssignmentMode?: TeamAssignmentMode
  /** Launch-only names; GameTeam records are canonical after launch. */
  teamNames?: string[]
  soundPackId: SoundPackId
  doubleScoreVariantDurationsMs?: number[]
  shuffleQuestionOrder: boolean
  shuffleAnswerOptions: boolean
  autoLockWhenAllAnswered: boolean
  showPlayerAnswersToHost: boolean
}

export interface GameSessionSettings extends Omit<LaunchGameSettings, 'teamNames' | 'competitionMode' | 'survivorStartingLives'> {
  /** Changes only on restart; public run identity contains no inventory. */
  powerUpRunId?: string
  automaticTieBreakersEnabled?: boolean
  competitionMode: CompetitionMode
  survivorStartingLives: SurvivorStartingLives | null
  doubleScoreIntroMs: number
  doubleScoreVariantDurationsMs?: number[]
  questionTypeIntrosEnabled: boolean
  answerOptionSeed: string
}

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
  ...VISUAL_THEME_BATCH_1_BACKGROUND_IDS,
  ...VISUAL_THEME_BATCH_2_BACKGROUND_IDS,
  ...VISUAL_THEME_BATCH_3_BACKGROUND_IDS,
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
  /** Missing on legacy questions means false. */
  buzzInEnabled?: boolean
  /** Missing on legacy questions means false. */
  wagerEnabled?: boolean
  /** Missing on legacy client data means false. Saved/portable v10 data is explicit. */
  progressiveRevealEnabled?: boolean
  roundId: string
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

export interface PinpointPoint { x: number; y: number }

/** Coordinates use the image's unit square; rectangles start at their top-left. */
export type PinpointTarget =
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: PinpointPoint[] }

export interface PinpointQuestion extends QuestionBase {
  type: 'pinpoint'
  media: Extract<QuestionMedia, { type: 'image' }>
  /** Null is an unfinished editor draft and cannot be saved. */
  target: PinpointTarget | null
}

export interface TypedAnswerQuestion extends QuestionBase {
  type: 'typed-answer'
  correctAnswer: string
  acceptedAnswers: string[]
}

export interface TextItem { id: string; label: string }
export interface MatchingPair { leftId: string; rightId: string }
export interface OrderingQuestion extends QuestionBase {
  type: 'ordering'
  items: TextItem[]
  correctItemIds: string[]
}

export interface ConnectionClue { id: string; text: string }
export interface ConnectionsQuestion extends QuestionBase {
  type: 'connections'
  clues: ConnectionClue[]
  correctAnswer: string
  acceptedAnswers: string[]
}
export interface MatchingQuestion extends QuestionBase {
  type: 'matching'
  leftItems: TextItem[]
  rightItems: TextItem[]
  correctPairs: MatchingPair[]
  scoringMode: 'exact' | 'partial'
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
  | ConnectionsQuestion
  | OrderingQuestion
  | MatchingQuestion
  | MashupQuestion

export type WagerPercent = 0 | 25 | 50 | 100

export const POWER_UP_IDS = ['double-up', 'fifty-fifty', 'fast-five'] as const
export type PowerUpId = typeof POWER_UP_IDS[number]
export type AnswerPowerUpId = Exclude<PowerUpId, 'fifty-fifty'>
export interface PowerUpUse {
  questionId: string
  powerUp: PowerUpId
  optionIds?: string[]
}
export interface PersonalPowerUpState {
  runId: string
  uses: PowerUpUse[]
}

export type PlayerAnswerPayload = PlayerAnswerCore & { wagerPercent?: WagerPercent; powerUp?: AnswerPowerUpId }

export type PlayerAnswerCore =
  | { type: 'single-choice'; optionId: string }
  | { type: 'multiple-select'; optionIds: string[] }
  | { type: 'true-false'; value: boolean }
  | { type: 'slider'; value: number }
  | { type: 'pinpoint'; x: number; y: number }
  | { type: 'typed-answer'; value: string }
  | { type: 'connections'; value: string }
  | { type: 'ordering'; itemIds: string[] }
  | { type: 'matching'; pairs: MatchingPair[] }
  | { type: 'mashup'; memberIds: readonly [string, string] }

export type HeadToHeadResolutionStatus = 'answered' | 'skipped'
export type HeadToHeadResultStatus = 'correct' | 'incorrect' | 'skipped'

export type SafeQuestion =
  | (Omit<ConnectionsQuestion, 'clues' | 'correctAnswer' | 'acceptedAnswers' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment & {
      visibleClues: ConnectionClue[]; revealedClueCount: number; totalClues: number; availablePoints: number
    })
  | (Omit<OrderingQuestion, 'correctItemIds' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<MatchingQuestion, 'correctPairs' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<SingleChoiceQuestion, 'correctOptionId' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<MultipleSelectQuestion, 'correctOptionIds' | 'scoringMode' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<TrueFalseQuestion, 'correctValue' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<SliderQuestion, 'correctValue' | 'tolerance' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<PinpointQuestion, 'target' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<TypedAnswerQuestion, 'correctAnswer' | 'acceptedAnswers' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)
  | (Omit<MashupQuestion, 'correctMemberIds' | 'quizId' | 'roundId' | 'assignedCompetitorId' | 'revealCaption'> & QuestionProgress & SafeAssignment)

interface SafeAssignment {
  assignedCompetitorId?: string | null
}

interface QuestionProgress {
  questionNumber: number
  totalQuestions: number
  forceRandomiseOptions?: boolean
  optionOrderSeed?: string
}

export type RevealPayload =
  | { type: 'connections'; correctAnswer: string; correctPlayerIds: string[]; caption: string }
  | { type: 'ordering'; correctItemIds: string[]; caption: string }
  | { type: 'matching'; correctPairs: MatchingPair[]; scoringMode: 'exact' | 'partial'; caption: string }
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
      target: PinpointTarget
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
      correctPlayerIds?: string[]
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

export interface QuizRound {
  id: string
  quizId: string
  title: string
  subtitle: string
  displayOrder: number
  introEnabled: boolean
}

export interface SafeRound extends Omit<QuizRound, 'quizId' | 'displayOrder'> {
  roundNumber: number
  totalRounds: number
  questionCount: number
}

export interface Quiz {
  rounds: QuizRound[]
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
  /** Session-only Survivor state. Missing legacy values mean Points mode defaults. */
  survivorLivesRemaining?: number
  survivorEliminatedAtQuestion?: number | null
  /** Missing in legacy clients; repository boundaries normalise both statistics to zero. */
  currentCorrectStreak?: number
  longestCorrectStreak?: number
  /** Missing only in legacy payloads; treated as unassigned. */
  teamId?: string | null
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
  wagerPercent?: WagerPercent
  id: string
  sessionId: string
  questionId: string
  playerId: string
  payload: PlayerAnswerPayload
  resolutionStatus?: HeadToHeadResolutionStatus
  submittedAt: string
  responseTimeMs: number
  automaticCorrect: boolean
  hostCorrectOverride: boolean | null
  correct: boolean
  pointsAwarded: number
}

export interface HostResponseRecord {
  wagerPercent?: WagerPercent
  id: string
  sessionId: string
  questionId: string
  playerId: string
  resolutionStatus?: HeadToHeadResolutionStatus
  submittedAt: string
}

export interface GameSession {
  /** App-owned endgame state; null until a supported first-place tie begins. */
  tieBreaker?: HostTieBreakerState | null
  /** One authoritative per-question Buzz claim; null before a claim or after reset. */
  buzz?: BuzzState | null
  /** Missing only in pre-Connections clients/local fixtures; equivalent to zero. */
  connectionClueCount?: number
  teams?: GameTeam[]
  currentRoundId: string | null
  id: string
  quizId: string
  roomCode: string
  status: SessionStatus
  phase: GamePhase
  currentQuestionIndex: number
  questionOpenedAt: string | null
  questionClosesAt: string | null
  doubleScoreVariantOrder?: number[]
  doubleScoreVariantCursor?: number
  currentDoubleScoreVariantIndex?: number | null
  startedAt: string | null
  endedAt: string | null
  settings: GameSessionSettings
  questionOrder: string[]
  players: Player[]
  hostResponses: HostResponseRecord[]
  answers: PlayerAnswer[]
}

export interface LeaderboardEntry {
  /** Present on Survivor display rows only. */
  survivorLivesRemaining?: number
  survivorEliminatedAtQuestion?: number | null
  /** Individual statistics only; Team adapters deliberately omit them. */
  currentCorrectStreak?: number
  longestCorrectStreak?: number
  playerId: string
  nickname: string
  totalScore: number
  correctAnswerCount: number
  totalCorrectResponseMs: number
  rank: number
}

export interface SafeGameState {
  /** Dedicated endgame state. Answer/source data is absent until the result. */
  tieBreaker?: SafeTieBreakerState | null
  /** Public live Buzz status. Missing legacy state is equivalent to null. */
  buzz?: BuzzState | null
  teams?: GameTeam[]
  currentRound?: SafeRound | null
  sessionId: string
  quizTitle: string
  quizType?: QuizType
  themeId: QuizThemeId
  backgroundId: QuizBackgroundId | null
  answerPaletteId?: AnswerPaletteId
  customAnswerColours?: AnswerColourTuple
  soundPackId?: SoundPackId
  sessionSettings?: GameSessionSettings
  questionPreludeKind?: QuestionPreludeKind
  doubleScoreVariantIndex?: number | null
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
  eligibleResponderCount?: number
  survivorAliveCount?: number
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
  powerUps?: PersonalPowerUpState | null
  player: Player
  reconnectToken: string
  tieBreakerSubmission?: TieBreakerSubmissionStatus | null
}

export interface TieBreakerSubmissionStatus {
  round: number
  questionId: string
}

export interface TieBreakerResultEntry {
  playerId: string
  nickname: string
  value: string | null
  absoluteError: string | null
  responseTimeMs: number | null
}

export interface SafeTieBreakerState {
  round: number
  status: 'question' | 'result'
  questionId: string
  prompt: string
  category?: string
  unit: string
  openedAt: string
  closesAt: string
  contenderPlayerIds: string[]
  submittedCount: number
  correctAnswer?: string
  results?: TieBreakerResultEntry[]
  winnerPlayerId?: string | null
  unresolvedPlayerIds?: string[]
}

export interface HostTieBreakerState extends SafeTieBreakerState {
  submittedPlayerIds?: string[]
  sourceTitle?: string
  sourceUrl?: string
  sourceNote?: string | null
}

export interface BuzzState {
  winnerPlayerId: string
  claimedAt: string
  answerDeadlineAt: string
}

export interface BuzzClaimResult extends BuzzState {
  won: boolean
}

export interface HeadToHeadJoinSlot {
  competitorId: string
  displayName: string
  displayOrder: 0 | 1
  claimed: boolean
  connected: boolean
}

export interface RoomJoinInfo {
  automaticTieBreakersEnabled?: boolean
  competitionMode?: CompetitionMode
  survivorStartingLives?: SurvivorStartingLives | null
  playMode?: SessionPlayMode
  teamAssignmentMode?: TeamAssignmentMode
  teams?: Array<GameTeam & { memberCount: number }>
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

export type SessionPlayMode = 'individual' | 'teams'
export type TeamAssignmentMode = 'player-choice' | 'balanced-random' | 'host'
export interface GameTeam {
  id: string
  sessionId: string
  name: string
  displayOrder: number
}
export interface TeamLeaderboardEntry {
  teamId: string
  name: string
  memberCount: number
  totalScore: number
  correctAnswerCount: number
  totalCorrectResponseMs: number
  rank: number
}
