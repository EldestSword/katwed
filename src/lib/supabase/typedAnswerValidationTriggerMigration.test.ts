import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/202608090001_fix_typed_answer_validation_trigger.sql'),
  'utf8',
)

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('Typed Answer validation-trigger repair migration', () => {
  it('replaces the question trigger function and retains every existing question-type branch', () => {
    const validation = definition('validate_question_json')

    expect(validation).toContain('returns trigger language plpgsql set search_path = public')
    for (const type of [
      'single-choice',
      'multiple-select',
      'true-false',
      'slider',
      'pinpoint',
      'mashup',
      'typed-answer',
    ]) {
      expect(validation).toContain(`when '${type}' then`)
    }
  })

  it('preserves the original six question types\' validation semantics', () => {
    const validation = definition('validate_question_json')

    expect(validation).toContain("nullif(new.answer_key ->> 'correctOptionId', '') is null")
    expect(validation).toContain("jsonb_array_length(new.answer_key -> 'correctOptionIds') < 2")
    expect(validation).toContain("(new.type_config ->> 'minimumSelections')::integer < 1")
    expect(validation).toContain("(new.type_config ->> 'maximumSelections')::integer < (new.type_config ->> 'minimumSelections')::integer")
    expect(validation).toContain("new.type_config ->> 'scoringMode' not in ('exact', 'partial-wipeout')")
    expect(validation).toContain("jsonb_typeof(new.answer_key -> 'correctValue') <> 'boolean'")
    expect(validation).toContain('v_min >= v_max or v_step <= 0 or v_correct not between v_min and v_max or v_tolerance < 0')
    expect(validation).toContain("new.media ->> 'type' <> 'image'")
    expect(validation).toContain("(new.answer_key ->> 'targetX')::numeric not between 0 and 1")
    expect(validation).toContain("(new.answer_key ->> 'targetY')::numeric not between 0 and 1")
    expect(validation).toContain("(new.answer_key ->> 'targetRadius')::numeric not between 0.000001 and 1")
    expect(validation).toContain("jsonb_array_length(new.answer_key -> 'correctMemberIds') <> 2")
    expect(validation).toContain("new.answer_key -> 'correctMemberIds' ->> 0 = new.answer_key -> 'correctMemberIds' ->> 1")
  })

  it('validates the complete Typed Answer key through the released normaliser', () => {
    const validation = definition('validate_question_json')

    expect(validation).toContain("jsonb_typeof(new.answer_key -> 'correctAnswer') is distinct from 'string'")
    expect(validation).toContain("char_length(new.answer_key ->> 'correctAnswer') > 120")
    expect(validation).toContain("jsonb_typeof(new.answer_key -> 'acceptedAnswers') is distinct from 'array'")
    expect(validation).toContain("jsonb_array_length(new.answer_key -> 'acceptedAnswers') > 19")
    expect(validation).toContain("jsonb_typeof(answer.value) is distinct from 'string'")
    expect(validation).toContain("group by public.normalise_typed_answer(answer.value)")
    expect(validation.match(/public\.normalise_typed_answer/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('fails unsupported types explicitly instead of raising CASE_NOT_FOUND', () => {
    expect(definition('validate_question_json')).toContain(
      "else\n      raise exception 'Unsupported question type: %', new.question_type;",
    )
  })

  it('changes no schema, grants, scoring, phases, or RPC definitions', () => {
    expect(migration.match(/create or replace function public\./g)).toHaveLength(1)
    expect(migration).not.toMatch(/\b(create|alter|drop) table\b/i)
    expect(migration).not.toMatch(/\b(grant|revoke)\b/i)
    expect(migration).not.toContain('service_role')
  })

  it('leaves the applied Typed Answer release migration byte-for-byte unchanged', () => {
    const bytes = readFileSync(resolve('supabase/migrations/202608080001_typed_answer.sql'))

    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '0e1a2c94b2485cb76ede063556cdb94a31eaab419ec6d4b7ac5251334c97224b',
    )
  })
})
