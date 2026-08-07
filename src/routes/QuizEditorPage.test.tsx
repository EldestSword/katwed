import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleQuiz } from '../lib/demo/sampleData'
import type * as QuestionImagesModule from '../services/questionImages'
import type { QuizSaveInput } from '../services/gameRepository'
import type { Quiz } from '../types/domain'
import { QuizEditorPage } from './QuizEditorPage'

const repositoryMocks = vi.hoisted(() => ({
  getQuiz: vi.fn(),
  saveQuiz: vi.fn(),
}))

const imageMocks = vi.hoisted(() => ({
  uploadQuizCover: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: repositoryMocks }))
vi.mock('../services/questionImages', async (importOriginal) => ({
  ...await importOriginal<typeof QuestionImagesModule>(),
  uploadQuizCover: imageMocks.uploadQuizCover,
}))

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    ...structuredClone(sampleQuiz),
    id: 'quiz-cover-test',
    title: 'Cover test quiz',
    coverImagePath: null,
    ...overrides,
  }
}

function renderEditor() {
  const router = createMemoryRouter([
    { path: '/host/quizzes/:quizId/edit', element: <QuizEditorPage /> },
    { path: '/host', element: <h1>Dashboard</h1> },
  ], { initialEntries: ['/host/quizzes/quiz-cover-test/edit'] })

  return render(<RouterProvider router={router} />)
}

describe('QuizEditorPage quiz appearance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repositoryMocks.getQuiz.mockResolvedValue(quiz())
    repositoryMocks.saveQuiz.mockImplementation(async (input: QuizSaveInput): Promise<Quiz> => ({
      ...quiz(),
      ...input,
      createdAt: sampleQuiz.createdAt,
      updatedAt: '2026-08-07T15:00:00.000Z',
      archivedAt: null,
    }))
    imageMocks.uploadQuizCover.mockResolvedValue('https://media.example/new-cover.webp')
  })

  it('shows cover controls even when the quiz has no questions', async () => {
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ questions: [] }))
    renderEditor()

    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    expect(within(section).getByText('No cover selected')).toBeVisible()
    expect(within(section).getByLabelText('Choose cover')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('shows all six themes and marks the persisted theme without relying on colour alone', async () => {
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ themeId: 'paper', questions: [] }))
    renderEditor()

    const themes = await screen.findByRole('group', { name: 'Quiz theme' })
    expect(within(themes).getAllByRole('button')).toHaveLength(6)
    expect(within(themes).getByRole('button', { name: /Paper/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(themes).getByText('Selected')).toBeVisible()
  })

  it('updates the preview immediately and saves a newly selected theme', async () => {
    const user = userEvent.setup()
    renderEditor()

    const themes = await screen.findByRole('group', { name: 'Quiz theme' })
    expect(within(themes).getByRole('button', { name: /Katwed!/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(themes).getByRole('button', { name: /Midnight/ }))

    expect(within(themes).getByRole('button', { name: /Midnight/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Midnight theme preview')).toHaveAttribute('data-quiz-theme', 'midnight')
    expect(screen.getByText('Unsaved changes')).toBeVisible()

    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({ themeId: 'midnight' }))
    expect(await screen.findByText('Quiz saved.')).toBeVisible()
  })

  it('shows Theme default plus exactly three accessible image backgrounds for the selected theme', async () => {
    repositoryMocks.getQuiz.mockResolvedValue(quiz({
      themeId: 'paper',
      backgroundId: 'paper-collage',
      questions: [],
    }))
    renderEditor()

    const picker = await screen.findByRole('group', { name: 'Quiz background' })
    expect(within(picker).getAllByRole('button')).toHaveLength(4)
    expect(within(picker).getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(picker).getByRole('button', { name: /Collage/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(picker).getByRole('button', { name: /Geometry/ })).toBeVisible()
    expect(within(picker).getByRole('button', { name: /Notebook/ })).toBeVisible()
    expect(within(picker).queryByRole('button', { name: /Grid/ })).not.toBeInTheDocument()
    expect([...picker.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([
      '/backgrounds/paper-collage.webp',
      '/backgrounds/paper-geometry.webp',
      '/backgrounds/paper-notebook.webp',
    ])
  })

  it('updates the audience preview and save payload when a background or Theme default is selected', async () => {
    const user = userEvent.setup()
    renderEditor()

    const picker = await screen.findByRole('group', { name: 'Quiz background' })
    await user.click(within(picker).getByRole('button', { name: /Confetti/ }))
    const preview = screen.getByLabelText('Katwed! theme preview')
    expect(preview).toHaveAttribute('data-quiz-background', 'katwed-confetti')
    expect(preview.getAttribute('style')).toContain('/backgrounds/katwed-confetti.webp')

    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({
      themeId: 'katwed',
      backgroundId: 'katwed-confetti',
    }))

    await user.click(within(picker).getByRole('button', { name: /Theme default/ }))
    expect(within(picker).getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
    expect(preview).not.toHaveAttribute('data-quiz-background')
    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenLastCalledWith(expect.objectContaining({ backgroundId: null }))
  })

  it('preserves a compatible background but clears it without restoration after an incompatible theme change', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ themeId: 'arcade', backgroundId: 'arcade-grid' }))
    renderEditor()

    const themes = await screen.findByRole('group', { name: 'Quiz theme' })
    let picker = screen.getByRole('group', { name: 'Quiz background' })
    expect(within(picker).getByRole('button', { name: /Grid/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(themes).getByRole('button', { name: /Arcade/ }))
    expect(within(picker).getByRole('button', { name: /Grid/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(themes).getByRole('button', { name: /Paper/ }))
    picker = screen.getByRole('group', { name: 'Quiz background' })
    expect(within(picker).getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(picker).queryByRole('button', { name: /Grid/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Paper theme preview')).not.toHaveAttribute('data-quiz-background')

    await user.click(within(themes).getByRole('button', { name: /Arcade/ }))
    picker = screen.getByRole('group', { name: 'Quiz background' })
    expect(within(picker).getByRole('button', { name: /Theme default/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(picker).getByRole('button', { name: /Grid/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('uploads, previews and persists a cover only through Save quiz', async () => {
    const user = userEvent.setup()
    renderEditor()

    const file = new File(['cover'], 'cover.png', { type: 'image/png' })
    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    await user.upload(within(section).getByLabelText('Choose cover'), file)

    expect(imageMocks.uploadQuizCover).toHaveBeenCalledWith(file)
    expect(section.querySelector('img')).toHaveAttribute('src', 'https://media.example/new-cover.webp')
    expect(screen.getByText('Unsaved changes')).toBeVisible()
    expect(repositoryMocks.saveQuiz).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])

    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({
      id: 'quiz-cover-test',
      coverImagePath: 'https://media.example/new-cover.webp',
    }))
    expect(await screen.findByText('Quiz saved.')).toBeVisible()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('replaces an existing cover and leaves it unchanged when an upload fails', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ coverImagePath: 'https://media.example/original-cover.webp' }))
    imageMocks.uploadQuizCover.mockRejectedValueOnce(new Error('The image format is not supported.'))
    renderEditor()

    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    expect(section.querySelector('img')).toHaveAttribute('src', 'https://media.example/original-cover.webp')
    await user.upload(within(section).getByLabelText('Replace cover'), new File(['bad'], 'cover.png', { type: 'image/png' }))

    expect(await screen.findByText('The image format is not supported.')).toBeVisible()
    expect(section.querySelector('img')).toHaveAttribute('src', 'https://media.example/original-cover.webp')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(repositoryMocks.saveQuiz).not.toHaveBeenCalled()
  })

  it('previews a successful replacement as the next saved cover', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ coverImagePath: 'https://media.example/original-cover.webp' }))
    imageMocks.uploadQuizCover.mockResolvedValueOnce('https://media.example/replacement-cover.webp')
    renderEditor()

    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    await user.upload(
      within(section).getByLabelText('Replace cover'),
      new File(['replacement'], 'replacement.webp', { type: 'image/webp' }),
    )

    expect(section.querySelector('img')).toHaveAttribute('src', 'https://media.example/replacement-cover.webp')
    expect(screen.getByText('Unsaved changes')).toBeVisible()
    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({
      coverImagePath: 'https://media.example/replacement-cover.webp',
    }))
  })

  it('removes a cover locally and persists null without deleting Storage objects', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ coverImagePath: 'https://media.example/original-cover.webp' }))
    renderEditor()

    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    await user.click(within(section).getByRole('button', { name: 'Remove cover' }))
    expect(within(section).getByText('No cover selected')).toBeVisible()
    expect(within(section).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeVisible()

    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({ coverImagePath: null }))
    expect(imageMocks.uploadQuizCover).not.toHaveBeenCalled()
  })
})
