import { describe, expect, it } from 'vitest'
import {
  assertLocalConfirmation,
  assertLocalDatabaseUrl,
  assertLocalUrl,
  isLoopbackHostname,
  localSupabaseArgs,
  parseLocalStatus,
} from './local-supabase-safety.mjs'

describe('local Supabase lab safety', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])('accepts loopback hostname %s', (hostname) => {
    expect(isLoopbackHostname(hostname)).toBe(true)
  })

  it.each([
    'https://gekkvhsnykknmklqinkb.supabase.co',
    'https://another-project.supabase.co',
    'https://katwed.co.uk',
    'http://192.168.1.20:54321',
  ])('rejects non-local target %s', (target) => {
    expect(() => assertLocalUrl(target, [54321])).toThrow(/loopback/i)
  })

  it('requires the exact local confirmation', () => {
    expect(() => assertLocalConfirmation({})).toThrow(/KATWED_LOCAL_SUPABASE=YES/)
    expect(() => assertLocalConfirmation({ KATWED_LOCAL_SUPABASE: 'yes' })).toThrow()
    expect(() => assertLocalConfirmation({ KATWED_LOCAL_SUPABASE: 'YES' })).not.toThrow()
  })

  it('accepts only the fixed local API and database ports', () => {
    expect(assertLocalUrl('http://127.0.0.1:54321', [54321]).port).toBe('54321')
    expect(assertLocalDatabaseUrl('postgresql://postgres:postgres@localhost:54322/postgres').port).toBe('54322')
    expect(() => assertLocalUrl('http://127.0.0.1:54322', [54321])).toThrow(/54321/)
    expect(() => assertLocalDatabaseUrl('https://127.0.0.1:54322')).toThrow(/postgres/i)
  })

  it('validates CLI status before exposing local credentials', () => {
    const status = parseLocalStatus(JSON.stringify({
      API_URL: 'http://127.0.0.1:54321',
      DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ANON_KEY: 'local-anon',
      SERVICE_ROLE_KEY: 'local-service',
    }))
    expect(status).toMatchObject({ apiUrl: 'http://127.0.0.1:54321', anonKey: 'local-anon' })
    expect(() => parseLocalStatus(JSON.stringify({
      API_URL: 'https://remote.supabase.co',
      DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ANON_KEY: 'anon',
      SERVICE_ROLE_KEY: 'service',
    }))).toThrow(/loopback/i)
    expect(() => parseLocalStatus(JSON.stringify({
      API_URL: 'ftp://127.0.0.1:54321',
      DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ANON_KEY: 'anon',
      SERVICE_ROLE_KEY: 'service',
    }))).toThrow(/http/i)
  })

  it('builds only explicitly local CLI operations', () => {
    expect(localSupabaseArgs('start')).toEqual(['start', '--network-id', 'katwed-local-loopback'])
    expect(localSupabaseArgs('reset')).toEqual(['db', 'reset', '--local', '--no-seed'])
    expect(localSupabaseArgs('stop')).toEqual(['stop', '--project-id', 'katwed'])
    expect(() => localSupabaseArgs('link')).toThrow(/Unknown/)
  })
})
