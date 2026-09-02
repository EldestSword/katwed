import { createClient } from '@supabase/supabase-js'
import { config } from '../config'
import { fetchWithJwtClockSkewRetry } from './jwtClockSkewFetch'

export const supabase = config.supabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: fetchWithJwtClockSkewRetry },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null
