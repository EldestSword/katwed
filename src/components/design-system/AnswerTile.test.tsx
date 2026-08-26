import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AnswerTile } from './AnswerTile'
import { positionMarkerNames } from './positionMarkers'

describe('AnswerTile', () => {
  it('renders eight stable positional markers and exposes position without relying on colour', () => {
    const { container } = render(<>{positionMarkerNames.map((name, position) => (
      <AnswerTile key={name} label={`Option ${position + 1}`} position={position} />
    ))}</>)
    expect([...container.querySelectorAll('[data-marker]')].map((marker) => marker.getAttribute('data-marker'))).toEqual(positionMarkerNames)
    expect(screen.getByText('Answer 8')).toHaveClass('sr-only')
  })

  it('communicates selected, disabled, locked, correct and incorrect states in text and semantics', () => {
    const { rerender } = render(<AnswerTile label="Choice" accessibleLabel="Choice" position={0} selected onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choice' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Selected')).toBeVisible()

    rerender(<AnswerTile label="Choice" accessibleLabel="Choice" position={0} state="locked" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choice' })).toBeDisabled()
    expect(screen.getByText('Locked')).toBeVisible()

    rerender(<AnswerTile label="Choice" position={0} state="correct" />)
    expect(screen.getByText('Correct')).toBeVisible()
    rerender(<AnswerTile label="Choice" position={0} state="incorrect" />)
    expect(screen.getByText('Incorrect')).toBeVisible()
    rerender(<AnswerTile label="Choice" accessibleLabel="Choice" position={0} disabled onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choice' })).toBeDisabled()
    expect(screen.getByText('Unavailable')).toBeVisible()
  })

  it('keeps image enlargement separate from answer selection', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onEnlarge = vi.fn()
    render(<AnswerTile label="Image choice" accessibleLabel="Image choice" position={6}
      image={{ path: '/demo/portrait-1.svg', alt: 'Fictional portrait' }} onSelect={onSelect} onEnlarge={onEnlarge} />)
    await user.click(screen.getByRole('button', { name: 'Enlarge' }))
    expect(onEnlarge).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
