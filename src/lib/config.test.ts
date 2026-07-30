import { describe, expect, it } from 'vitest'
import { resolveConfig } from './config'

describe('environment configuration', () => {
  it('never enables demo mode in a production build', () => {
    expect(resolveConfig({ VITE_DEMO_MODE: 'true' }, 'production').demoMode).toBe(false)
  })

  it('requires demo mode to be explicitly true outside production', () => {
    expect(resolveConfig({}, 'development').demoMode).toBe(false)
    expect(resolveConfig({ VITE_DEMO_MODE: 'TRUE' }, 'development').demoMode).toBe(false)
    expect(resolveConfig({ VITE_DEMO_MODE: 'true' }, 'development').demoMode).toBe(true)
  })

  it('requires both public Supabase values', () => {
    expect(resolveConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }, 'production').supabaseConfigured)
      .toBe(false)
    expect(resolveConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    }, 'production').supabaseConfigured).toBe(true)
  })
})
