import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/202608270001_quiz_sound_pack.sql', 'utf8')
const definition = (name: string) => migration.slice(migration.indexOf(`create or replace function public.${name}`))

describe('quiz sound-pack migration', () => {
  it('adds constrained stale-client-compatible quiz persistence', () => {
    expect(migration).toContain("add column sound_pack_id text not null default 'katwed'")
    expect(migration).toContain("check (sound_pack_id in ('katwed', 'none'))")
    const save = definition('host_save_quiz')
    expect(save).toContain("if p_quiz ? 'soundPackId' then")
    expect(save).toContain("else sound_pack_id")
  })

  it('returns harmless configuration through owner and player-safe boundaries', () => {
    expect(definition('quiz_to_json')).toContain("'soundPackId', q.sound_pack_id")
    expect(definition('get_player_game_state')).toContain("'soundPackId', q.sound_pack_id")
    expect(migration).toContain('grant execute on function public.host_save_quiz(jsonb) to authenticated;')
    expect(migration).toContain('grant execute on function public.get_player_game_state(text) to anon, authenticated;')
  })
})
