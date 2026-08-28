import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/202608280001_multi_variant_sound_packs.sql',
  'utf8',
)

describe('multi-variant Sound Pack migration', () => {
  it('adds bounded variant state without editing deployed migration history', () => {
    expect(migration).toMatch(/add column double_score_variant_durations_ms integer\[\]/i)
    expect(migration).toMatch(/cardinality\(double_score_variant_durations_ms\) between 1 and 64/i)
    expect(migration).toMatch(/500 <= all\(double_score_variant_durations_ms\)/i)
    expect(migration).toMatch(/sound_pack_id ~ '\^\[a-z0-9\]/i)
  })

  it('persists safe registered pack IDs through the quiz constraint and save wrapper', () => {
    expect(migration).toMatch(/alter table public\.quizzes[\s\S]*drop constraint quizzes_sound_pack_id_check/i)
    expect(migration).toMatch(/create or replace function public\.host_save_quiz\(p_quiz jsonb\)/i)
    expect(migration).toMatch(/length\(v_sound_pack_id\) not between 1 and 64/i)
    expect(migration).toMatch(/v_sound_pack_id !~ '\^\[a-z0-9\]/i)
    expect(migration).toContain('v_saved := public.host_save_quiz_without_sound_pack(p_quiz)')
    expect(migration).toMatch(/when p_quiz \? 'soundPackId' then p_quiz ->> 'soundPackId'[\s\S]*else sound_pack_id/i)
  })

  it('keeps both launch overloads and validates client duration metadata', () => {
    expect(migration).toMatch(/host_launch_game\(p_quiz_id uuid, p_settings jsonb\)/i)
    expect(migration).toMatch(/host_launch_game\(p_quiz_id uuid\)/i)
    expect(migration).toContain("'doubleScoreVariantDurationsMs'")
    expect(migration).toMatch(/jsonb_typeof\(p_settings -> 'doubleScoreVariantDurationsMs'\) <> 'array'/i)
    expect(migration).not.toMatch(/assetUrl|\.mp3/i)
  })

  it('consumes the authoritative Double Score bag and uses its chosen duration', () => {
    expect(migration).toMatch(/create or replace function public\.consume_double_score_variant/i)
    expect(migration).toMatch(/current_double_score_variant_index = v_index/i)
    expect(migration).toMatch(/double_score_intro_ms = duration_ms/i)
    expect(migration).toMatch(/select variant_index, duration_ms into v_variant_index, v_prelude_ms/i)
    expect(migration).toMatch(/v_opened_at := v_now \+ \(v_prelude_ms \* interval '1 millisecond'\)/i)
  })

  it('exposes only the selected index to player-safe state and preserves bounded host answers', () => {
    expect(migration).toContain("'doubleScoreVariantIndex', v_session.current_double_score_variant_index")
    expect(migration).toMatch(/a\.question_id = s\.current_question_id/i)
    expect(migration).toMatch(/s\.show_player_answers_to_host/i)
    expect(migration).toMatch(/<= 15/i)
  })
})
