import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuestionMedia } from './QuestionMedia'

const openedAt = '2026-09-04T12:00:00Z'
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(openedAt)) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
for (const reduced of [false, true]) it.each(['blur', 'pixelate', 'tiles', 'zoom-out'] as const)('protects %s from early enlargement/alt spoilers, reduced=' + reduced, revealEffect => {
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: reduced, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const media = { type: 'image' as const, path: '/demo/portrait-1.svg', altText: 'Secret answer', revealEffect, revealDurationSeconds: 20 }
  const view = render(<QuestionMedia media={media} openedAt={openedAt} progressiveRevealEnabled />)
  const progress = () => Number(view.container.querySelector('.question-media')?.getAttribute('data-reveal-progress'))
  expect(progress()).toBe(0)
  expect(screen.getByRole('img')).toHaveAccessibleName('Progressively revealing question image')
  expect(screen.queryByRole('button', { name: 'Enlarge image' })).not.toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(9900) })
  expect(progress()).toBe(reduced ? .25 : .495)
  if (reduced) expect(view.container.querySelector('.question-media__image')).toHaveStyle({ transition: 'none' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enlarge image' })).not.toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(10100) })
  expect(progress()).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Enlarge image' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  view.rerender(<QuestionMedia media={media} openedAt={new Date(Date.now()).toISOString()} progressiveRevealEnabled />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  view.rerender(<QuestionMedia media={media} openedAt={new Date(Date.now()).toISOString()} progressiveRevealEnabled revealed />)
  expect(progress()).toBe(1)
  expect(screen.getByRole('img')).toHaveAccessibleName('Secret answer')
  expect(screen.getByRole('button', { name: 'Enlarge image' })).toBeVisible()
})
it('keeps an unknown progressive opening obscured', () => {
  const { container } = render(<QuestionMedia media={{ type: 'image', path: '/demo/portrait-1.svg', altText: 'Secret', revealEffect: 'blur', revealDurationSeconds: 20 }} openedAt={null} progressiveRevealEnabled />)
  expect(container.querySelector('.question-media')).toHaveAttribute('data-reveal-progress', '0')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
