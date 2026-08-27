import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/202608270003_game_preflight_session_settings.sql'),
  'utf8',
)
const submitAnswerRepair = readFileSync(
  resolve('supabase/migrations/202608270004_fix_wrapped_submit_answer_search_path.sql'),
  'utf8',
)
const publicSubmitAnswerRepair = readFileSync(
  resolve('supabase/migrations/202608270005_fix_public_submit_answer_search_path.sql'),
  'utf8',
)
const legacyDigestRepair = readFileSync(
  resolve('supabase/migrations/202608270006_qualify_legacy_submit_answer_digest.sql'),
  'utf8',
)
const overloadDigestRepair = readFileSync(
  resolve('supabase/migrations/202608270007_qualify_all_submit_answer_overloads.sql'),
  'utf8',
)
const readerRefresh = readFileSync(
  resolve('supabase/migrations/202608270008_refresh_session_and_quiz_readers.sql'),
  'utf8',
)

describe('game preflight session settings migration', () => {
  it('stores validated session settings and a complete server-generated order', () => {
    expect(migration).toMatch(/add column sound_pack_id text not null default 'katwed'/i)
    expect(migration).toMatch(/double_score_intro_ms between 500 and 30000/i)
    expect(migration).toMatch(/question_order uuid\[\]/i)
    expect(migration).toMatch(/cardinality\(v_question_order\).*v_question_count/is)
    expect(migration).toMatch(/setting\.key not in \('soundPackId', 'shuffleQuestionOrder', 'shuffleAnswerOptions', 'autoLockWhenAllAnswered'\)/i)
    expect(migration).toMatch(/v_answer_seed := pg_catalog\.encode\(extensions\.gen_random_bytes\(16\), 'hex'\)/i)
  })

  it('uses exactly one authoritative prelude before the full question window', () => {
    expect(migration).toMatch(/case when v_question\.double_score then v_session\.double_score_intro_ms\s+when v_session\.question_type_intros_enabled then 1750 else 0 end/i)
    expect(migration).toMatch(/question_closes_at = v_opened_at \+ make_interval\(secs => v_question\.time_limit_seconds\)/i)
    expect(migration).toMatch(/clock_timestamp\(\) < v_session\.question_opened_at/i)
    expect(migration).toMatch(/Wait for the question intro to finish/i)
  })

  it('keeps shuffled progression stable for Standard and Head-to-Head', () => {
    expect(migration).toMatch(/v_session\.question_order\[v_session\.current_question_index \+ 2\]/i)
    expect(migration).toMatch(/create or replace function public\.start_head_to_head_game/i)
    expect(migration).toMatch(/create or replace function public\.continue_head_to_head_game/i)
    expect(migration).toMatch(/question_opened_at = v_opened_at, question_closes_at = null/i)
    expect(readerRefresh).toMatch(/'session', public\.session_to_json\(gs\.id\)/i)
    expect(readerRefresh).toMatch(/host_get_active_game[\s\S]*select public\.session_to_json\(gs\.id\)/i)
  })

  it('adds only reveal-gated authoritative Typed Answer outcomes', () => {
    expect(migration).toMatch(/v_session\.phase in \('reveal', 'leaderboard', 'finished'\).*question_type = 'typed-answer'/is)
    expect(migration).toMatch(/where a\.game_session_id = v_session\.id and a\.question_id = v_question\.id and a\.correct/i)
    expect(migration).toMatch(/\{reveal,correctPlayerIds\}/i)
    expect(migration).not.toMatch(/acceptedAnswers/i)
  })

  it('keeps the wrapped production answer validator able to resolve pgcrypto', () => {
    expect(submitAnswerRepair).toMatch(/alter function public\.submit_answer_without_session_prelude\(text, uuid, text, jsonb\)/i)
    expect(submitAnswerRepair).toMatch(/set search_path = public, extensions/i)
    expect(publicSubmitAnswerRepair).toMatch(/alter function public\.submit_answer\(text, uuid, text, jsonb\)/i)
    expect(publicSubmitAnswerRepair).toMatch(/set search_path = public, extensions/i)
    expect(legacyDigestRepair).toContain("replace(v_definition, 'digest(', 'extensions.digest(')")
    expect(legacyDigestRepair).toContain("to_regprocedure('public.submit_answer(text,uuid,text,jsonb)')")
    expect(overloadDigestRepair).toContain("p.proname in ('submit_answer', 'submit_answer_without_session_prelude')")
    expect(overloadDigestRepair).toContain("'reconnect_token_hash = extensions.digest('")
  })
})
