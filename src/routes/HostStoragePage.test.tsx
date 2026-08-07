import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthProvider'
import type { StorageReport } from '../features/storage-manager/storageManager'
import { HostStoragePage } from './HostStoragePage'

const repositoryMocks = vi.hoisted(() => ({
  getStorageReport: vi.fn(),
  cleanupUnusedImages: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: repositoryMocks }))

const inUsePath = 'demo-image://123e4567-e89b-42d3-a456-426614174000'
const unusedPath = 'demo-image://223e4567-e89b-42d3-a456-426614174000'
const protectedPath = 'demo-image://legacy-file'

function report(overrides: Partial<StorageReport> = {}): StorageReport {
  return {
    total: { fileCount: 3, sizeBytes: 3584, unknownSizeCount: 1 },
    inUse: { fileCount: 1, sizeBytes: 2048, unknownSizeCount: 0 },
    unused: { fileCount: 1, sizeBytes: 1536, unknownSizeCount: 0 },
    protected: { fileCount: 1, sizeBytes: 0, unknownSizeCount: 1 },
    objects: [
      { path: unusedPath, publicUrl: 'https://media.example/unused.webp', sizeBytes: 1536, createdAt: '2026-08-07T12:00:00.000Z', status: 'unused' },
      { path: inUsePath, publicUrl: 'https://media.example/in-use.webp', sizeBytes: 2048, createdAt: null, status: 'in-use' },
      { path: protectedPath, publicUrl: 'https://media.example/legacy.png', sizeBytes: null, createdAt: null, status: 'protected' },
    ],
    ...overrides,
  }
}

function emptyReport(): StorageReport {
  return {
    total: { fileCount: 1, sizeBytes: 2048, unknownSizeCount: 0 },
    inUse: { fileCount: 1, sizeBytes: 2048, unknownSizeCount: 0 },
    unused: { fileCount: 0, sizeBytes: 0, unknownSizeCount: 0 },
    protected: { fileCount: 0, sizeBytes: 0, unknownSizeCount: 0 },
    objects: [{ path: inUsePath, publicUrl: inUsePath, sizeBytes: 2048, createdAt: null, status: 'in-use' }],
  }
}

function renderPage() {
  localStorage.setItem('katwed.demo.host', 'true')
  return render(
    <MemoryRouter initialEntries={['/host/storage']}>
      <AuthProvider>
        <Routes>
          <Route path="/host/storage" element={<HostStoragePage />} />
          <Route path="/host" element={<h1>Your quizzes destination</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('HostStoragePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    repositoryMocks.getStorageReport.mockResolvedValue(report())
    repositoryMocks.cleanupUnusedImages.mockResolvedValue({ removedCount: 1, preservedCount: 0, failedCount: 0 })
  })

  it('shows loading, scoped totals, protected files and unused image review details', async () => {
    let finish: ((value: StorageReport) => void) | undefined
    repositoryMocks.getStorageReport.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderPage()
    expect(screen.getByText('Checking image storage…')).toBeVisible()
    finish?.(report())

    expect(await screen.findByRole('heading', { name: 'Storage' })).toBeVisible()
    expect(screen.getByText(/They do not include other hosts/)).toBeVisible()
    const usage = screen.getByRole('region', { name: 'Storage usage' })
    expect(within(usage).getByText(/3 images/)).toHaveTextContent('3 images · 3.5 KB')
    expect(within(usage).getByRole('heading', { name: 'In use' })).toBeVisible()
    expect(within(usage).getByRole('heading', { name: 'Unused' })).toBeVisible()
    expect(within(usage).getByRole('heading', { name: 'Other / protected' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clean up 1 unused image' })).toBeVisible()
    expect(screen.getByText('Uploaded 7 Aug 2026')).toBeVisible()
    expect(screen.getByText(unusedPath)).not.toBeVisible()
    await userEvent.click(screen.getByText('File details'))
    expect(screen.getByText(unusedPath)).toBeVisible()
  })

  it('refreshes on demand and falls back when an unused thumbnail fails', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Unused image')
    const preview = document.querySelector('.storage-image-card__preview img')
    if (!(preview instanceof HTMLImageElement)) throw new Error('Decorative preview missing')
    fireEvent.error(preview)
    expect(screen.getByRole('img', { name: 'Stored image preview unavailable' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Refresh Storage' }))
    expect(repositoryMocks.getStorageReport).toHaveBeenCalledTimes(2)
  })

  it('shows the friendly no-unused state and omits protected summary when empty', async () => {
    repositoryMocks.getStorageReport.mockResolvedValue(emptyReport())
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No unused images' })).toBeVisible()
    expect(screen.getByText(/currently referenced/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Clean up/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Other / protected' })).not.toBeInTheDocument()
  })

  it('confirms, cleans, refreshes and reports a successful cleanup', async () => {
    const user = userEvent.setup()
    repositoryMocks.getStorageReport.mockResolvedValueOnce(report()).mockResolvedValueOnce(emptyReport())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clean up 1 unused image' }))

    expect(confirm).toHaveBeenCalledWith(
      'Delete 1 unused image (1.5 KB)?\n\nKatwed will re-check that these files are still unused before deleting them. This cannot be undone.',
    )
    expect(repositoryMocks.cleanupUnusedImages).toHaveBeenCalledWith([unusedPath])
    expect(await screen.findByText('1 image was removed.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No unused images' })).toBeVisible()
    expect(repositoryMocks.getStorageReport).toHaveBeenCalledTimes(2)
  })

  it('reports partial cleanup accurately', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    repositoryMocks.cleanupUnusedImages.mockResolvedValue({ removedCount: 4, preservedCount: 1, failedCount: 1 })
    repositoryMocks.getStorageReport.mockResolvedValueOnce(report()).mockResolvedValueOnce(emptyReport())
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clean up 1 unused image' }))
    expect(await screen.findByText(
      '4 images were removed. 1 image had become in use and was kept. 1 image could not be removed.',
    )).toBeVisible()
  })

  it('shows a failed authoritative check and does not refresh or claim deletion', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    repositoryMocks.cleanupUnusedImages.mockRejectedValue(
      new Error('Stored image references could not be checked. Nothing was removed.'),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clean up 1 unused image' }))
    expect(await screen.findByText('Stored image references could not be checked. Nothing was removed.')).toBeVisible()
    expect(screen.queryByText('1 image was removed.')).not.toBeInTheDocument()
    expect(repositoryMocks.getStorageReport).toHaveBeenCalledTimes(1)
  })
})
