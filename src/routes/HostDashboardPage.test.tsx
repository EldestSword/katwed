import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthProvider'
import { QUIZ_SORT_STORAGE_KEY } from '../features/quiz-library/library'
import { sampleQuiz } from '../lib/demo/sampleData'
import type { Quiz } from '../types/domain'
import { HostDashboardPage } from './HostDashboardPage'

const repositoryMocks = vi.hoisted(() => ({
  listQuizzes: vi.fn(),
  listArchivedQuizzes: vi.fn(),
  getActiveSessionForQuiz: vi.fn(),
  duplicateQuiz: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: repositoryMocks }))

function quiz(
  id: string,
  title: string,
  createdAt: string,
  updatedAt: string,
  archivedAt: string | null = null,
  coverImagePath: string | null = null,
): Quiz {
  return {
    ...structuredClone(sampleQuiz),
    id,
    title,
    createdAt,
    updatedAt,
    archivedAt,
    coverImagePath,
  }
}

const activeQuizzes = [
  quiz(
    'active-friday',
    'Friday Team Quiz',
    '2026-01-01T12:00:00.000Z',
    '2026-03-01T12:00:00.000Z',
    null,
    'https://media.example/friday-cover.webp',
  ),
  quiz('quiz-10', 'Quiz 10', '2026-04-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z'),
  quiz('quiz-2', 'quiz 2', '2026-02-01T12:00:00.000Z', '2026-02-01T12:00:00.000Z'),
]

const archivedQuizzes = [
  quiz(
    'archived-friday',
    'Friday Archive',
    '2025-01-01T12:00:00.000Z',
    '2026-02-01T12:00:00.000Z',
    '2026-05-01T12:00:00.000Z',
    'https://media.example/archived-cover.webp',
  ),
  quiz('archived-old', 'Old Notes', '2024-01-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z', '2026-05-02T12:00:00.000Z'),
]

function CopyEditorDestination() {
  return <h1>Editing copy {useParams().quizId}</h1>
}

function renderDashboard() {
  localStorage.setItem('katwed.demo.host', 'true')
  return render(
    <MemoryRouter initialEntries={['/host']}>
      <AuthProvider>
        <Routes>
          <Route path="/host" element={<HostDashboardPage />} />
          <Route path="/host/quizzes/:quizId/edit" element={<CopyEditorDestination />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function cardTitles() {
  return screen.getAllByRole('article').map((card) => within(card).getByRole('heading', { level: 2 }).textContent)
}

describe('HostDashboardPage quiz library', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    repositoryMocks.listQuizzes.mockResolvedValue(activeQuizzes)
    repositoryMocks.listArchivedQuizzes.mockResolvedValue(archivedQuizzes)
    repositoryMocks.getActiveSessionForQuiz.mockResolvedValue(null)
  })

  it('renders accessible controls, defaults to Last edited and shows British last-edited metadata', async () => {
    renderDashboard()

    expect(await screen.findByRole('link', { name: 'Storage' })).toHaveAttribute('href', '/host/storage')
    expect(screen.getByRole('searchbox', { name: 'Search quizzes' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Sort quizzes' })).toHaveValue('updated-desc')
    expect(cardTitles()).toEqual(['Friday Team Quiz', 'quiz 2', 'Quiz 10'])
    expect(screen.getByText('Last edited 1 Mar 2026')).toBeVisible()
  })

  it('renders decorative covers for Active and Archived cards and a fallback without a cover', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const covered = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    expect(covered.querySelector('img.quiz-card__cover[alt=""]')).toHaveAttribute(
      'src',
      'https://media.example/friday-cover.webp',
    )
    const fallback = screen.getByRole('article', { name: 'Quiz 10' })
    expect(fallback.querySelector('img')).toBeNull()
    expect(fallback.querySelector('.quiz-card__art')).toHaveTextContent('3')

    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 2' }))
    const archived = screen.getByRole('article', { name: 'Friday Archive' })
    expect(archived.querySelector('img.quiz-card__cover[alt=""]')).toHaveAttribute(
      'src',
      'https://media.example/archived-cover.webp',
    )
  })

  it('falls back cleanly when a cover image fails to load', async () => {
    renderDashboard()

    const covered = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    fireEvent.error(covered.querySelector('img.quiz-card__cover')!)
    expect(covered.querySelector('img')).toBeNull()
    expect(covered.querySelector('.quiz-card__art')).toHaveTextContent('3')
  })

  it('filters Active titles without case sensitivity, preserves total counts and clears the search', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const search = await screen.findByRole('searchbox', { name: 'Search quizzes' })
    await user.type(search, '  TEAM  ')

    expect(screen.getByRole('article', { name: 'Friday Team Quiz' })).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Quiz 10' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Active quizzes 3' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(search).toHaveValue('')
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('keeps the current query when switching between Active and Archived libraries', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.type(await screen.findByRole('searchbox', { name: 'Search quizzes' }), 'FRIDAY')
    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 2' }))

    expect(screen.getByRole('article', { name: 'Friday Archive' })).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Old Notes' })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search quizzes' })).toHaveValue('FRIDAY')
  })

  it.each([
    ['title-asc', ['Friday Team Quiz', 'quiz 2', 'Quiz 10']],
    ['title-desc', ['Quiz 10', 'quiz 2', 'Friday Team Quiz']],
    ['created-desc', ['Quiz 10', 'quiz 2', 'Friday Team Quiz']],
  ])('sorts cards using %s', async (sort, expected) => {
    const user = userEvent.setup()
    renderDashboard()

    await screen.findByRole('article', { name: 'Friday Team Quiz' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort quizzes' }), sort)

    expect(cardTitles()).toEqual(expected)
    expect(sessionStorage.getItem(QUIZ_SORT_STORAGE_KEY)).toBe(sort)
  })

  it('restores a valid session sort preference', async () => {
    sessionStorage.setItem(QUIZ_SORT_STORAGE_KEY, 'title-desc')
    renderDashboard()

    expect(await screen.findByRole('combobox', { name: 'Sort quizzes' })).toHaveValue('title-desc')
    expect(cardTitles()).toEqual(['Quiz 10', 'quiz 2', 'Friday Team Quiz'])
  })

  it('falls back safely when the stored sort preference is invalid', async () => {
    sessionStorage.setItem(QUIZ_SORT_STORAGE_KEY, 'not-a-sort')
    renderDashboard()

    expect(await screen.findByRole('combobox', { name: 'Sort quizzes' })).toHaveValue('updated-desc')
    expect(cardTitles()).toEqual(['Friday Team Quiz', 'quiz 2', 'Quiz 10'])
  })

  it('shows a search-specific empty state and can clear it', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.type(await screen.findByRole('searchbox', { name: 'Search quizzes' }), 'Missing')
    expect(screen.getByRole('heading', { name: 'No active quizzes match “Missing”.' })).toBeVisible()

    const clearButtons = screen.getAllByRole('button', { name: 'Clear search' })
    await user.click(clearButtons.at(-1)!)
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('preserves genuine empty states when the underlying libraries are empty', async () => {
    const user = userEvent.setup()
    repositoryMocks.listQuizzes.mockResolvedValue([])
    repositoryMocks.listArchivedQuizzes.mockResolvedValue([])
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'No active quizzes' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 0' }))
    expect(screen.getByRole('heading', { name: 'No archived quizzes' })).toBeVisible()
  })

  it('preserves the different Active and Archived card actions', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const activeCard = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    expect(within(activeCard).getByRole('button', { name: 'Launch game' })).toBeVisible()
    expect(within(activeCard).getByRole('link', { name: 'Edit' })).toBeVisible()
    expect(within(activeCard).getByRole('button', { name: 'Duplicate' })).toBeVisible()
    expect(within(activeCard).getByRole('button', { name: 'Archive' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 2' }))
    const archivedCard = screen.getByRole('article', { name: 'Friday Archive' })
    expect(within(archivedCard).getByRole('button', { name: 'Restore' })).toBeVisible()
    expect(within(archivedCard).getByRole('button', { name: 'Permanently delete' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument()
  })

  it('badges Head-to-Head quizzes and exposes live launch only in the active library', async () => {
    const user = userEvent.setup()
    const headToHead = {
      ...activeQuizzes[0],
      quizType: 'head-to-head' as const,
      headToHeadCompetitors: [
        { id: 'a', quizId: activeQuizzes[0].id, displayName: 'Ross', displayOrder: 0 as const },
        { id: 'b', quizId: activeQuizzes[0].id, displayName: 'Jess', displayOrder: 1 as const },
      ],
    }
    repositoryMocks.listQuizzes.mockResolvedValue([headToHead])
    repositoryMocks.listArchivedQuizzes.mockResolvedValue([{ ...headToHead, archivedAt: '2026-05-01T12:00:00.000Z' }])
    renderDashboard()

    const activeCard = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    expect(within(activeCard).getByText('Head to Head')).toBeVisible()
    const launch = within(activeCard).getByRole('button', { name: 'Launch game' })
    expect(launch).toBeEnabled()
    expect(within(activeCard).getByRole('button', { name: 'Duplicate' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 1' }))
    const archivedCard = screen.getByRole('article', { name: 'Friday Team Quiz' })
    expect(within(archivedCard).getByText('Head to Head')).toBeVisible()
    expect(within(archivedCard).queryByRole('button', { name: 'Launch game' })).not.toBeInTheDocument()
  })

  it('prevents repeat Duplicate clicks and navigates to the newly created quiz editor', async () => {
    const user = userEvent.setup()
    let finishDuplicate: ((quiz: Quiz) => void) | undefined
    repositoryMocks.duplicateQuiz.mockReturnValue(new Promise<Quiz>((resolve) => { finishDuplicate = resolve }))
    renderDashboard()

    const sourceCard = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    const duplicateButton = within(sourceCard).getByRole('button', { name: 'Duplicate' })
    await user.click(duplicateButton)
    expect(duplicateButton).toBeDisabled()
    expect(repositoryMocks.duplicateQuiz).toHaveBeenCalledOnce()
    expect(repositoryMocks.duplicateQuiz).toHaveBeenCalledWith('active-friday')

    finishDuplicate?.({
      ...structuredClone(activeQuizzes[0]),
      id: 'new-copy-id',
      title: 'Friday Team Quiz (Copy)',
    })
    expect(await screen.findByRole('heading', { name: 'Editing copy new-copy-id' })).toBeVisible()
  })
})
