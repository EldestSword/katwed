import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/202608270010_bound_host_response_serialisation.sql'),
  'utf8',
)

describe('bounded host response serialisation migration', () => {
  it('always returns payload-free current-question response status to the authenticated owner', () => {
    expect(migration).toMatch(/'hostResponses', coalesce/i)
    expect(migration).toMatch(/'playerId', a\.player_id/i)
    expect(migration).toMatch(/'submittedAt', a\.submitted_at/i)
    expect(migration).toMatch(/where a\.game_session_id = s\.id and a\.question_id = s\.current_question_id/i)
    expect(migration).toMatch(/where s\.id = p_session_id and q\.owner_id = auth\.uid\(\)/i)
  })

  it('includes raw current-question answers only when detail is enabled for at most 15 players', () => {
    expect(migration).toMatch(/'answers', case[\s\S]*when s\.show_player_answers_to_host/i)
    expect(migration).toMatch(/select count\(\*\) from public\.players p where p\.game_session_id = s\.id[\s\S]*<= 15/i)
    expect(migration).toMatch(/'payload', a\.answer_payload/i)
    expect(migration.match(/where a\.game_session_id = s\.id and a\.question_id = s\.current_question_id/gi))
      .toHaveLength(2)
    expect(migration).toMatch(/else '\[\]'::jsonb/i)
  })

  it('keeps the host serializer private to authenticated hosts', () => {
    expect(migration).toMatch(/security definer set search_path = public/i)
    expect(migration).toMatch(/revoke all on function public\.session_to_json\(uuid\) from public, anon/i)
    expect(migration).toMatch(/grant execute on function public\.session_to_json\(uuid\) to authenticated/i)
  })
})
