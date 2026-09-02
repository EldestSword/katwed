import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20260901094653_realtime_scaling_free_tier.sql'),
  'utf8',
)

describe('realtime scaling migration', () => {
  it('removes broad Player and answer fan-out while retaining session-state broadcasts', () => {
    expect(migration).toMatch(/drop trigger if exists players_broadcast_refresh on public\.players/i)
    expect(migration).toMatch(/drop trigger if exists player_answers_broadcast_refresh on public\.player_answers/i)
    expect(migration).toMatch(/create trigger game_sessions_broadcast_refresh[\s\S]*update of[\s\S]*phase[\s\S]*on public\.game_sessions/i)
    expect(migration).not.toMatch(/create trigger player_answers_broadcast_refresh/i)
    expect(migration).toMatch(/q\.quiz_type = 'head-to-head'/i)
  })

  it('adds a tightly permissioned owner-only dynamic session reader', () => {
    expect(migration).toMatch(/create or replace function public\.host_get_live_session\(p_session_id uuid\)/i)
    expect(migration).toMatch(/q\.owner_id = auth\.uid\(\)/i)
    expect(migration).toMatch(/revoke all on function public\.host_get_live_session\(uuid\) from public, anon/i)
    expect(migration).toMatch(/grant execute on function public\.host_get_live_session\(uuid\) to authenticated/i)
  })

  it('replaces exclusive locks in every retained submit implementation with shared locks', () => {
    expect(migration).toContain("p.proname in ('submit_answer', 'submit_answer_without_session_prelude')")
    expect(migration).toMatch(/regexp_replace\([\s\S]*\\mfor\[\[:space:\]\]\+update\\M[\s\S]*'for share'/i)
    expect(migration).toMatch(/if v_quiz_type = 'head-to-head' then[\s\S]*for update/i)
    expect(migration).toMatch(/perform public\.submit_answer_without_session_prelude/i)
    expect(migration).toMatch(/grant execute on function public\.submit_answer\(text, uuid, text, jsonb\) to anon, authenticated/i)
  })
})
