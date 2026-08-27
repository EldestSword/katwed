import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { config } from '../../lib/config'
import { supabase } from '../../lib/supabase/client'

interface AuthValue {
  user: User | { id: 'demo-host'; email: 'demo@katwed.local' } | null
  loading: boolean
  signIn(email: string, password: string): Promise<void>
  demoSignIn(): void
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)
const DEMO_AUTH_KEY = 'katwed.demo.host'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthValue['user']>(
    config.demoMode && localStorage.getItem(DEMO_AUTH_KEY) === 'true'
      ? { id: 'demo-host', email: 'demo@katwed.local' }
      : null,
  )
  const [loading, setLoading] = useState(Boolean(supabase) && !config.demoMode)

  useEffect(() => {
    if (config.demoMode || !supabase) {
      setLoading(false)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error('The email or password was not accepted.')
    },
    demoSignIn() {
      if (!config.demoMode) return
      localStorage.setItem(DEMO_AUTH_KEY, 'true')
      setUser({ id: 'demo-host', email: 'demo@katwed.local' })
    },
    async signOut() {
      localStorage.removeItem(DEMO_AUTH_KEY)
      if (supabase) await supabase.auth.signOut()
      setUser(null)
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook intentionally lives beside its provider so the context stays private.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is missing.')
  return value
}
