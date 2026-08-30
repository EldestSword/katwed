import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QuizThemeDefinition } from './quizThemes'
import { quizThemes } from './quizThemes'
import { ThemeBrowser } from './ThemeBrowser'

describe('ThemeBrowser', () => {
  it('searches normalised metadata, filters categories and selects accessibly', async () => {
    const user = userEvent.setup()
    const select = vi.fn()
    render(<ThemeBrowser selectedId="katwed" onSelect={select} />)
    expect(screen.getByRole('button', { name: /Katwed!/ })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByRole('searchbox', { name: 'Search themes' }), '  electric   blue ')
    expect(screen.getByRole('button', { name: /Midnight/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sunset/ })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search themes' }))
    await user.click(screen.getByRole('button', { name: 'Entertainment' }))
    expect(screen.getByRole('button', { name: /Arcade/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retro Game Show/ })).toBeInTheDocument()
    expect(screen.getByText('2 themes shown')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Arcade/ }))
    expect(select).toHaveBeenCalledWith('arcade')

    await user.clear(screen.getByRole('searchbox', { name: 'Search themes' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search themes' }), 'no such visual identity')
    expect(screen.getByText('No themes match that search and category.')).toBeInTheDocument()
    expect(screen.getByText('0 themes shown')).toBeInTheDocument()
  })

  it('uses lazy lightweight previews without applying every decorative catalogue font', () => {
    render(<ThemeBrowser selectedId="katwed" onSelect={() => undefined} />)
    const hardRock = screen.getByRole('button', { name: /Hard Rock/ })
    const preview = within(hardRock).getByRole('img', { name: 'Hard Rock theme artwork preview' })
    expect(preview).toHaveAttribute('loading', 'lazy')
    expect(preview).toHaveAttribute('src', '/backgrounds/previews/hard-rock.webp')
    expect(within(hardRock).getByText('Hard Rock')).not.toHaveAttribute('style')
  })

  it('supports native keyboard selection', async () => {
    const user = userEvent.setup()
    const select = vi.fn()
    render(<ThemeBrowser selectedId="katwed" onSelect={select} />)
    const paper = screen.getByRole('button', { name: /Paper/ })
    paper.focus()
    await user.keyboard('{Enter}')
    expect(select).toHaveBeenCalledWith('paper')
  })

  it('remains searchable with a large catalogue fixture', async () => {
    const user = userEvent.setup()
    const themes = Array.from({ length: 48 }, (_, index) => ({
      ...quizThemes[index % quizThemes.length],
      id: `fixture-${index}`,
      name: `Fixture theme ${index}`,
      keywords: [`fixture-keyword-${index}`],
    })) as unknown as readonly QuizThemeDefinition[]
    render(<ThemeBrowser selectedId="katwed" onSelect={() => undefined} themes={themes} />)
    expect(screen.getByText('48 themes shown')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search themes' }), 'fixture-keyword-37')
    expect(screen.getByRole('button', { name: /Fixture theme 37/ })).toBeInTheDocument()
    expect(screen.getByText('1 theme shown')).toBeInTheDocument()
  })
})
