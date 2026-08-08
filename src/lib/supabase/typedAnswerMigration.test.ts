import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608080001_typed_answer.sql'), 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('Typed Answer migration', () => {
  it('adds only the new constrained question discriminator and server normaliser', () => {
    expect(migration).toContain("'pinpoint', 'typed-answer', 'mashup'")
    expect(definition('normalise_typed_answer')).toContain('normalize(p_value, NFKC)')
    expect(definition('normalise_typed_answer')).toContain("'[^[:alnum:]]+'")
  })

  it('validates and stores one primary plus at most 19 unique alternatives', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain("jsonb_array_length(v_question -> 'acceptedAnswers') > 19")
    expect(save).toContain('char_length(v_question ->> \'correctAnswer\') > 120')
    expect(save).toContain('group by public.normalise_typed_answer(answer.value)')
    expect(save).toContain("when 'typed-answer' then jsonb_build_object(")
  })

  it('keeps authoritative Standard and Head-to-Head scoring semantics', () => {
    const submit = definition('submit_answer')
    expect(submit).toContain("when 'typed-answer' then")
    expect(submit).toContain('public.normalise_typed_answer(accepted.value) = v_normalised')
    expect(submit).toContain("v_points := case when v_assigned and v_correct then 1 else 0 end")
    expect(submit).toContain('elsif v_correct then')
  })

  it('never exposes accepted alternatives through safe state or reveal', () => {
    expect(definition('question_to_json')).toContain("case when p_include_answer then x.answer_key else '{}'::jsonb end")
    expect(definition('get_player_game_state')).toContain("v_question.answer_key - 'acceptedAnswers'")
    expect(definition('get_player_game_state')).not.toContain("'acceptedAnswers',")
  })

  it('retains restricted definer functions and narrow grants', () => {
    for (const name of ['question_to_json', 'host_save_quiz', 'submit_answer', 'get_player_game_state']) {
      expect(definition(name)).toContain('security definer')
      expect(definition(name)).toContain('set search_path = public')
    }
    expect(migration).not.toContain('service_role')
    expect(migration).not.toMatch(/grant execute on function public\.host_save_quiz\(jsonb\) to anon/)
  })

  it('leaves both applied Head-to-Head migrations byte-for-byte unchanged', () => {
    const hashes = [
      ['202608070006_head_to_head_foundation.sql', '74934271bd7a9dd27d52ec97a1ba99307e8a5ac242ae136b6dab0735e0821620'],
      ['202608070007_head_to_head_live_play.sql', '0553fdc07c4b6e5ee22faa8ed554ec489700347de89d5c8faab7a30997e6aa97'],
    ]
    hashes.forEach(([file, expected]) => {
      const bytes = readFileSync(resolve('supabase/migrations', file))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected)
    })
  })
})
