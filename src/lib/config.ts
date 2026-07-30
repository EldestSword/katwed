export interface AppConfig {
  demoMode: boolean
  supabaseConfigured: boolean
  supabaseUrl: string
  supabaseAnonKey: string
  buildMode: string
}

const buildMode = typeof __KATWED_BUILD_MODE__ === 'string' ? __KATWED_BUILD_MODE__ : 'test'

export function resolveConfig(
  environment: {
    VITE_DEMO_MODE?: string
    VITE_SUPABASE_URL?: string
    VITE_SUPABASE_ANON_KEY?: string
  },
  mode: string,
): AppConfig {
  const supabaseUrl = environment.VITE_SUPABASE_URL?.trim() ?? ''
  const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  return {
    demoMode: environment.VITE_DEMO_MODE === 'true' && mode !== 'production',
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseUrl,
    supabaseAnonKey,
    buildMode: mode,
  }
}

export const config = resolveConfig(import.meta.env, buildMode)
