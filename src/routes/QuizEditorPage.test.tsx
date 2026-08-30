import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz, sampleQuiz } from '../lib/demo/sampleData'
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

function headToHeadQuiz(source: Quiz = quiz()): Quiz {
  const competitors = [
    { id: 'competitor-a', quizId: source.id, displayName: 'Ross', displayOrder: 0 as const },
    { id: 'competitor-b', quizId: source.id, displayName: 'Jess', displayOrder: 1 as const },
  ]
  return {
    ...structuredClone(source),
    quizType: 'head-to-head',
    headToHeadCompetitors: competitors,
    questions: source.questions.map((question, index) => ({
      ...structuredClone(question),
      assignedCompetitorId: competitors[index % 2].id,
    })),
  }
}

function renderEditor() {
  const router = createMemoryRouter([
    { path: '/host/quizzes/:quizId/edit', element: <QuizEditorPage /> },
    { path: '/host', element: <h1>Dashboard</h1> },
  ], { initialEntries: ['/host/quizzes/quiz-cover-test/edit'] })

  return render(<RouterProvider router={router} />)
}

async function openQuizSettings(user = userEvent.setup(), section: 'Game' | 'Appearance' | 'Answer colours' | 'Audio' = 'Appearance') {
  await user.click(await screen.findByRole('button', { name: 'Quiz settings' }))
  const dialog = await screen.findByRole('dialog', { name: 'Quiz settings' })
  await user.click(within(dialog).getByRole('button', { name: new RegExp(`^${section}`) }))
  return dialog
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

  it('opens accessible quiz-wide settings while keeping the question sidebar focused', async () => {
    const user = userEvent.setup()
    renderEditor()
    await screen.findByRole('heading', { name: 'Question settings' })
    const sidebar = document.querySelector('.question-settings') as HTMLElement
    expect(within(sidebar).queryByText('Quiz type')).not.toBeInTheDocument()
    expect(within(sidebar).queryByText('Quiz theme')).not.toBeInTheDocument()
    expect(within(sidebar).getByText('Question')).toBeVisible()
    expect(within(sidebar).getByText('Answers')).toBeVisible()
    expect(within(sidebar).getByText('Scoring')).toBeVisible()
    expect(within(sidebar).getByText('Media & presentation')).toBeVisible()

    const dialog = await openQuizSettings(user)
    expect(within(dialog).getByRole('group', { name: 'Quiz theme' })).toBeVisible()
    expect(within(dialog).getByRole('group', { name: 'Quiz background' })).toBeVisible()
    expect(within(dialog).getByRole('region', { name: 'Quiz cover' })).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: /^Game/ }))
    expect(within(dialog).getByRole('group', { name: 'Quiz type' })).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: /^Answer colours/ }))
    expect(within(dialog).getByRole('group', { name: 'Answer palette' })).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: /^Audio/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('group', { name: 'Sound pack' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Quiz settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quiz settings' })).toHaveFocus()
  })

  it('keeps the compatibility sound pack value without exposing it as an editor setting', async () => {
    const user = userEvent.setup()
    renderEditor()
    const dialog = await openQuizSettings(user)
    expect(within(dialog).queryByRole('group', { name: 'Sound pack' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await user.type(screen.getByLabelText('Quiz title'), ' updated')
    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({ soundPackId: 'katwed' }))
  })

  it('previews and saves a quiz-wide custom answer palette through the dirty workflow', async () => {
    const user = userEvent.setup()
    renderEditor()
    const dialog = await openQuizSettings(user, 'Answer colours')
    await user.click(within(dialog).getByRole('button', { name: /Custom/ }))
    const firstHex = within(dialog).getByLabelText('Colour 1 hex')
    await user.clear(firstHex)
    await user.type(firstHex, '#FFFFFF')
    expect(screen.getByText('Unsaved changes')).toBeVisible()
    expect(within(dialog).getByLabelText('Answer palette preview').firstElementChild).toHaveStyle({
      backgroundColor: '#FFFFFF',
      color: '#111827',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({
      answerPaletteId: 'custom',
      customAnswerColours: expect.arrayContaining(['#FFFFFF']),
    }))
  })

  it('shows cover controls even when the quiz has no questions', async () => {
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ questions: [] }))
    renderEditor()
    await openQuizSettings()

    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    expect(within(section).getByText('No cover selected')).toBeVisible()
    expect(within(section).getByLabelText('Choose cover')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('shows all 21 themes and marks the persisted theme without relying on colour alone', async () => {
    repositoryMocks.getQuiz.mockResolvedValue(quiz({ themeId: 'paper', questions: [] }))
    renderEditor()
    await openQuizSettings()

    const themes = await screen.findByRole('group', { name: 'Quiz theme' })
    expect(themes.querySelectorAll('.quiz-theme-option')).toHaveLength(21)
    expect(within(themes).getByRole('button', { name: /Paper/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(themes).getByText('Selected')).toBeVisible()
  })

  it('updates the preview immediately and saves a newly selected theme', async () => {
    const user = userEvent.setup()
    renderEditor()
    await openQuizSettings(user)

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

  it('keeps question media contained and identifies the selected preview audience', async () => {
    const user = userEvent.setup()
    renderEditor()

    const preview = await screen.findByLabelText('Katwed! theme preview')
    expect(preview).toHaveAttribute('data-preview-audience', 'presentation')
    expect(preview.querySelector('.editor-preview__media .question-media img')).toHaveAttribute('src', '/demo/portrait-1.svg')
    expect(within(preview).getByText('Players select two people on their device')).toBeVisible()
    expect(preview.querySelector('.editor-answer-preview')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Player' }))
    expect(preview).toHaveAttribute('data-preview-audience', 'player')
    expect(preview.closest('.preview-frame')).toHaveClass('preview-frame--player')
  })

  it('marks a four-choice Player preview for the narrow two-by-two layout', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue({ ...structuredClone(mixedDemoQuiz), id: 'quiz-cover-test' })
    renderEditor()
    await screen.findByLabelText('Katwed! theme preview')
    await user.click(screen.getByRole('tab', { name: 'Player' }))

    expect(screen.getByLabelText('Answer colour preview')).toHaveAttribute('data-option-count', '4')
  })

  it('shows Theme default plus exactly three accessible image backgrounds for the selected theme', async () => {
    repositoryMocks.getQuiz.mockResolvedValue(quiz({
      themeId: 'paper',
      backgroundId: 'paper-collage',
      questions: [],
    }))
    renderEditor()
    await openQuizSettings()

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

  it('renders only the three production backgrounds owned by a newly imported theme', async () => {
    const user = userEvent.setup()
    renderEditor()
    await openQuizSettings(user)

    const themes = await screen.findByRole('group', { name: 'Quiz theme' })
    await user.click(within(themes).getByRole('button', { name: /Hard Rock/ }))
    const picker = screen.getByRole('group', { name: 'Quiz background' })
    expect(within(picker).getAllByRole('button')).toHaveLength(4)
    expect([...picker.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([
      '/backgrounds/hard-rock-stage-lights.webp',
      '/backgrounds/hard-rock-amps.webp',
      '/backgrounds/hard-rock-electric-storm.webp',
    ])
    expect(screen.getByLabelText('Hard Rock theme preview')).toHaveAttribute('data-quiz-theme', 'hard-rock')
  })

  it('updates the audience preview and save payload when a background or Theme default is selected', async () => {
    const user = userEvent.setup()
    renderEditor()
    await openQuizSettings(user)

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
    await openQuizSettings(user)

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
    await openQuizSettings(user)

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
    await openQuizSettings(user)

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
    await openQuizSettings(user)

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
    await openQuizSettings(user)

    const section = await screen.findByRole('region', { name: 'Quiz cover' })
    await user.click(within(section).getByRole('button', { name: 'Remove cover' }))
    expect(within(section).getByText('No cover selected')).toBeVisible()
    expect(within(section).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeVisible()

    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])
    expect(repositoryMocks.saveQuiz).toHaveBeenCalledWith(expect.objectContaining({ coverImagePath: null }))
    expect(imageMocks.uploadQuizCover).not.toHaveBeenCalled()
  })

  it('defaults to Standard and creates two stable blank competitors when Head to Head is chosen', async () => {
    const user = userEvent.setup()
    renderEditor()
    await openQuizSettings(user, 'Game')

    const picker = await screen.findByRole('group', { name: 'Quiz type' })
    expect(within(picker).getByRole('button', { name: /Standard/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(picker).getByRole('button', { name: /Head to Head/ }))

    const setup = screen.getByRole('region', { name: 'Head-to-Head competitors' })
    const firstName = within(setup).getByLabelText('Competitor 1')
    const secondName = within(setup).getByLabelText('Competitor 2')
    expect(firstName).toHaveValue('')
    expect(secondName).toHaveValue('')
    expect(screen.getByRole('group', { name: 'Question for' })).toBeVisible()
    expect(screen.getAllByText(/Unassigned/).length).toBeGreaterThan(0)

    await user.type(firstName, 'Ross')
    await user.type(secondName, 'Jess')
    expect(screen.getByRole('button', { name: 'Ross' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Jess' })).toBeVisible()
  })

  it('confirms before clearing configured Head-to-Head data on a switch to Standard', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue(headToHeadQuiz())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderEditor()
    await openQuizSettings(user, 'Game')

    const picker = await screen.findByRole('group', { name: 'Quiz type' })
    await user.click(within(picker).getByRole('button', { name: /Standard/ }))
    expect(confirm).toHaveBeenCalledWith('Switch to Standard and clear both competitors and every question assignment?')
    expect(screen.getByRole('region', { name: 'Head-to-Head competitors' })).toBeVisible()

    await user.click(within(picker).getByRole('button', { name: /Standard/ }))
    expect(screen.queryByRole('region', { name: 'Head-to-Head competitors' })).not.toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: /Standard/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByText('Scoring'))
    expect(screen.getByLabelText('Maximum points')).toBeVisible()
  })

  it('shows minimal Standard scoring controls and defaults a newly authored question to speed scoring', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(await screen.findByText('Scoring'))
    expect(await screen.findByLabelText('Maximum points')).toBeVisible()
    expect(screen.getByLabelText('Faster answers score more')).not.toBeChecked()
    expect(screen.getByLabelText('Double score')).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '+ Add' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add question' })).getByRole('button', { name: /True or false/ }))
    expect(screen.getByLabelText('Faster answers score more')).toBeChecked()
    expect(screen.getByLabelText('Double score')).not.toBeChecked()
    await user.click(screen.getByLabelText('Double score'))
    expect(screen.getByText('Worth up to 2,000 points.')).toBeVisible()
  })

  it('defaults a newly selected tile reveal to 8 by 8 and offers every supported grid', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(await screen.findByText('Media & presentation'))
    const mediaSettings = screen.getByRole('group', { name: 'Media' })
    await user.selectOptions(within(mediaSettings).getByLabelText('Type'), 'image')
    await user.selectOptions(within(mediaSettings).getByLabelText('Reveal effect'), 'tiles')
    const grid = within(mediaSettings).getByLabelText('Tile grid')
    expect(grid).toHaveValue('8')
    expect(within(grid).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '6 x 6 - 36 tiles',
      '8 x 8 - 64 tiles',
      '12 x 12 - 144 tiles',
      '16 x 16 - 256 tiles',
    ])
  })

  it('supports assignments for all seven question formats and hides ordinary point editing', async () => {
    const user = userEvent.setup()
    const source = {
      ...structuredClone(mixedDemoQuiz),
      id: 'quiz-cover-test',
      title: 'All formats Head to Head',
    }
    repositoryMocks.getQuiz.mockResolvedValue(headToHeadQuiz(source))
    renderEditor()

    await screen.findByRole('heading', { name: 'Question settings' })
    const navigator = document.querySelector('.question-navigator')!
    const assignmentLabels = [...navigator.querySelectorAll('ol small')].map((item) => item.textContent ?? '')
    expect(assignmentLabels).toHaveLength(source.questions.length)
    assignmentLabels.forEach((label, index) => expect(label).toContain(index % 2 ? 'Jess' : 'Ross'))
    expect(new Set(source.questions.map((question) => question.type))).toEqual(new Set([
      'single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'typed-answer', 'mashup',
    ]))
    expect(screen.getByRole('group', { name: 'Question for' })).toBeVisible()
    expect(screen.queryByLabelText('Maximum points')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Faster answers score more')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Double score')).not.toBeInTheDocument()
    await user.click(screen.getByText('Scoring'))
    expect(screen.getByText('Head-to-Head uses 1 point for a correct assigned answer. Standard point values are ignored.')).toBeVisible()
  })

  it('edits and saves a primary Typed Answer with newline-separated alternatives', async () => {
    const user = userEvent.setup()
    repositoryMocks.getQuiz.mockResolvedValue({
      ...structuredClone(mixedDemoQuiz),
      id: 'quiz-cover-test',
    })
    renderEditor()

    await user.click(await screen.findByRole('button', { name: /Name the science-fiction programme featuring the spaceship Red Dwarf/ }))
    const primary = screen.getByLabelText('Primary answer')
    const alternatives = screen.getByLabelText('Also accept')
    expect(primary).toHaveValue('Red Dwarf')
    expect(alternatives).toHaveValue('The Red Dwarf')

    await user.clear(primary)
    await user.type(primary, 'Chris O\u2019Dowd')
    await user.clear(alternatives)
    await user.type(alternatives, 'Christopher O Dowd{enter}C O Dowd')
    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])

    const saved = repositoryMocks.saveQuiz.mock.calls.at(-1)?.[0] as QuizSaveInput
    const typed = saved.questions.find((question) => question.type === 'typed-answer')
    expect(typed).toMatchObject({
      correctAnswer: 'Chris O\u2019Dowd',
      acceptedAnswers: ['Christopher O Dowd', 'C O Dowd'],
    })
  })

  it('preserves assignment on question duplication and alternates the next new question', async () => {
    const user = userEvent.setup()
    const source = headToHeadQuiz()
    repositoryMocks.getQuiz.mockResolvedValue(source)
    renderEditor()

    await screen.findByRole('heading', { name: 'Question settings' })
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    await user.click(screen.getByRole('button', { name: '+ Add' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Add question' })).getByRole('button', { name: /True or false/ }))
    await user.click(screen.getAllByRole('button', { name: 'Save quiz' })[0])

    const saved = repositoryMocks.saveQuiz.mock.calls.at(-1)?.[0] as QuizSaveInput
    expect(saved.questions.at(-2)?.assignedCompetitorId).toBe(source.questions[0].assignedCompetitorId)
    expect(saved.questions.at(-1)?.assignedCompetitorId).toBe('competitor-b')
    expect(saved.questions.at(-2)?.id).not.toBe(source.questions[0].id)
  })
})
