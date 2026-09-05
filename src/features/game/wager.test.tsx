import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerQuestion } from './PlayerQuestion'
import { PlayerAnswerReveal } from './PlayerAnswerReveal'
import { PresentationStage } from './PresentationStage'
import { progressiveState } from '../../test/progressiveFixtures'
import { connectionsState, safeConnections } from '../../test/connectionsFixtures'
import { orderingFixture, matchingFixture, safeArrangement } from '../../test/arrangementFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { SafeQuestion } from '../../types/domain'

afterEach(() => vi.useRealTimers())
it.each([25,50,100])('defaults to No wager, keeps the typed draft and submits %d%% once', async percent => {
  const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined), state = progressiveState()
  const question = { ...state.currentQuestion!, wagerEnabled: true }
  const props = { question, roster: [], openedAt: state.questionOpenedAt, closesAt: state.questionClosesAt, onSubmit: submit }
  const view = render(<PlayerQuestion {...props} />)
  expect(screen.getByRole('radio', { name: 'No wager' })).toBeChecked()
  await user.type(screen.getByRole('textbox'), 'Alex')
  await user.click(screen.getByRole('radio', { name: new RegExp(`^${percent}%`) }))
  view.rerender(<PlayerQuestion {...props} question={{ ...question }} />)
  expect(screen.getByRole('textbox')).toHaveValue('Alex')
  expect(screen.getByRole('radio', { name: new RegExp(`^${percent}%`) })).toBeChecked()
  expect(view.container.querySelector('.progressive-points')).not.toHaveTextContent('+')
  await user.click(screen.getByRole('button', { name: 'Lock in' }))
  expect(submit).toHaveBeenCalledExactlyOnceWith({ type: 'typed-answer', value: 'Alex', wagerPercent: percent })
  expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  expect(view.container.querySelector('.wager-summary')).toHaveTextContent(`${percent * 10 === 1000 ? '1,000' : percent * 10} points`)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByText(/wager won|wager lost/i)).not.toBeInTheDocument()
})
it('native radios support keyboard selection and default No wager requires no click', async () => {
  const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined)
  const question = { ...safeConnections(), wagerEnabled: true }
  render(<PlayerQuestion question={question} roster={[]} closesAt={null} onSubmit={submit} />)
  screen.getByRole('radio', { name: 'No wager' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: /^25%/ })).toBeChecked()
  await user.keyboard('{ArrowLeft}')
  await user.type(screen.getByRole('textbox'), 'Planets'); await user.click(screen.getByRole('button', { name: 'Lock in' }))
  expect(submit).toHaveBeenCalledExactlyOnceWith({ type: 'connections', value: 'Planets', wagerPercent: 0 })
})
it('clue updates preserve wager and draft; a new question and restarted opening reset them', async () => {
  const user = userEvent.setup(), submit = vi.fn(), props = { roster: [], closesAt: null, openedAt: '2026-09-04T12:00:00Z', onSubmit: submit }
  const view = render(<PlayerQuestion {...props} question={{ ...safeConnections(), wagerEnabled: true }} />)
  await user.type(screen.getByRole('textbox'), 'Pla'); await user.click(screen.getByRole('radio', { name: /^50%/ }))
  view.rerender(<PlayerQuestion {...props} question={{ ...safeConnections(3), wagerEnabled: true }} />)
  expect(screen.getByRole('textbox')).toHaveValue('Pla'); expect(screen.getByRole('radio', { name: /^50%/ })).toBeChecked()
  await user.click(screen.getByRole('radio', { name: /^100%/ }))
  expect(screen.getByRole('textbox')).toHaveValue('Pla')
  view.rerender(<PlayerQuestion {...props} question={{ ...safeConnections(), id: 'next', wagerEnabled: true }} />)
  expect(screen.getByRole('radio', { name: 'No wager' })).toBeChecked(); expect(screen.getByRole('textbox')).toHaveValue('')
  await user.click(screen.getByRole('radio', { name: /^100%/ }))
  view.rerender(<PlayerQuestion {...props} openedAt="2026-09-04T13:00:00Z" question={{ ...safeConnections(), id: 'next', wagerEnabled: true }} />)
  expect(screen.getByRole('radio', { name: 'No wager' })).toBeChecked()
})
it.each(['typed-answer','ordering','matching','slider','single-choice','pinpoint'] as const)('changing wagers preserves the %s control and Progressive clock', type => {
  vi.useFakeTimers()
  const state = progressiveState(), base = state.currentQuestion!
  let question: SafeQuestion = base
  if (type === 'ordering' || type === 'matching') question = safeArrangement(type === 'ordering' ? orderingFixture() : matchingFixture())
  else if (type !== 'typed-answer') question = { ...mixedDemoQuiz.questions.find(q => q.type === type)!, questionNumber: 1, totalQuestions: 1 } as SafeQuestion
  question = { ...question, wagerEnabled: true, ...(type !== 'pinpoint' ? { media: base.media, progressiveRevealEnabled: true } : {}) } as SafeQuestion
  const { container } = render(<PlayerQuestion question={question} roster={[]} openedAt={state.questionOpenedAt} closesAt={state.questionClosesAt} onSubmit={vi.fn()} />)
  let control: HTMLElement
  if (type === 'typed-answer') { control = screen.getByRole('textbox'); fireEvent.change(control,{target:{value:'Alex'}}) }
  else if (type === 'ordering') { control = screen.getByRole('button',{name:'Move Delta down'}); fireEvent.click(control) }
  else if (type === 'matching') { fireEvent.click(screen.getByRole('button',{name:/Jaws/})); control=screen.getByRole('button',{name:/Spielberg/}); fireEvent.click(control) }
  else if (type === 'slider') { control=screen.getByRole('slider'); fireEvent.change(control,{target:{value:'60'}}) }
  else if (type === 'pinpoint') { control=screen.getByRole('slider',{name:'Horizontal',hidden:true}); fireEvent.change(control,{target:{value:'.7'}}) }
  else { control=screen.getAllByRole('button',{pressed:false})[0]; fireEvent.click(control) }
  const value = (control as HTMLInputElement).value, order = screen.queryByRole('list',{name:'Your order'})?.textContent
  fireEvent.click(screen.getByRole('radio',{name:/^50%/}))
  act(() => { vi.advanceTimersByTime(10000) })
  expect(screen.getByRole('radio',{name:/^50%/})).toBeChecked()
  expect(control).toBeInTheDocument(); expect((control as HTMLInputElement).value).toBe(value)
  if (type === 'matching') expect(screen.getByText('1 of 4 pairs made')).toBeInTheDocument()
  if (type === 'ordering') expect(screen.getByRole('list',{name:'Your order'}).textContent).toBe(order)
  if (type === 'single-choice') expect(control).toHaveAttribute('aria-pressed','true')
  if (type !== 'pinpoint') expect(container.querySelector('.progressive-points')).toHaveTextContent('625 points available')
})
it.each([false,true])('presentation shows a shared indicator with no private wager, compact=%s', compact => {
  const state = connectionsState(), view = render(<PresentationStage compact={compact} state={{ ...state, currentQuestion: { ...state.currentQuestion!, wagerEnabled: true } }} />)
  expect(view.container.querySelector('.wager-indicator')).toHaveTextContent('Wager question · Up to 1,000 pts at risk')
  expect(screen.queryByRole('radio')).not.toBeInTheDocument(); expect(view.container.querySelector('.wager-summary')).toBeNull()
  view.rerender(<PresentationStage state={{ ...state, phase:'round-intro', currentQuestion:null }} />)
  expect(view.container.querySelector('.wager-indicator')).toBeNull()
  view.rerender(<PresentationStage state={{ ...state, quizType:'head-to-head', currentQuestion: { ...progressiveState().currentQuestion!, wagerEnabled:true } }} />)
  expect(view.container.querySelector('.wager-indicator')).toBeNull()
})
it('restores the locked stake and retains it at reveal without claiming a wager outcome', () => {
  const q = { ...safeConnections(), wagerEnabled: true }, answer = { type:'connections' as const,value:'Planets',wagerPercent:50 as const }
  const view = render(<PlayerQuestion question={q} roster={[]} closesAt={null} initialAnswer={answer} onSubmit={vi.fn()} />)
  expect(view.container.querySelector('.wager-summary')).toHaveTextContent('500 points')
  view.rerender(<PlayerAnswerReveal question={q} submittedAnswer={answer} reveal={{type:'connections',correctAnswer:'Planets',correctPlayerIds:[],caption:''}} />)
  expect(view.container.querySelector('.wager-summary')).toHaveTextContent('500 points')
  expect(within(view.container).queryByText(/Wager won|Wager lost/i)).toBeNull()
})
