import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/202608270009_host_intelligence_and_typed_overrides.sql'),
  'utf8',
)

describe('host intelligence and Typed Answer override migration', () => {
  it('adds a backwards-compatible session setting and private owner answer serialisation', () => {
    expect(migration).toMatch(/add column show_player_answers_to_host boolean not null default true/i)
    expect(migration).toMatch(/'showPlayerAnswersToHost', s\.show_player_answers_to_host/i)
    expect(migration).toMatch(/'answers', coalesce[\s\S]*from public\.player_answers a where a\.game_session_id = s\.id/i)
    expect(migration).toMatch(/where s\.id = p_session_id and q\.owner_id = auth\.uid\(\)/i)
    expect(migration).toMatch(/setting\.key not in \([\s\S]*'showPlayerAnswersToHost'/i)
    expect(migration).toMatch(/coalesce\(\(p_settings ->> 'showPlayerAnswersToHost'\)::boolean, true\)/i)
    expect(migration).toMatch(/create or replace function public\.host_launch_game\(p_quiz_id uuid\)/i)
  })

  it('preserves automatic judgement and exposes only an authenticated host override RPC', () => {
    expect(migration).toMatch(/add column automatic_correct boolean/i)
    expect(migration).toMatch(/update public\.player_answers set automatic_correct = correct/i)
    expect(migration).toMatch(/before insert on public\.player_answers/i)
    expect(migration).toMatch(/create or replace function public\.host_set_typed_answer_override/i)
    expect(migration).toMatch(/q\.owner_id = auth\.uid\(\)[\s\S]*for update of gs/i)
    expect(migration).toMatch(/v_quiz_type <> 'standard'/i)
    expect(migration).toMatch(/v_question\.question_type <> 'typed-answer'/i)
    expect(migration).toMatch(/v_session\.phase not in \('locked', 'reveal', 'leaderboard'\)/i)
    expect(migration).toMatch(/revoke all on function public\.host_set_typed_answer_override.*from public, anon/i)
    expect(migration).toMatch(/grant execute on function public\.host_set_typed_answer_override.*to authenticated/i)
  })

  it('recalculates exact Standard modifiers from original response time and applies deltas atomically', () => {
    expect(migration).toMatch(/v_duration_ms := greatest\(1, v_question\.time_limit_seconds \* 1000\)/i)
    expect(migration).toMatch(/if v_question\.double_score then v_next_points := v_next_points \* 2/i)
    expect(migration).toMatch(/v_scoring_response_ms := least\(v_duration_ms, greatest\(0, v_answer\.response_time_ms\)\)/i)
    expect(migration).toMatch(/total_score = total_score \+ \(v_next_points - v_previous_points\)/i)
    expect(migration).toMatch(/correct_answer_count = correct_answer_count \+/i)
    expect(migration).toMatch(/total_correct_response_ms = total_correct_response_ms \+/i)
  })
})
