import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  callback: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined,
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  hostRequest: vi.fn(),
}))

vi.mock('../../lib/config', () => ({
  config: { demoMode: false },
}))

vi.mock('../../lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        authMocks.callback = callback
        return { data: { subscription: { unsubscribe: authMocks.unsubscribe } } }
      },
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

import { AuthProvider } from './AuthProvider'
import { RequireHost } from './RequireHost'

const session = {
  access_token: 'fresh-access-token', refresh_token: 'refresh-token', expires_in: 3600,
  token_type: 'bearer', user: { id: 'host-id', email: 'host@example.com' },
} as Session

function HostProbe() {
  useEffect(() => { authMocks.hostRequest() }, [])
  return <h1>Host dashboard</h1>
}

function renderProtectedHost() {
  return render(
    <MemoryRouter initialEntries={['/host']}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireHost />}>
            <Route path="/host" element={<HostProbe />} />
          </Route>
          <Route path="/host/login" element={<h1>Host login</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider startup readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.callback = undefined
  })

  it('keeps protected routes and host requests waiting for the restored initial session', async () => {
    renderProtectedHost()

    expect(screen.getByText('Checking host access…')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Host dashboard' })).not.toBeInTheDocument()
    expect(authMocks.hostRequest).not.toHaveBeenCalled()

    await act(async () => authMocks.callback?.('INITIAL_SESSION', session))

    expect(screen.getByRole('heading', { name: 'Host dashboard' })).toBeVisible()
    expect(authMocks.hostRequest).toHaveBeenCalledOnce()
    expect(authMocks.getSession).not.toHaveBeenCalled()
  })

  it('does not release loading for a non-initial event and still uses the restored token', async () => {
    renderProtectedHost()
    await act(async () => authMocks.callback?.('TOKEN_REFRESHED', session))
    expect(screen.getByText('Checking host access…')).toBeVisible()
    expect(authMocks.hostRequest).not.toHaveBeenCalled()

    await act(async () => authMocks.callback?.('INITIAL_SESSION', session))
    expect(screen.getByRole('heading', { name: 'Host dashboard' })).toBeVisible()
    expect(authMocks.hostRequest).toHaveBeenCalledOnce()
  })

  it('keeps genuinely unauthenticated users behind the login route', async () => {
    renderProtectedHost()
    await act(async () => authMocks.callback?.('INITIAL_SESSION', null))
    expect(screen.getByRole('heading', { name: 'Host login' })).toBeVisible()
    expect(authMocks.hostRequest).not.toHaveBeenCalled()
  })
})
