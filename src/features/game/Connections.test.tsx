import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { connectionsFixture, connectionsState, safeConnections } from '../../test/connectionsFixtures'
import { PlayerQuestion } from './PlayerQuestion'
import { PresentationStage } from './PresentationStage'
import { PlayerAnswerReveal } from './PlayerAnswerReveal'
import { HostConnectionsControls } from './HostConnectionsControls'
import { ConnectionsEditor } from '../quiz-editor/ConnectionsEditor'
import { parseTypedAnswerAlternatives } from '../typed-answer/typedAnswer'

it('keeps typed text and focus across clue updates, then locks a single trimmed answer', async () => {
  const user = userEvent.setup(), submit = vi.fn().mockResolvedValue(undefined), closesAt = new Date(Date.now() + 60000).toISOString()
  const view = render(<PlayerQuestion question={safeConnections()} roster={[]} closesAt={closesAt} onSubmit={submit} />)
  expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  const input = screen.getByRole('textbox', { name: 'Your connection' })
  await user.type(input, '  Pla')
  view.rerender(<PlayerQuestion question={safeConnections(2)} roster={[]} closesAt={closesAt} onSubmit={submit} />)
  expect(input).toHaveValue('  Pla'); expect(input).toHaveFocus()
  expect(screen.getByText('750 points available')).toBeVisible(); expect(screen.queryByText('Earth')).not.toBeInTheDocument()
  await user.type(input, 'nets  '); await user.click(screen.getByRole('button', { name: 'Lock in' }))
  expect(submit).toHaveBeenCalledExactlyOnceWith({ type: 'connections', value: 'Planets' })
  view.rerender(<PlayerQuestion question={safeConnections(3)} roster={[]} closesAt={closesAt} onSubmit={submit} />)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Answer locked' })).toBeVisible()
  expect(screen.getByText('Earth')).toBeVisible()
})
it.each([false, true])('grows the safe presentation clues and shows the primary answer on reveal, compact=%s', compact => {
  const state = connectionsState(), view = render(<PresentationStage state={state} compact={compact} />)
  expect(screen.getByText('Mercury')).toBeVisible(); expect(screen.queryByText('Venus')).not.toBeInTheDocument()
  view.rerender(<PresentationStage state={{ ...state, currentQuestion: safeConnections(2) }} compact={compact} />)
  expect(screen.getByText('Venus')).toBeVisible(); expect(screen.getByText('750 points available')).toBeVisible()
  view.rerender(<PresentationStage state={{ ...state, phase: 'reveal', currentQuestion: safeConnections(2, true), reveal: { type: 'connections', correctAnswer: 'Planets', correctPlayerIds: [], caption: '' } }} compact={compact} />)
  expect(screen.getByText('Mars')).toBeVisible(); expect(screen.getByRole('heading', { name: 'Planets' })).toBeVisible()
  expect(screen.queryByText(/solar system/i)).not.toBeInTheDocument()
})
it.each([true, false])('uses authoritative correctness for alternatives, correct=%s', correct => {
  render(<PlayerAnswerReveal question={safeConnections(4, true)} reveal={{ type: 'connections', correctAnswer: 'Planets', correctPlayerIds: correct ? ['p'] : [], caption: '' }} submittedAnswer={{ type: 'connections', value: 'Planets of the Solar System' }} playerId="p" />)
  expect(screen.getByRole('heading', { name: correct ? 'You got it right!' : 'Not this time' })).toBeVisible()
  expect(screen.getByText('Mars')).toBeVisible()
})
it('shows the next clue privately and stops at the final clue', async () => {
  const user = userEvent.setup(), reveal = vi.fn(), definition = connectionsFixture()
  const view = render(<HostConnectionsControls question={safeConnections(2)} definition={definition} disabled={false} onReveal={reveal} />)
  expect(screen.getByText('Earth')).toBeVisible(); expect(screen.getByText(/750 points/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Reveal next clue' })); expect(reveal).toHaveBeenCalledOnce()
  view.rerender(<HostConnectionsControls question={safeConnections(4)} definition={definition} disabled={false} onReveal={reveal} />)
  expect(screen.getByRole('button', { name: 'Reveal next clue' })).toBeDisabled()
})
it('edits, reorders and bounds clues, uses alternatives and updates the points ladder', async () => {
  const user = userEvent.setup()
  function Editor() {
    const [q, update] = useState(connectionsFixture())
    return <><ConnectionsEditor question={q} onChange={update} /><button onClick={() => update({ ...q, points: 999, doubleScore: true })}>Change points</button><output>{q.acceptedAnswers.join('|')}</output></>
  }
  render(<Editor />)
  await user.click(screen.getByRole('button', { name: 'Move clue 1 down' }))
  expect(screen.getByLabelText('Clue 1')).toHaveValue('Venus')
  await user.clear(screen.getByLabelText('Clue 1')); await user.type(screen.getByLabelText('Clue 1'), 'Jupiter')
  await user.click(screen.getByRole('button', { name: 'Add clue' })); await user.click(screen.getByRole('button', { name: 'Add clue' }))
  expect(screen.getByRole('button', { name: 'Add clue' })).toBeDisabled()
  for (let i = 6; i > 2; i--) await user.click(screen.getByRole('button', { name: `Remove clue ${i}` }))
  expect(screen.getByRole('button', { name: 'Remove clue 1' })).toBeDisabled()
  await user.clear(screen.getByLabelText('Also accept')); await user.type(screen.getByLabelText('Also accept'), 'Worlds\nSolar planets')
  expect(screen.getByText(parseTypedAnswerAlternatives('Worlds\nSolar planets').join('|'))).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Change points' }))
  expect(within(screen.getByRole('list', { name: 'Points by clue stage' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Clue 11,998 pts', 'Clue 2998 pts'])
})
