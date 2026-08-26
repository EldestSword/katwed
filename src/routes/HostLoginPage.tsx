import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { StatusMessage } from '../components/StatusMessage'
import { config } from '../lib/config'
import { useAuth } from '../features/auth/AuthProvider'

export function HostLoginPage() {
  const { user, signIn, demoSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from ?? '/host'

  if (user) return <Navigate to="/host" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email || !password) return setError('Enter both your email address and password.')
    setSubmitting(true)
    setError('')
    try {
      await signIn(email, password)
      await navigate(destination, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.')
    } finally {
      setSubmitting(false)
    }
  }

  function enterDemo() {
    demoSignIn()
    void navigate(destination, { replace: true })
  }

  return (
    <main className="form-page">
      <div className="form-card">
        <p className="eyebrow">Katwed backstage</p>
        <h1>Host your quiz</h1>
        <p>Sign in to create, prepare and run your games.</p>
        {!config.supabaseConfigured && !config.demoMode && (
          <StatusMessage tone="error">
            Supabase is not configured. Add the two Supabase environment variables, or explicitly enable demo mode during local development.
          </StatusMessage>
        )}
        <form onSubmit={(event) => void submit(event)} noValidate>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" value={email} aria-invalid={Boolean(error)} aria-describedby={error ? 'host-login-error' : undefined} onChange={(event) => { setEmail(event.target.value); setError('') }} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} aria-invalid={Boolean(error)} aria-describedby={error ? 'host-login-error' : undefined} onChange={(event) => { setPassword(event.target.value); setError('') }} />
          {error && <StatusMessage id="host-login-error" tone="error">{error}</StatusMessage>}
          <button className="button button--primary button--wide" type="submit" aria-busy={submitting} disabled={submitting || !config.supabaseConfigured}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {config.demoMode && (
          <div className="demo-login">
            <span>Development only</span>
            <button className="button button--secondary button--wide" type="button" onClick={enterDemo}>Enter demo host area</button>
          </div>
        )}
      </div>
    </main>
  )
}
