import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthProvider'
import { QUIZ_SORT_STORAGE_KEY } from '../features/quiz-library/library'
import { sampleQuiz } from '../lib/demo/sampleData'
import type { Quiz } from '../types/domain'
import { HostDashboardPage } from './HostDashboardPage'
import { exportQuizToPortable } from '../features/quiz-transfer/katwedQuizFormat'
import { AppShell } from '../components/AppShell'

const repositoryMocks = vi.hoisted(() => ({
  listQuizzes: vi.fn(),
  listArchivedQuizzes: vi.fn(),
  getActiveSessionForQuiz: vi.fn(),
  getQuiz: vi.fn(),
  saveQuiz: vi.fn(),
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
  const source = structuredClone(sampleQuiz)
  return {
    ...source,
    id,
    rounds: source.rounds.map(round => ({ ...round, quizId: id })),
    questions: source.questions.map(question => ({ ...question, quizId: id })),
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

function SetupDestination() {
  return <h1>Setting up {useParams().quizId}</h1>
}

function ControllerDestination() {
  return <h1>Controlling {useParams().sessionId}</h1>
}

function renderDashboard() {
  localStorage.setItem('katwed.demo.host', 'true')
  return render(
    <MemoryRouter initialEntries={['/host']}>
      <AuthProvider>
        <Routes>
          <Route path="/host" element={<AppShell><HostDashboardPage /></AppShell>} />
          <Route path="/host/quizzes/:quizId/edit" element={<CopyEditorDestination />} />
          <Route path="/host/quizzes/:quizId/setup" element={<SetupDestination />} />
          <Route path="/host/game/:sessionId/control" element={<ControllerDestination />} />
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
    repositoryMocks.getQuiz.mockImplementation(async (id: string) => (
      [...activeQuizzes, ...archivedQuizzes].find((candidate) => candidate.id === id) ?? null
    ))
  })

  afterEach(() => vi.restoreAllMocks())

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

    expect(await screen.findByRole('heading', { name: 'Your quiz library is ready' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 0' }))
    expect(screen.getByRole('heading', { name: 'No archived quizzes' })).toBeVisible()
  })

  it('still surfaces a genuine repository failure after authentication is ready', async () => {
    repositoryMocks.listQuizzes.mockRejectedValue(new Error('Database unavailable'))
    renderDashboard()

    expect(await screen.findByText('Database unavailable')).toBeVisible()
    expect(screen.getByText('Database unavailable').closest('[role="alert"]')).not.toBeNull()
  })

  it('preserves the different Active and Archived card actions', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const activeCard = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    expect(within(activeCard).getByRole('button', { name: 'Launch game' })).toBeVisible()
    expect(within(activeCard).getByRole('link', { name: 'Edit' })).toBeVisible()
    await user.click(within(activeCard).getByLabelText('More actions for Friday Team Quiz'))
    expect(within(activeCard).getByRole('button', { name: 'Duplicate' })).toBeVisible()
    expect(within(activeCard).getByRole('button', { name: 'Export' })).toBeVisible()
    expect(within(activeCard).getByRole('button', { name: 'Archive' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 2' }))
    const archivedCard = screen.getByRole('article', { name: 'Friday Archive' })
    expect(within(archivedCard).getByRole('button', { name: 'Restore' })).toBeVisible()
    expect(within(archivedCard).getByRole('button', { name: 'Export' })).toBeVisible()
    expect(within(archivedCard).getByRole('button', { name: 'Permanently delete' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument()
  })

  it('opens Game Setup without launching, while an active room resumes its controller', async () => {
    const user = userEvent.setup()
    const firstRender = renderDashboard()
    const card = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    await user.click(within(card).getByRole('button', { name: 'Launch game' }))
    expect(await screen.findByRole('heading', { name: 'Setting up active-friday' })).toBeVisible()
    firstRender.unmount()

    repositoryMocks.getActiveSessionForQuiz.mockImplementation(async (quizId: string) => (
      quizId === 'active-friday' ? { id: 'existing-session' } : null
    ))
    renderDashboard()
    const resumedCard = await screen.findByRole('article', { name: 'Friday Team Quiz' })
    await user.click(within(resumedCard).getByRole('button', { name: 'Resume game' }))
    expect(await screen.findByRole('heading', { name: 'Controlling existing-session' })).toBeVisible()
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
    await user.click(within(activeCard).getByLabelText('More actions for Friday Team Quiz'))
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
    await user.click(within(sourceCard).getByLabelText('More actions for Friday Team Quiz'))
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

  it('shows a spoiler-safe Head-to-Head import preview and creates a new Active quiz without navigating', async () => {
    const user = userEvent.setup()
    const portable = exportQuizToPortable({
      ...structuredClone(activeQuizzes[0]),
      title: 'Blind Ross vs Jess',
      quizType: 'head-to-head',
      headToHeadCompetitors: [
        { id: 'ross-id', quizId: 'active-friday', displayName: 'Ross', displayOrder: 0 },
        { id: 'jess-id', quizId: 'active-friday', displayName: 'Jess', displayOrder: 1 },
      ],
      questions: activeQuizzes[0].questions.map((question, index) => ({
        ...structuredClone(question),
        assignedCompetitorId: index % 2 === 0 ? 'ross-id' : 'jess-id',
        prompt: index === 0 ? 'SECRET QUESTION' : question.prompt,
        revealCaption: index === 0 ? 'SECRET REVEAL' : question.revealCaption,
      })),
    })
    if (portable.quiz.questions[0].type !== 'mashup') throw new Error('Fixture changed')
    portable.quiz.roster[0].displayName = 'Public metadata person'
    const imported = {
      ...structuredClone(activeQuizzes[0]),
      id: 'imported-id',
      title: portable.quiz.title,
      quizType: 'head-to-head' as const,
    }
    repositoryMocks.listQuizzes.mockResolvedValueOnce(activeQuizzes).mockResolvedValue([...activeQuizzes, imported])
    repositoryMocks.saveQuiz.mockResolvedValue(imported)
    renderDashboard()

    await user.upload(
      await screen.findByLabelText('Choose Katwed quiz file'),
      new File([JSON.stringify(portable)], 'blind.katwed.json', { type: 'application/json' }),
    )

    const preview = await screen.findByRole('region', { name: 'Quiz import preview' })
    expect(within(preview).getByRole('heading', { name: 'Blind Ross vs Jess' })).toBeVisible()
    expect(within(preview).getByText('Head to Head')).toBeVisible()
    expect(within(preview).getByText('Ross vs Jess')).toBeVisible()
    expect(within(preview).getByText('3')).toBeVisible()
    expect(screen.queryByText('SECRET QUESTION')).not.toBeInTheDocument()
    expect(screen.queryByText('SECRET REVEAL')).not.toBeInTheDocument()
    expect(screen.queryByText('Public metadata person')).not.toBeInTheDocument()

    await user.click(within(preview).getByRole('button', { name: 'Import' }))
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledOnce()
    expect(repositoryMocks.saveQuiz.mock.calls[0][0]).not.toHaveProperty('id')
    expect(await screen.findByText('Imported Blind Ross vs Jess: 3 questions.')).toBeVisible()
    expect(screen.getByRole('article', { name: 'Blind Ross vs Jess' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Quizzes' })).toBeVisible()
    expect(screen.queryByText(/Editing copy/)).not.toBeInTheDocument()
  })

  it('allows cancellation, same-file reselection and retry after a repository import failure', async () => {
    const user = userEvent.setup()
    const file = new File(
      [JSON.stringify(exportQuizToPortable(activeQuizzes[0]))],
      'friday.katwed.json',
      { type: 'application/json' },
    )
    repositoryMocks.saveQuiz.mockRejectedValueOnce(new Error('Temporary save failure'))
    renderDashboard()
    const input = await screen.findByLabelText('Choose Katwed quiz file')

    await user.upload(input, file)
    await user.click(within(screen.getByRole('region', { name: 'Quiz import preview' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Quiz import preview' })).not.toBeInTheDocument()

    await user.upload(input, file)
    const preview = await screen.findByRole('region', { name: 'Quiz import preview' })
    await user.click(within(preview).getByRole('button', { name: 'Import' }))
    expect(await screen.findByText('Temporary save failure')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Quiz import preview' })).toBeVisible()
    expect(within(preview).getByRole('button', { name: 'Import' })).toBeEnabled()
  })

  it('rejects malformed files without showing an import preview', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await user.upload(
      await screen.findByLabelText('Choose Katwed quiz file'),
      new File(['{'], 'broken.katwed.json', { type: 'application/json' }),
    )
    expect(await screen.findByText('The selected file is not valid JSON.')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Quiz import preview' })).not.toBeInTheDocument()
  })

  it('exports both Active and Archived quizzes with safe filenames and an answer warning', async () => {
    const user = userEvent.setup()
    const downloads: string[] = []
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:quiz-export') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      downloads.push(this.download)
    })
    renderDashboard()

    expect(await screen.findByRole('note')).toHaveTextContent('Export files contain the quiz’s correct answers')
    const activeCard = screen.getByRole('article', { name: 'Friday Team Quiz' })
    await user.click(within(activeCard).getByLabelText('More actions for Friday Team Quiz'))
    await user.click(within(activeCard).getByRole('button', { name: 'Export' }))
    expect(repositoryMocks.getQuiz).toHaveBeenCalledWith('active-friday')
    expect(downloads).toEqual(['friday-team-quiz.katwed.json'])
    expect(screen.getByText('Exported Friday Team Quiz. The file contains the quiz’s correct answers.')).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Archived quizzes 2' }))
    await user.click(within(screen.getByRole('article', { name: 'Friday Archive' })).getByRole('button', { name: 'Export' }))
    expect(repositoryMocks.getQuiz).toHaveBeenCalledWith('archived-friday')
    expect(downloads).toEqual(['friday-team-quiz.katwed.json', 'friday-archive.katwed.json'])
  })
})
