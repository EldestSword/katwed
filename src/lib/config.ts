export interface AppConfig {
  demoMode: boolean
  supabaseConfigured: boolean
  supabaseUrl: string
  supabaseAnonKey: string
  buildMode: string
}

const buildMode = typeof __KATWED_BUILD_MODE__ === 'string' ? __KATWED_BUILD_MODE__ : 'test'
const requestedDemo = import.meta.env.VITE_DEMO_MODE === 'true'

export const config: AppConfig = {
  demoMode: requestedDemo && buildMode !== 'production',
  supabaseConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  buildMode,
}
