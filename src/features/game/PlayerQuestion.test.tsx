import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerQuestion } from './PlayerQuestion'
import type { RosterMember, SafeQuestion } from '../../types/domain'

const question: SafeQuestion = {
  id: 'q1',
  type: 'mashup',
  prompt: 'Who is in this mash-up?',
  supportingText: '',
  media: { type: 'image', path: '/demo/portrait-1.svg', altText: 'Question image', revealEffect: 'immediate', revealDurationSeconds: 0 },
  mediaVisibility: 'both',
  presentationChoiceVisibility: 'hide',
  points: 1,
  displayOrder: 0,
  questionNumber: 1,
  totalQuestions: 3,
  timeLimitSeconds: 30,
}
const roster: RosterMember[] = ['Alex', 'Bailey', 'Casey'].map((displayName, displayOrder) => ({
  id: displayName.toLowerCase(), quizId: 'quiz', displayName, shortName: displayName, active: true, displayOrder,
}))
const closesAt = new Date(Date.now() + 60_000).toISOString()

describe('PlayerQuestion mash-up', () => {
  it('enables submission only when exactly two choices are selected', async () => {
    const user = userEvent.setup()
    render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Lock in' })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    expect(submit).toBeEnabled()
  })

  it('blocks a third choice and allows deselection', async () => {
    const user = userEvent.setup()
    render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    await user.click(screen.getByRole('button', { name: 'Casey' }))
    expect(screen.getByText(/Two selected already/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  })

  it('locks and restores a typed answer without exposing correctness', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    expect(await screen.findByRole('heading', { name: 'Answer locked in' })).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith({ type: 'mashup', memberIds: ['alex', 'bailey'] })
    rerender(<PlayerQuestion question={question} roster={roster} closesAt={closesAt}
      initialAnswer={{ type: 'mashup', memberIds: ['bailey', 'alex'] }} onSubmit={vi.fn()} />)
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument()
  })
})

describe('PlayerQuestion image choices', () => {
  it('opens enlargement without selecting the answer and closes with Escape', async () => {
    const user = userEvent.setup()
    const imageQuestion: SafeQuestion = {
      id: 'image-choice', type: 'single-choice', prompt: 'Choose', supportingText: '',
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      points: 1000, displayOrder: 0, questionNumber: 1, totalQuestions: 1, timeLimitSeconds: 30,
      options: [
        { id: 'picture', label: 'Picture', imagePath: '/demo/portrait-1.svg', imageAlt: 'Fictional portrait' },
        { id: 'text', label: 'Text only' },
      ],
      randomiseOptions: false,
    }
    render(<PlayerQuestion question={imageQuestion} roster={[]} closesAt={closesAt} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Enlarge' }))
    expect(screen.getByRole('dialog', { name: 'Enlarged question image' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Picture/ })).toHaveAttribute('aria-pressed', 'false')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
