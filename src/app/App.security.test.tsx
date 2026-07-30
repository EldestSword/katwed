import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { AuthProvider } from '../features/auth/AuthProvider'

describe('route security', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('does not render host controls on player routes', () => {
    render(<MemoryRouter initialEntries={['/join']}><AuthProvider><App /></AuthProvider></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Create quiz/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Close room/i })).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated user away from host management', async () => {
    render(<MemoryRouter initialEntries={['/host']}><AuthProvider><App /></AuthProvider></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Sign in to host' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your quizzes' })).not.toBeInTheDocument()
  })
})
