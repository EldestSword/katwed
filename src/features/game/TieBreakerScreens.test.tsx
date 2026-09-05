import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HostTieBreakerState, Player, SafeTieBreakerState } from '../../types/domain'
import { HostTieBreakerPanel, TieBreakerPlayer, TieBreakerPresentation } from './TieBreakerScreens'

const players: Player[] = ['Carol', 'Roger', 'Jaki'].map((nickname) => ({
  id: nickname.toLowerCase(), sessionId: 'session', nickname, connected: true, joinedAt: '',
  totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
}))
const question: SafeTieBreakerState = {
  round: 1, status: 'question', questionId: 'TB001', prompt: 'How tall is the Eiffel Tower today?',
  category: 'Landmarks', unit: 'metres', openedAt: new Date(Date.now() - 1000).toISOString(),
  closesAt: new Date(Date.now() + 19000).toISOString(), contenderPlayerIds: ['carol', 'roger'], submittedCount: 1,
}
const result: HostTieBreakerState = {
  ...question, status: 'result', correctAnswer: '330', winnerPlayerId: 'roger', unresolvedPlayerIds: [], submittedCount: 2,
  results: [
    { playerId: 'carol', nickname: 'Carol', value: '325', absoluteError: '5', responseTimeMs: 2400 },
    { playerId: 'roger', nickname: 'Roger', value: '332', absoluteError: '2', responseTimeMs: 3100 },
  ],
  sourceTitle: 'Eiffel Tower key figures', sourceUrl: 'https://example.com/source', sourceNote: 'Current height.',
}

describe('TieBreakerPlayer', () => {
  it('accepts a decimal string, shows the unit/timer, and locks after reconnect', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const view = render(<TieBreakerPlayer state={question} players={players} playerId="carol" alreadySubmitted={false} working={false} onSubmit={submit} />)
    expect(screen.getAllByText('metres')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText(/Your estimate/), { target: { value: '00325.50' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Lock in' }).closest('form')!)
    await waitFor(() => expect(submit).toHaveBeenCalledWith('325.5'))
    view.rerender(<TieBreakerPlayer state={question} players={players} playerId="carol" alreadySubmitted working={false} onSubmit={submit} />)
    expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  })

  it('gives non-finalists a spectator view and finalists their public result', () => {
    const view = render(<TieBreakerPlayer state={question} players={players} playerId="jaki" alreadySubmitted={false} working={false} onSubmit={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /Carol and Roger are playing/ })).toBeVisible()
    view.rerender(<TieBreakerPlayer state={result} players={players} playerId="carol" alreadySubmitted working={false} onSubmit={vi.fn()} />)
    expect(screen.getByText('325 metres')).toBeVisible()
    expect(screen.getByText(/Roger wins/)).toBeVisible()
  })
})

describe('presentation and host tie-breaker screens', () => {
  it('shows the public prompt/count without guesses, then a compact result', () => {
    const view = render(<TieBreakerPresentation state={question} players={players} />)
    expect(screen.getByRole('heading', { name: 'Carol and Roger' })).toBeVisible()
    expect(screen.getByText('1 / 2 locked in')).toBeVisible()
    expect(screen.queryByText('325 metres')).toBeNull()
    view.rerender(<TieBreakerPresentation state={result} players={players} compact />)
    expect(screen.getByRole('heading', { name: /Roger wins/ })).toBeVisible()
    expect(screen.queryByText('325 metres')).toBeNull()
  })

  it('keeps source metadata private to the host result and exposes the right action', () => {
    const next = vi.fn(), final = vi.fn(), resolve = vi.fn()
    const view = render(<HostTieBreakerPanel state={{ ...question, submittedPlayerIds: ['carol'] }} players={players} working={false} onResolve={resolve} onNext={next} onFinal={final} />)
    expect(screen.queryByText(/Eiffel Tower key figures/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close tie-breaker now' }))
    expect(resolve).toHaveBeenCalledOnce()
    view.rerender(<HostTieBreakerPanel state={result} players={players} working={false} onResolve={resolve} onNext={next} onFinal={final} />)
    expect(screen.getByRole('link', { name: 'Eiffel Tower key figures' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal final results' }))
    expect(final).toHaveBeenCalledOnce()
  })

  it('offers another round for an exact unresolved tie', () => {
    const next = vi.fn()
    render(<HostTieBreakerPanel state={{ ...result, winnerPlayerId: null, unresolvedPlayerIds: ['carol', 'roger'] }} players={players} working={false} onResolve={vi.fn()} onNext={next} onFinal={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next tie-breaker' }))
    expect(next).toHaveBeenCalledOnce()
  })
})
