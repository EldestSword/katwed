import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { progressiveState } from '../../test/progressiveFixtures'
import { orderingFixture, matchingFixture, safeArrangement } from '../../test/arrangementFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { PlayerQuestion } from './PlayerQuestion'
import { PresentationStage } from './PresentationStage'
import type { SafeQuestion } from '../../types/domain'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T12:00:00Z')) })
afterEach(() => vi.useRealTimers())
it.each(['typed-answer', 'ordering', 'matching', 'slider', 'single-choice'] as const)('keeps %s draft and focus while local points change', type => {
  const state = progressiveState(), base = state.currentQuestion!
  if (base.media.type !== 'image') throw new Error('Image fixture required')
  let question: SafeQuestion = base
  if (type === 'ordering' || type === 'matching') question = { ...safeArrangement(type === 'ordering' ? orderingFixture() : matchingFixture()), media: base.media, progressiveRevealEnabled: true }
  if (type === 'slider' || type === 'single-choice') question = { ...mixedDemoQuiz.questions.find(q => q.type === type)!, questionNumber: 1, totalQuestions: 1, media: base.media, progressiveRevealEnabled: true } as SafeQuestion
  const submit = vi.fn(), { container } = render(<PlayerQuestion question={question} roster={[]} openedAt={state.questionOpenedAt} closesAt={state.questionClosesAt} onSubmit={submit} />)
  let focus: HTMLElement
  if (type === 'typed-answer') { focus = screen.getByRole('textbox'); fireEvent.change(focus, { target: { value: 'Al' } }) }
  else if (type === 'ordering') { focus = screen.getByRole('button', { name: 'Move Delta down' }); fireEvent.click(focus) }
  else if (type === 'matching') { fireEvent.click(screen.getByRole('button', { name: /Jaws/ })); focus = screen.getByRole('button', { name: /Spielberg/ }); fireEvent.click(focus) }
  else if (type === 'slider') { focus = screen.getByRole('slider'); fireEvent.change(focus, { target: { value: '60' } }) }
  else { focus = screen.getAllByRole('button', { pressed: false })[0]; fireEvent.click(focus) }
  focus.focus()
  const answerMarkup = container.querySelector('.player-answer-controls')?.innerHTML
  const currentValue = (focus as HTMLInputElement).value
  const order = screen.queryByRole('list', { name: 'Your order' })?.textContent
  act(() => { vi.advanceTimersByTime(10000) })
  expect(container.querySelector('.progressive-points')).toHaveTextContent('625 points available')
  expect(focus).toHaveFocus(); expect((focus as HTMLInputElement).value).toBe(currentValue)
  if (type === 'typed-answer') expect(focus).toHaveValue('Al')
  if (type === 'matching') expect(screen.getByRole('status')).toHaveTextContent('1 of 4 pairs made')
  if (type === 'ordering') expect(screen.getByRole('list', { name: 'Your order' }).textContent).toBe(order)
  if (type === 'single-choice') expect(focus).toHaveAttribute('aria-pressed', 'true')
  if (answerMarkup !== undefined) expect(container.querySelector('.player-answer-controls')?.innerHTML).toBe(answerMarkup)
  expect(submit).not.toHaveBeenCalled()
})
it.each(['both', 'players', 'presentation'] as const)('respects %s visibility and hides the badge after submission', mediaVisibility => {
  const state = progressiveState(), question = { ...state.currentQuestion!, mediaVisibility }
  const view = render(<PlayerQuestion question={question} roster={[]} openedAt={state.questionOpenedAt} closesAt={state.questionClosesAt} onSubmit={vi.fn()} />)
  expect(screen.queryAllByRole('img')).toHaveLength(mediaVisibility === 'presentation' ? 0 : 1)
  expect(view.container.querySelector('.progressive-points')).toBeVisible()
  view.rerender(<PlayerQuestion question={question} roster={[]} openedAt={state.questionOpenedAt} closesAt={state.questionClosesAt} initialAnswer={{ type: 'typed-answer', value: 'Alex' }} onSubmit={vi.fn()} />)
  expect(view.container.querySelector('.progressive-points')).not.toBeInTheDocument()
  expect(screen.queryAllByRole('img')).toHaveLength(mediaVisibility === 'presentation' ? 0 : 1)
})
it.each([true, false])('keeps the presentation timer, locked image and full answer reveal, compact=%s', compact => {
  const state = progressiveState(), view = render(<PresentationStage state={state} compact={compact} />)
  expect(view.container.querySelector('.progressive-points')).toHaveTextContent('1,000 points available')
  act(() => { vi.advanceTimersByTime(5000) })
  expect(view.container.querySelector('.progressive-points')).toHaveTextContent('812 points available')
  view.rerender(<PresentationStage state={{ ...state, phase: 'locked' }} compact={compact} />)
  expect(view.container.querySelector('.progressive-points')).not.toBeInTheDocument()
  expect(view.container.querySelector('.question-media')).toHaveAttribute('data-reveal-progress', '0.25')
  view.rerender(<PresentationStage state={{ ...state, phase: 'reveal', reveal: { type: 'typed-answer', correctAnswer: 'Alex', caption: '', correctPlayerIds: [] } }} compact={compact} />)
  expect(screen.getByRole('heading', { name: 'Alex' })).toBeVisible()
  expect(view.container.querySelector('.question-media')).toHaveAttribute('data-reveal-progress', '1')
})
it('has no progressive content in Round Intro and no image on a players-only presentation', () => {
  const state = progressiveState(), view = render(<PresentationStage state={{ ...state, currentQuestion: { ...state.currentQuestion!, mediaVisibility: 'players' } }} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  view.rerender(<PresentationStage state={{ ...state, phase: 'round-intro', currentQuestion: null }} />)
  expect(view.container.querySelector('.progressive-points')).not.toBeInTheDocument()
  expect(within(view.container).queryByRole('img')).not.toBeInTheDocument()
})
