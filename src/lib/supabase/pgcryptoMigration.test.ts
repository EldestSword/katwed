import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve('supabase/migrations/202608060001_fix_pgcrypto_schema.sql')
const migration = readFileSync(migrationPath, 'utf8')

describe('pgcrypto repair migration', () => {
  it('replaces every token-authenticated RPC without widening its search path', () => {
    for (const functionName of ['join_room', 'reconnect_player', 'set_player_presence', 'submit_answer']) {
      expect(migration).toContain(`create or replace function public.${functionName}`)
    }

    expect(migration.match(/security definer/g)).toHaveLength(4)
    expect(migration.match(/set search_path = public/g)).toHaveLength(4)
  })

  it('resolves pgcrypto explicitly through the Supabase extensions schema', () => {
    expect(migration).toContain('extensions.gen_random_bytes(32)')
    expect(migration.match(/extensions\.digest\(/g)).toHaveLength(4)
    expect(migration).not.toMatch(/(?<![.\w])gen_random_bytes\s*\(/)
    expect(migration).not.toMatch(/(?<![.\w])digest\s*\(/)
  })
})
