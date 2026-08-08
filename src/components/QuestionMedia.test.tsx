import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestionMedia } from './QuestionMedia'

const media = {
  type: 'image' as const,
  path: '/demo/portrait-2.svg',
  altText: 'A portrait',
  revealEffect: 'tiles' as const,
  revealDurationSeconds: 60,
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('QuestionMedia tile reveal', () => {
  it('keeps the same deterministic ranks while the image viewer opens and closes', async () => {
    const user = userEvent.setup()
    const { container } = render(<QuestionMedia media={media} openedAt={new Date().toISOString()} />)
    const ranks = () => [...container.querySelectorAll('.tile-cover span')]
      .map((tile) => tile.getAttribute('data-reveal-rank'))
    const before = ranks()
    expect(before).toHaveLength(24)
    expect(new Set(before).size).toBe(24)
    await user.click(screen.getByRole('button', { name: 'Enlarge image' }))
    expect(screen.getByRole('dialog', { name: 'Enlarged question image' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(ranks()).toEqual(before)
  })

  it('shows the complete image immediately for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }))
    const { container } = render(<QuestionMedia media={media} openedAt={new Date().toISOString()} />)
    fireEvent(window, new Event('resize'))
    expect(container.querySelector('.tile-cover')).not.toBeInTheDocument()
  })
})
