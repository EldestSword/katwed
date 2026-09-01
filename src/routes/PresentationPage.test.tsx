import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SafeGameState } from '../types/domain'
import { PresentationPage } from './PresentationPage'

const mocks = vi.hoisted(() => ({
  getHostSession: vi.fn(),
  getSafeGameState: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: mocks }))
vi.mock('../hooks/usePresentationAudio', () => ({
  usePresentationAudio: () => ({
    status: 'idle', packId: 'none', cue: 'silent', muted: false, duckedForYouTube: false, enable: vi.fn(),
  }),
}))

const player = (id: string) => ({
  id, sessionId: 'session', nickname: id, connected: true, joinedAt: '2026-09-01T00:00:00.000Z',
  totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
})

function questionState(submittedCount: number): SafeGameState {
  return {
    sessionId: 'session', quizTitle: 'Live quiz', quizType: 'standard', themeId: 'katwed',
    backgroundId: null, roomCode: '123456', status: 'active', phase: 'question',
    currentQuestion: {
      id: 'question', type: 'true-false', prompt: 'True?', supportingText: '', timeLimitSeconds: 60,
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      questionNumber: 1, totalQuestions: 1,
    },
    roster: [], players: [player('One'), player('Two')], submittedCount, leaderboard: [], reveal: null,
    questionOpenedAt: '2026-09-01T00:00:00.000Z', questionClosesAt: '2099-09-01T00:01:00.000Z',
  }
}

describe('PresentationPage live refresh', () => {
  it('updates the Answered count while loading the host bundle only once', async () => {
    let notify: (() => void) | undefined
    mocks.getHostSession.mockResolvedValue({ session: { roomCode: '123456' }, quiz: {} })
    mocks.getSafeGameState.mockResolvedValue(questionState(1))
    mocks.subscribe.mockImplementation((_sessionId: string, callback: () => void) => {
      notify = callback
      return () => undefined
    })
    render(
      <MemoryRouter initialEntries={['/host/game/session/present']}>
        <Routes><Route path="/host/game/:sessionId/present" element={<PresentationPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('status', { name: '1 of 2 answered' })).toBeVisible()

    mocks.getSafeGameState.mockResolvedValue(questionState(2))
    await act(async () => notify?.())
    await waitFor(() => expect(screen.getByRole('status', { name: '2 of 2 answered' })).toBeVisible())
    expect(mocks.getHostSession).toHaveBeenCalledTimes(1)
  })
})
