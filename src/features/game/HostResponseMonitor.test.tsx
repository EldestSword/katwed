import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { GameSessionSettings, Player, PlayerAnswer } from '../../types/domain'
import { HostResponseMonitor } from './HostResponseMonitor'

const question = mixedDemoQuiz.questions.find((candidate) => candidate.type === 'typed-answer')!
const settings: GameSessionSettings = {
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
  const props: Parameters<typeof HostResponseMonitor>[0] = {
    players,
    answers: [
      typedAnswer(players[1], 'Red Dwarf', true),
      typedAnswer(players[2], 'Red Dwarfs', false),
    ],
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

  it('hides answer content when disabled while retaining named status', () => {
    renderMonitor({ settings: { ...settings, showPlayerAnswersToHost: false } })
    expect(screen.getByText('Waiting for: Roger')).toBeVisible()
    expect(screen.getByText('Individual answers are hidden for this session.')).toBeVisible()
    expect(screen.queryByText('Red Dwarfs')).not.toBeInTheDocument()
  })

  it('hides detail over 15 players while retaining the waiting name', () => {
    const largePlayers = Array.from({ length: 16 }, (_, index) => ({
      ...players[0], id: `large-${index}`, nickname: index === 0 ? 'Roger' : `Player ${index}`,
      connected: true,
    }))
    const answers = largePlayers.slice(1).map((player) => typedAnswer(player, `Answer ${player.id}`, false))
    renderMonitor({ players: largePlayers, answers })
    expect(screen.getByText('Waiting for: Roger')).toBeVisible()
    expect(screen.getByText('Individual answers are hidden for rooms over 15 players.')).toBeVisible()
    expect(screen.queryByText('Answer large-1')).not.toBeInTheDocument()
  })

  it('shows automatic and host judgements and offers only the valid Typed Answer action', async () => {
    const user = userEvent.setup()
    const onOverride = vi.fn()
    renderMonitor({
      phase: 'locked',
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
    expect(screen.getAllByRole('button')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Mark correct' }))
    await user.click(screen.getByRole('button', { name: 'Undo override' }))
    expect(onOverride).toHaveBeenNthCalledWith(1, 'answer-player-1', true)
    expect(onOverride).toHaveBeenNthCalledWith(2, 'answer-player-2', null)
  })
})
