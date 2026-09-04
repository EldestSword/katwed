import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { orderingFixture, matchingFixture, safeArrangement } from '../../test/arrangementFixtures'
import { PlayerQuestion } from './PlayerQuestion'
import { PlayerOrderingAnswer } from './PlayerOrderingAnswer'
import { PlayerMatchingAnswer } from './PlayerMatchingAnswer'
import { PlayerAnswerReveal } from './PlayerAnswerReveal'
import { PresentationStage } from './PresentationStage'
import { ArrangementEditor } from '../quiz-editor/ArrangementEditor'
import type { MatchingPair, MatchingQuestion, OrderingQuestion, SafeGameState } from '../../types/domain'

const closesAt = new Date(Date.now() + 120_000).toISOString()
describe('Ordering and Matching player controls', () => {
  it('starts unchosen, submits an explicit keyboard permutation and locks afterwards', async () => {
    const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined), question = safeArrangement(orderingFixture())
    render(<PlayerQuestion question={question} roster={[]} closesAt={closesAt} onSubmit={submit} />)
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
    screen.getByRole('button', { name: 'Move Delta down' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeEnabled()
    expect(screen.getByText('Delta moved to position 2.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    expect(submit).toHaveBeenCalledWith({ type: 'ordering', itemIds: ['item-2', 'item-3', 'item-1', 'item-0'] })
    expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move Delta down' })).not.toBeInTheDocument()
  })
  it('moves a captured pointer to the target row and honours disabled state', () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    const target = vi.fn(); Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: target })
    const change = vi.fn()
    function Harness({ disabled = false }: { disabled?: boolean }) {
      const [value, setValue] = useState<string[] | null>(null)
      return <PlayerOrderingAnswer items={orderingFixture().items} value={value} disabled={disabled} onChange={ids => { change(ids); setValue(ids) }} />
    }
    const view = render(<Harness />), handle = screen.getByRole('button', { name: 'Drag Alpha' })
    target.mockReturnValue(screen.getByText('Charlie').closest('li'))
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 }); fireEvent.pointerMove(handle, { clientX: 10, clientY: 200, pointerId: 1 }); fireEvent.pointerUp(handle)
    expect(change).toHaveBeenLastCalledWith(['item-1', 'item-2', 'item-0', 'item-3'])
    view.rerender(<Harness disabled />)
    expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true)
    vi.unstubAllGlobals()
  })
  it('pairs by keyboard, prevents right-item reuse and supports unpairing', async () => {
    const user = userEvent.setup(), change = vi.fn(), q = matchingFixture()
    function Harness() {
      const [pairs, setPairs] = useState<MatchingPair[]>([])
      return <PlayerMatchingAnswer leftItems={q.leftItems} rightItems={q.rightItems} pairs={pairs} onChange={next => { change(next); setPairs(next) }} />
    }
    render(<Harness />)
    screen.getByRole('button', { name: /Jaws/ }).focus(); await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /Jaws/ })).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: /Spielberg/ }).focus(); await user.keyboard(' ')
    expect(screen.getAllByText('Pair 1')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Alien/ })); await user.click(screen.getByRole('button', { name: /Spielberg/ }))
    expect(change).toHaveBeenLastCalledWith([{ leftId: 'left-1', rightId: 'right-0' }])
    await user.click(screen.getByRole('button', { name: /Alien/ }))
    expect(change).toHaveBeenLastCalledWith([])
  })
  it('requires every pair, submits once, and hides the controls after locking', async () => {
    const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined), q = matchingFixture()
    render(<PlayerQuestion question={safeArrangement(q)} roster={[]} closesAt={closesAt} onSubmit={submit} />)
    const lock = screen.getByRole('button', { name: 'Lock in' })
    for (const pair of q.correctPairs) {
      expect(lock).toBeDisabled()
      await user.click(screen.getByRole('button', { name: new RegExp(q.leftItems.find(x => x.id === pair.leftId)!.label) }))
      await user.click(screen.getByRole('button', { name: new RegExp(q.rightItems.find(x => x.id === pair.rightId)!.label) }))
    }
    expect(lock).toBeEnabled(); await user.click(lock)
    expect(submit).toHaveBeenCalledWith({ type: 'matching', pairs: q.correctPairs })
    expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Jaws/ })).not.toBeInTheDocument()
  })
})

describe('Arrangement editor', () => {
  it.each(['ordering', 'matching'] as const)('edits, adds, reorders and removes %s within 2–8 rows', async (type) => {
    const user = userEvent.setup(), changed = vi.fn()
    function Harness() {
      const [question, setQuestion] = useState<OrderingQuestion | MatchingQuestion>(type === 'ordering' ? orderingFixture() : matchingFixture())
      return <ArrangementEditor question={question} onChange={q => { setQuestion(q); changed(q) }} />
    }
    render(<Harness />)
    const label = type === 'ordering' ? 'Item' : 'Left'
    await user.clear(screen.getByLabelText(`${label} 1`)); await user.type(screen.getByLabelText(`${label} 1`), 'Updated')
    await user.click(screen.getByRole('button', { name: 'Move row 1 down' }))
    expect(screen.getByLabelText(`${label} 2`)).toHaveValue('Updated')
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: type === 'ordering' ? 'Add item' : 'Add pair' }))
    expect(screen.getByRole('button', { name: type === 'ordering' ? 'Add item' : 'Add pair' })).toBeDisabled()
    for (let i = 8; i > 2; i--) await user.click(screen.getByRole('button', { name: `Remove row ${i}` }))
    expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeDisabled()
    if (type === 'matching') { await user.selectOptions(screen.getByLabelText('Matching scoring'), 'exact'); expect(changed.mock.lastCall?.[0].scoringMode).toBe('exact') }
  })
})

describe('Arrangement question and reveal screens', () => {
  it.each([['ordering', false], ['ordering', true], ['matching', false], ['matching', true]] as const)('renders safe %s prompt and revealed solution, compact=%s', (type, compact) => {
    const q = type === 'ordering' ? orderingFixture() : matchingFixture(), safe = safeArrangement(q)
    const reveal = q.type === 'ordering' ? { type: q.type, correctItemIds: q.correctItemIds, caption: '' } : { type: q.type, correctPairs: q.correctPairs, scoringMode: q.scoringMode, caption: '' }
    const state: SafeGameState = { sessionId: 'session', quizTitle: 'Quiz', themeId: 'arcade', backgroundId: 'arcade-grid', roomCode: '123456', status: 'active', phase: 'question', currentQuestion: safe, reveal: null, players: [], roster: [], leaderboard: [], submittedCount: 0, questionOpenedAt: null, questionClosesAt: closesAt }
    const view = render(<PresentationStage state={state} compact={compact} />)
    expect(screen.queryByRole('region', { name: /Correct order|Correct pairs/ })).not.toBeInTheDocument()
    const lists = screen.getAllByRole('list')
    expect(within(lists[0]).getAllByRole('listitem')[0]).toHaveTextContent(q.type === 'ordering' ? 'Delta' : 'Pulp Fiction')
    expect(view.container.querySelector('.arrangement-prompt ol')).toBeNull()
    view.rerender(<PresentationStage state={{ ...state, phase: 'reveal', reveal }} compact={compact} />)
    expect(screen.getByRole('region', { name: type === 'ordering' ? 'Correct order' : 'Correct pairs' })).toBeVisible()
    view.unmount()
    const answer = q.type === 'ordering' ? { type: q.type, itemIds: [...q.correctItemIds].reverse() } : { type: q.type, pairs: q.correctPairs }
    render(<PlayerAnswerReveal question={safe} reveal={reveal} submittedAnswer={answer} />)
    expect(screen.getByRole('region', { name: 'Your answer' })).toBeVisible()
    expect(screen.getByRole('heading', { name: q.type === 'ordering' ? 'Not this time' : 'You got it right!' })).toBeVisible()
  })
})
