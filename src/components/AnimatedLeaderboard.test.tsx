import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { board, currentBoard, previousBoard } from '../test/leaderboardFixtures'
import { AnimatedLeaderboard } from './AnimatedLeaderboard'

const settle = vi.fn()
const reveal = { id: 2, previous: previousBoard, entries: currentBoard }
const order = (container: HTMLElement) => [...container.querySelectorAll<HTMLLIElement>('li')].map((row) => row.dataset.playerId)
const advance = async (milliseconds: number) => { await act(async () => { vi.advanceTimersByTime(milliseconds) }) }

describe('AnimatedLeaderboard', () => {
  beforeEach(() => { vi.useFakeTimers(); settle.mockClear() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('shows previous positions and scores, counts once, reuses row identities and settles to the authoritative order', async () => {
    const { container } = render(<AnimatedLeaderboard reveal={reveal} onSettled={settle} />)
    expect(order(container)).toEqual(['roger', 'carol', 'jaki', 'ross'])
    const jaki = container.querySelector('[data-player-id="jaki"]')!
    expect(jaki.querySelector('.leaderboard__points [aria-hidden]')).toHaveTextContent('4,400 points')
    expect(jaki.querySelector('.leaderboard__rank [aria-hidden]')).toHaveTextContent('3')
    expect(jaki.querySelector('.leaderboard__movement')).toHaveTextContent('↑ 2')
    expect(container.querySelector('[data-player-id="roger"] .leaderboard__movement')).toHaveTextContent('↓ 1')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await advance(600)
    const partial = Number(jaki.querySelector('.leaderboard__points [aria-hidden]')!.textContent!.replace(/\D/g, ''))
    expect(partial).toBeGreaterThan(4400)
    expect(partial).toBeLessThan(5000)
    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'off')
    expect(jaki.querySelector('.leaderboard__points .sr-only')).toHaveTextContent('5,000 points')
    await advance(500)
    expect(order(container)).toEqual(['jaki', 'roger', 'carol', 'ross'])
    expect(container.querySelector('[data-player-id="jaki"]')).toBe(jaki)
    expect(jaki.querySelector('.leaderboard__rank [aria-hidden]')).toHaveTextContent('3')
    await advance(900)
    expect(jaki.querySelector('.leaderboard__rank')).toHaveTextContent('1')
    expect(jaki.querySelector('.leaderboard__points')).toHaveTextContent('5,000 points')
    expect(screen.getByRole('status')).toHaveTextContent('Jaki takes the lead!')
    expect(settle).toHaveBeenCalledExactlyOnceWith(2)
    await advance(600)
    expect(container.querySelector('.leaderboard__movement')).toBeNull()
  })

  it('animates negative wager totals without losing their signs or authoritative ranks', async () => {
    const previous = board(['Carol', 'Roger'], [-1000, -2000])
    const entries = board(['Roger', 'Carol'], [-500, -1500])
    const { container } = render(<AnimatedLeaderboard reveal={{ id: 3, previous, entries }} onSettled={settle} />)
    const roger = container.querySelector('[data-player-id="roger"]')!
    expect(roger.querySelector('.leaderboard__points [aria-hidden]')).toHaveTextContent('-2,000 points')
    await advance(600)
    const partial = Number(roger.querySelector('.leaderboard__points [aria-hidden]')!.textContent!.replace(/[^\d-]/g, ''))
    expect(partial).toBeGreaterThan(-2000)
    expect(partial).toBeLessThan(-500)
    await advance(1400)
    expect(order(container)).toEqual(['roger', 'carol'])
    expect(roger.querySelector('.leaderboard__points')).toHaveTextContent('-500 points')
    expect(screen.getByRole('status')).toHaveTextContent('Roger takes the lead!')
  })

  it('measures only at the reorder and applies opposite transform displacements to climbing and falling rows', async () => {
    const cancel = vi.fn()
    const animations: Array<{ id: string | undefined; frames: Keyframe[] }> = []
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function (this: HTMLElement, frames: Keyframe[]) {
      animations.push({ id: this.dataset.playerId, frames })
      return { cancel }
    } })
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = [...this.parentElement!.children].indexOf(this)
      return { left: 0, top: index * 70 } as DOMRect
    })
    try {
      const { unmount } = render(<AnimatedLeaderboard reveal={reveal} onSettled={settle} />)
      await advance(1000)
      expect(measure).not.toHaveBeenCalled()
      await advance(100)
      expect(measure).toHaveBeenCalledTimes(8)
      expect(animations.find((entry) => entry.id === 'jaki')?.frames[0].transform).toBe('translate(0px, 140px)')
      expect(animations.find((entry) => entry.id === 'roger')?.frames[0].transform).toBe('translate(0px, -70px)')
      await advance(300)
      expect(measure).toHaveBeenCalledTimes(8)
      unmount()
      expect(cancel).toHaveBeenCalledTimes(3)
      expect(vi.getTimerCount()).toBe(0)
      expect(settle).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original)
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    }
  })

  it('shows the first leaderboard as final without invented scores, movement or commentary', () => {
    const { container } = render(<AnimatedLeaderboard reveal={{ ...reveal, previous: null }} onSettled={settle} />)
    expect(order(container)).toEqual(['jaki', 'roger', 'carol', 'ross'])
    expect(container.firstChild).toHaveAttribute('data-reveal-stage', 'settled')
    expect(screen.getByText('5,000 points')).toBeVisible()
    expect(container.querySelector('.leaderboard__movement')).toBeNull()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves true movement and commentary with reduced motion, with no count-up or physical movement', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const { container } = render(<AnimatedLeaderboard reveal={reveal} onSettled={settle} />)
    expect(container.firstChild).toHaveAttribute('data-reveal-stage', 'settled')
    expect(order(container)).toEqual(['jaki', 'roger', 'carol', 'ross'])
    expect(container.querySelector('[data-player-id="jaki"] .leaderboard__points')).toHaveTextContent('5,000 points')
    expect(container.querySelector('.leaderboard__movement')).toHaveTextContent('↑ 2')
    expect(screen.getByRole('status')).toHaveTextContent('Jaki takes the lead!')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles missing and new rows using only the current display capacity', async () => {
    const { container } = render(<AnimatedLeaderboard reveal={{ id: 3, previous: previousBoard, entries: board(['Jaki', 'Newcomer', 'Roger']) }} limit={2} onSettled={settle} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(container.querySelector('[data-player-id="newcomer"] .leaderboard__movement')).toBeNull()
    await advance(2600)
    expect(order(container)).toEqual(['jaki', 'newcomer'])
  })

  it('does not restart for a copied snapshot or leak timers under Strict Mode', async () => {
    const { container, rerender, unmount } = render(<StrictMode><AnimatedLeaderboard reveal={reveal} onSettled={settle} /></StrictMode>)
    await advance(600)
    rerender(<StrictMode><AnimatedLeaderboard reveal={{ ...reveal, entries: [...currentBoard] }} onSettled={settle} /></StrictMode>)
    await advance(1400)
    expect(container.firstChild).toHaveAttribute('data-reveal-stage', 'settled')
    expect(settle).toHaveBeenCalledExactlyOnceWith(2)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
