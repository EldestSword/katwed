import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve('supabase/migrations/202608070007_head_to_head_live_play.sql')
const migration = readFileSync(migrationPath, 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('Head-to-Head live-play migration', () => {
  it('adds a same-quiz competitor claim with database uniqueness and explicit resolutions', () => {
    expect(migration).toContain('add column competitor_id uuid references public.quiz_competitors(id)')
    expect(migration).toContain('create unique index players_one_claim_per_competitor')
    expect(migration).toContain('where competitor_id is not null')
    expect(migration).toContain("add column resolution_status text not null default 'answered'")
    expect(migration).toContain("check (resolution_status in ('answered', 'skipped'))")
    expect(definition('validate_player_competitor')).toContain('c.quiz_id = v_quiz_id')
  })

  it('exposes only safe room discovery and derives Head-to-Head nicknames on the server', () => {
    const info = definition('get_room_join_info')
    const join = definition('join_head_to_head_room')
    expect(info).toContain("'quizType', v_quiz.quiz_type")
    expect(info).toContain("'claimed', p.id is not null")
    expect(info).not.toContain('reconnect_token_hash')
    expect(join).toContain('v_competitor.display_name')
    expect(join).toContain('extensions.digest(v_token')
    expect(definition('join_room')).toContain("v_quiz_type = 'head-to-head'")
  })

  it('uses authenticated player start, skip and idempotent continue operations', () => {
    for (const name of ['start_head_to_head_game', 'skip_head_to_head_answer', 'continue_head_to_head_game']) {
      const sql = definition(name)
      expect(sql).toContain('extensions.digest(p_reconnect_token')
      expect(sql).toContain('security definer')
      expect(sql).toContain('set search_path = public')
    }
    expect(definition('start_head_to_head_game')).toContain('Both competitors must join')
    expect(definition('skip_head_to_head_answer')).toContain('The assigned competitor must answer')
    expect(definition('continue_head_to_head_game')).toContain('v_session.current_question_id <> p_expected_question_id then return')
    expect(definition('continue_head_to_head_game')).toContain("phase = 'finished'")
    expect(definition('continue_head_to_head_game')).toContain('question_closes_at = null')
  })

  it('keeps Head-to-Head untimed and scores exactly one assigned correct answer point', () => {
    const submit = definition('submit_answer')
    expect(submit).toContain("v_quiz_type = 'standard' and (v_session.question_closes_at is null")
    expect(submit).toContain("v_points := case when v_assigned and v_correct then 1 else 0 end")
    expect(submit).toContain("v_correct and (v_quiz_type = 'standard' or v_assigned)")
    expect(submit).toContain("v_correct and v_quiz_type = 'standard'")
    expect(definition('start_head_to_head_game')).toContain('question_closes_at = null')
    expect(definition('reveal_head_to_head_if_complete')).toContain("phase = 'reveal'")
  })

  it('extends safe state without exposing correctness before reveal', () => {
    const safe = definition('get_player_game_state')
    expect(safe).toContain("'quizType', v_quiz.quiz_type")
    expect(safe).toContain("'assignedCompetitorId', case when v_head_to_head")
    expect(safe).toContain("'headToHeadCompetitors'")
    expect(safe).toContain("'headToHeadResolutions'")
    expect(safe).toContain("'headToHeadResults', case when v_head_to_head and v_session.phase in ('reveal', 'finished')")
    expect(safe).toContain("'questionClosesAt', case when v_head_to_head then null")
    expect(safe).toContain("'leaderboard', case when not v_head_to_head")
  })

  it('blocks Standard host progression for Head-to-Head except room close', () => {
    const phases = definition('host_change_phase')
    expect(phases).toContain("v_quiz_type = 'head-to-head' and p_action <> 'close'")
    expect(phases).toContain('Head-to-Head progression is controlled by the competitors.')
    expect(phases).toContain("when 'close' then")
  })

  it('retains narrow grants and does not introduce privileged credentials', () => {
    expect(migration).not.toContain('service_role')
    expect(migration).not.toMatch(/grant execute on function public\.(host_launch_game|validate_player_competitor|reveal_head_to_head_if_complete)[^;]+to anon/)
    for (const name of ['get_room_join_info', 'join_head_to_head_room', 'start_head_to_head_game', 'skip_head_to_head_answer', 'continue_head_to_head_game']) {
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^;]+to anon, authenticated;`))
    }
  })

  it('leaves the pending foundation migration byte-for-byte unchanged', () => {
    const bytes = readFileSync(resolve('supabase/migrations/202608070006_head_to_head_foundation.sql'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('74934271bd7a9dd27d52ec97a1ba99307e8a5ac242ae136b6dab0735e0821620')
  })
})
