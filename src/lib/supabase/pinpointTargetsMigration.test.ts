import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20260903203203_visual_pinpoint_targets.sql', 'utf8')
describe('Visual Pinpoint forward migration', () => {
  it('normalises legacy rows and validates shapes at the database boundary', () => {
    expect(migration).toContain("where question_type = 'pinpoint' and not (answer_key ? 'target')")
    expect(migration).toContain('not public.pinpoint_target_valid(public.normalise_pinpoint_target(new.answer_key))')
    expect(migration).toContain('v_n not between 3 and 64')
    expect(migration).toContain('abs(v_area)/2 >= 0.0001')
    expect(migration).toContain("is distinct from 'number'")
  })
  it('updates the retained scoring and save implementations without replacing their wrappers', () => {
    expect(migration).toContain("'public.submit_answer_without_session_prelude(text,uuid,text,jsonb)'::regprocedure")
    expect(migration).toContain("'public.host_save_quiz_without_standard_scoring(jsonb)'::regprocedure")
    expect(migration).toContain('v_correct := public.pinpoint_contains(public.normalise_pinpoint_target(v_question.answer_key), v_x, v_y)')
    expect(migration).toContain('Expected Pinpoint scoring implementation was not found')
    expect(migration).not.toMatch(/create (or replace )?function public\.(get_player_game_state|question_to_json|submit_answer|host_save_quiz)\(/)
    expect(migration).not.toMatch(/for update|for share|grant execute/i)
  })
  it('keeps geometry helpers private and preserves the phase-gated generic reveal', () => {
    for (const signature of ['pinpoint_cross(jsonb,jsonb,jsonb)', 'pinpoint_on_segment(jsonb,jsonb,jsonb)', 'pinpoint_target_valid(jsonb)', 'normalise_pinpoint_target(jsonb)', 'pinpoint_contains(jsonb,numeric,numeric)']) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated`)
    }
    const reveal = readFileSync('supabase/migrations/202608080001_typed_answer.sql', 'utf8')
    expect(reveal).toContain("if v_session.phase in ('reveal', 'leaderboard', 'finished')")
    expect(reveal).toContain("(v_question.answer_key - 'acceptedAnswers')")
  })
})
