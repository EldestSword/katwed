import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerQuestion } from './PlayerQuestion'
import type { RosterMember, SafeQuestion } from '../../types/domain'

const question: SafeQuestion = {
  id: 'q1', imagePath: '/demo/portrait-1.svg', questionNumber: 1, totalQuestions: 3, timeLimitSeconds: 30,
}
const roster: RosterMember[] = ['Alex', 'Bailey', 'Casey'].map((displayName, displayOrder) => ({
  id: displayName.toLowerCase(), quizId: 'quiz', displayName, shortName: displayName, active: true, displayOrder,
}))
const closesAt = new Date(Date.now() + 60_000).toISOString()

describe('PlayerQuestion', () => {
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

  it('blocks a third choice and allows deselection before submission', async () => {
    const user = userEvent.setup()
    render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    await user.click(screen.getByRole('button', { name: 'Casey' }))
    expect(screen.getByRole('button', { name: 'Casey' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/Two selected already/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    expect(screen.getByRole('button', { name: 'Alex' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  })

  it('locks the answer after a successful submission', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<PlayerQuestion question={question} roster={roster} closesAt={closesAt} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Alex' }))
    await user.click(screen.getByRole('button', { name: 'Bailey' }))
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    expect(await screen.findByRole('heading', { name: 'Answer locked in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alex' })).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith(['alex', 'bailey'])
  })
})
