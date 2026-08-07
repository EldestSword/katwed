import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthProvider'
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

describe('HostDashboardPage quiz duplication', () => {
  const active = structuredClone(sampleQuiz)
  const archived: Quiz = {
    ...structuredClone(sampleQuiz),
    id: 'archived-quiz',
    title: 'Archived Curious Crew',
    archivedAt: '2026-08-07T12:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    repositoryMocks.listQuizzes.mockResolvedValue([active])
    repositoryMocks.listArchivedQuizzes.mockResolvedValue([archived])
    repositoryMocks.getActiveSessionForQuiz.mockResolvedValue(null)
  })

  it('shows Duplicate only in the active library', async () => {
    renderDashboard()

    const activeCard = await screen.findByRole('article', { name: '' })
    expect(activeCard).toHaveTextContent('The Curious Crew')
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: /Archived quizzes/ }))
    expect(await screen.findByText('Archived Curious Crew')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Duplicate/ })).not.toBeInTheDocument()
  })

  it('prevents repeat clicks and navigates to the newly created quiz editor', async () => {
    let finishDuplicate: ((quiz: Quiz) => void) | undefined
    repositoryMocks.duplicateQuiz.mockReturnValue(new Promise<Quiz>((resolve) => { finishDuplicate = resolve }))
    renderDashboard()

    const duplicateButton = await screen.findByRole('button', { name: 'Duplicate' })
    await userEvent.click(duplicateButton)
    expect(duplicateButton).toBeDisabled()
    expect(repositoryMocks.duplicateQuiz).toHaveBeenCalledOnce()
    expect(repositoryMocks.duplicateQuiz).toHaveBeenCalledWith(active.id)

    finishDuplicate?.({
      ...structuredClone(active),
      id: 'new-copy-id',
      title: 'The Curious Crew (Copy)',
    })
    expect(await screen.findByRole('heading', { name: 'Editing copy new-copy-id' })).toBeVisible()
  })
})
