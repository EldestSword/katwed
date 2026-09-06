import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { GameSessionSettings, Player, PlayerAnswer } from '../../types/domain'
import type { TypedAnswerReviewItem } from '../../services/typedAnswerReview'
import { HostResponseMonitor } from './HostResponseMonitor'
import { hostResponseRecordForAnswer } from './hostResponses'

const loadReview = vi.fn<() => Promise<TypedAnswerReviewItem[]>>()
vi.mock('../../services/typedAnswerReview', () => ({
  loadTypedAnswerReview: () => loadReview(),
}))

const question = mixedDemoQuiz.questions.find((candidate) => candidate.type === 'typed-answer')!
const settings: GameSessionSettings = {
  competitionMode: 'points', survivorStartingLives: null,
  soundPackId: 'katwed', doubleScoreIntroMs: 5000, shuffleQuestionOrder: false,
  shuffleAnswerOptions: false, autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
  questionTypeIntrosEnabled: true, answerOptionSeed: 'seed',
}
const players: Player[] = ['Roger', 'Mandy', 'James'].map((nickname, index) => ({
  id: `player-${index}`, sessionId: 'session', nickname, connected: nickname !== 'Roger',
  joinedAt: '2026-08-27T12:00:00.000Z', totalScore: 0, correctAnswerCount: 0,
  totalCorrectResponseMs: 0,
}))

function typedAnswer(player: Player, value: string, automaticCorrect: boolean, hostCorrectOverride: boolean | null = null): PlayerAnswer {
  return {
    id: `answer-${player.id}`, sessionId: 'session', questionId: question.id, playerId: player.id,
    payload: { type: 'typed-answer', value }, resolutionStatus: 'answered',
    submittedAt: '2026-08-27T12:00:05.000Z', responseTimeMs: 5000,
    automaticCorrect, hostCorrectOverride, correct: hostCorrectOverride ?? automaticCorrect,
    pointsAwarded: automaticCorrect || hostCorrectOverride ? 1000 : 0,
  }
}

function renderMonitor(overrides: Partial<Parameters<typeof HostResponseMonitor>[0]> = {}) {
  const answers = [
    typedAnswer(players[1], 'Red Dwarf', true),
    typedAnswer(players[2], 'Red Dwarfs', false),
  ]
  const props: Parameters<typeof HostResponseMonitor>[0] = {
    players,
    responses: answers.map(hostResponseRecordForAnswer),
    answers,
    question,
    roster: mixedDemoQuiz.roster,
    settings,
    phase: 'question',
    preludeActive: false,
    reviewingAnswerId: null,
    onOverride: vi.fn(),
    ...overrides,
  }
  return { ...render(<HostResponseMonitor {...props} />), props }
}

describe('HostResponseMonitor', () => {
  beforeEach(() => {
    loadReview.mockReset()
    loadReview.mockResolvedValue([])
  })

  it('shows submitted wagers privately, including bounded rooms, without wager editing', () => {
    const answer = { ...typedAnswer(players[1], 'Red Dwarf', true), wagerPercent: 50 as const }
    const { container } = renderMonitor({ question: { ...question, wagerEnabled: true }, answers: [],
      responses: [hostResponseRecordForAnswer(answer)], settings: { ...settings, showPlayerAnswersToHost: false } })
    expect(within(screen.getByText('Mandy').closest('li')!).getByText('500 points')).toBeVisible()
    expect(within(screen.getByText('Roger').closest('li')!).queryByText(/Wager/)).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('makes named non-submitters and disconnected state clear during a live question', () => {
    renderMonitor()
    expect(screen.getByText('Waiting for: Roger')).toBeVisible()
    const roger = screen.getByText('Roger').closest('li')!
    expect(within(roger).getByText('Waiting · Disconnected')).toBeVisible()
    expect(screen.getByText('Red Dwarf')).toBeVisible()
    expect(screen.getByText('Red Dwarfs')).toBeVisible()
  })

  it('uses neutral prelude copy instead of labelling every player as waiting', () => {
    renderMonitor({ preludeActive: true })
    expect(screen.getByText('Question opens shortly')).toBeVisible()
    expect(screen.queryByText(/Waiting for:/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Ready/)).toHaveLength(3)
  })

  it('hides live answer content when disabled while retaining named status', () => {
    renderMonitor({ settings: { ...settings, showPlayerAnswersToHost: false }, phase: 'reveal' })
    expect(screen.getByText('Results shown · No answer from: Roger')).toBeVisible()
    expect(screen.getByText('Live individual answers are hidden for this session. Incorrect Typed Answers can still be reviewed after answers close.')).toBeVisible()
    expect(screen.queryByText('Red Dwarfs')).not.toBeInTheDocument()
    expect(screen.getAllByText('Answered')).toHaveLength(2)
    expect(screen.queryByText('Correct')).not.toBeInTheDocument()
  })

  it('hides live detail over 15 players while preserving the separate review path', () => {
    const largePlayers = Array.from({ length: 16 }, (_, index) => ({
      ...players[0], id: `large-${index}`, nickname: index === 0 ? 'Roger' : `Player ${index}`,
      connected: true,
    }))
    const answers = largePlayers.slice(1).map((player) => typedAnswer(player, `Answer ${player.id}`, false))
    renderMonitor({ players: largePlayers, responses: answers.map(hostResponseRecordForAnswer), answers: [], phase: 'locked' })
    expect(screen.getByText('Answers closed · No answer from: Roger')).toBeVisible()
    expect(screen.getByText('Live individual answers are hidden for rooms over 15 players. Incorrect Typed Answers remain available in the review window after answers close.')).toBeVisible()
    expect(screen.queryByText('Answer large-1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review incorrect answers/i })).toBeVisible()
  })

  it('shows automatic and host judgements and offers the valid inline Typed Answer actions', async () => {
    const user = userEvent.setup()
    const onOverride = vi.fn()
    renderMonitor({
      phase: 'locked',
      responses: [
        typedAnswer(players[0], 'The Red Dwarf', true),
        typedAnswer(players[1], 'Red Dwarfs', false),
        typedAnswer(players[2], 'Dwarf, Red', false, true),
      ].map(hostResponseRecordForAnswer),
      answers: [
        typedAnswer(players[0], 'The Red Dwarf', true),
        typedAnswer(players[1], 'Red Dwarfs', false),
        typedAnswer(players[2], 'Dwarf, Red', false, true),
      ],
      onOverride,
    })
    expect(screen.getByText('Correct ✓')).toBeVisible()
    expect(screen.getByText('Not accepted')).toBeVisible()
    expect(screen.getByText('Host accepted ✓')).toBeVisible()
    expect(screen.getByText('Answers closed · Everyone answered')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Mark correct' }))
    await user.click(screen.getByRole('button', { name: 'Undo override' }))
    expect(onOverride).toHaveBeenNthCalledWith(1, 'answer-player-1', true)
    expect(onOverride).toHaveBeenNthCalledWith(2, 'answer-player-2', null)
  })

  it('opens a large review showing only incorrect answers and accepts them', async () => {
    const user = userEvent.setup()
    const onOverride = vi.fn().mockResolvedValue(undefined)
    loadReview.mockResolvedValueOnce([
      { answerId: 'answer-player-2', playerId: 'player-2', nickname: 'James', value: 'Red Dwarfs', submittedAt: '2026-08-27T12:00:05.000Z' },
    ]).mockResolvedValueOnce([])
    renderMonitor({ phase: 'locked', onOverride })
    expect(await screen.findByRole('dialog', { name: /check the answers/i })).toBeVisible()
    expect(screen.getByText('“Red Dwarfs”')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Accept answer' }))
    expect(onOverride).toHaveBeenCalledWith('answer-player-2', true)
    await waitFor(() => expect(screen.getByText(/Nothing needs reviewing/i)).toBeVisible())
  })

  it('uses result status after reveal while keeping a no-answer player prominent', () => {
    renderMonitor({ phase: 'reveal' })
    expect(screen.getByText('Results shown · No answer from: Roger')).toBeVisible()
    expect(screen.getByText('Correct')).toBeVisible()
    expect(screen.getByText('Incorrect')).toBeVisible()
    expect(screen.getByText('No answer · Disconnected')).toBeVisible()
  })
})
