import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/202608090002_standard_scoring_and_tile_options.sql'),
  'utf8',
)
const appliedTriggerMigration = readFileSync(
  resolve('supabase/migrations/202608090001_fix_typed_answer_validation_trigger.sql'),
  'utf8',
)

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('pending Standard scoring and tile-options migration', () => {
  it('adds backward-compatible false defaults and safe owner serialization', () => {
    expect(migration).toContain('speed_scoring_enabled boolean not null default false')
    expect(migration).toContain('double_score boolean not null default false')
    expect(definition('question_to_json')).toContain("'speedScoringEnabled', x.speed_scoring_enabled")
    expect(definition('question_to_json')).toContain("'doubleScore', x.double_score")
  })

  it('persists Boolean Standard settings while rejecting them for Head-to-Head', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain("jsonb_typeof(item.value -> 'speedScoringEnabled') is distinct from 'boolean'")
    expect(save).toContain("jsonb_typeof(item.value -> 'doubleScore') is distinct from 'boolean'")
    expect(save).toContain("Head-to-Head questions cannot use Speed Scoring or Double Score")
    expect(save).toContain('set speed_scoring_enabled = case')
    expect(save).toContain('double_score = case')
    expect(save).toContain("when v_quiz_type = 'head-to-head' then false")
  })

  it('allows only configured tile grids while retaining omitted legacy media metadata', () => {
    expect(migration).toContain("not (media ? 'tileGridSize')")
    expect(migration).toContain("media ->> 'revealEffect' = 'tiles'")
    expect(migration).toContain("jsonb_typeof(media -> 'tileGridSize') = 'number'")
    expect(migration).toContain("(media ->> 'tileGridSize')::numeric in (6, 8, 12, 16)")
  })

  it('scores Standard answers in the database using Double then the clamped linear speed curve', () => {
    const submit = definition('submit_answer')
    expect(submit).toContain('if v_question.double_score then v_points := v_points * 2; end if;')
    expect(submit).toContain('v_scoring_response_ms := least(v_available_ms, greatest(0, v_response_ms));')
    expect(submit).toContain('floor(v_points * (1 - (0.5 * v_scoring_response_ms::numeric / v_available_ms)))')
    expect(submit.indexOf('v_question.double_score')).toBeLessThan(submit.indexOf('v_question.speed_scoring_enabled'))
    expect(submit).toContain("v_question.type_config ->> 'scoringMode' = 'partial-wipeout'")
  })

  it('uses authoritative timestamps for the intro, full timer and early-answer protection', () => {
    const submit = definition('submit_answer')
    const phases = definition('host_change_phase')
    expect(submit).toContain('v_now < v_session.question_opened_at')
    expect(submit).toContain("raise exception 'Wait for the question to open.'")
    expect(submit).toContain('v_now > v_session.question_closes_at')
    expect(phases.match(/interval '1500 milliseconds'/g)).toHaveLength(2)
    expect(phases.match(/v_opened_at \+ make_interval\(secs => v_question.time_limit_seconds\)/g)).toHaveLength(2)
    expect(phases.match(/Wait for the Double Score intro to finish\./g)).toHaveLength(2)
  })

  it('preserves current Head-to-Head, Typed Answer and pgcrypto behaviour in replaced functions', () => {
    const submit = definition('submit_answer')
    const phases = definition('host_change_phase')
    expect(submit).toContain("v_points := case when v_assigned and v_correct then 1 else 0 end")
    expect(submit).toContain('perform public.reveal_head_to_head_if_complete')
    expect(submit).toContain("when 'typed-answer' then")
    expect(submit.match(/public\.normalise_typed_answer/g)?.length).toBeGreaterThanOrEqual(2)
    expect(submit).toContain("extensions.digest(p_reconnect_token, 'sha256')")
    expect(phases).toContain("Head-to-Head progression is controlled by the competitors.")
  })

  it('retains restricted SECURITY DEFINER boundaries without anon grants', () => {
    for (const name of ['question_to_json', 'host_save_quiz', 'submit_answer', 'host_change_phase']) {
      expect(definition(name)).toContain('security definer set search_path = public')
    }
    expect(migration).not.toContain('service_role')
    expect(migration).not.toMatch(/grant execute[^;]+\bto anon\b/i)
  })

  it('leaves the applied seven-type validation repair byte-for-byte unchanged and authoritative', () => {
    expect(createHash('sha256').update(appliedTriggerMigration).digest('hex')).toBe(
      '8553c6d683c6216b49866eaa6973d545f5610d6e95375db768a6c350408afa3f',
    )
    for (const type of [
      'single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'mashup', 'typed-answer',
    ]) {
      expect(appliedTriggerMigration).toContain(`when '${type}' then`)
    }
    expect(appliedTriggerMigration).toContain('public.normalise_typed_answer')
    expect(migration).not.toContain('create or replace function public.validate_question_json')
  })
})
