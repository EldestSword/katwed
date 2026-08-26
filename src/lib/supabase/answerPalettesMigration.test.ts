import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANSWER_PALETTE_IDS } from '../../types/domain'

const migration = readFileSync(
  resolve('supabase/migrations/202608260001_quiz_answer_palettes.sql'),
  'utf8',
)

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('quiz answer palettes migration', () => {
  it('adds the preset ID and an exact eight-colour Classic default', () => {
    expect(migration).toContain("add column answer_palette_id text not null default 'classic'")
    expect(migration).toContain('add column custom_answer_colours jsonb not null default')
    for (const id of ANSWER_PALETTE_IDS) expect(migration).toContain(`'${id}'`)
    expect(migration).toContain('when jsonb_array_length(p_colours) <> 8 then false')
    expect(migration).toContain("!~ '^#[0-9A-F]{6}$'")
  })

  it('preserves stale-client values and validates explicit custom writes', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain("if p_quiz ? 'answerPaletteId' then")
    expect(save).toContain("if p_quiz ? 'customAnswerColours'")
    expect(save).toContain("when p_quiz ? 'answerPaletteId' then p_quiz ->> 'answerPaletteId'")
    expect(save).toContain('else answer_palette_id')
    expect(save).toContain("when p_quiz ? 'customAnswerColours' then p_quiz -> 'customAnswerColours'")
    expect(save).toContain('else custom_answer_colours')
  })

  it('uses the established owner and player-safe serialisation boundaries', () => {
    expect(definition('quiz_to_json')).toContain("'answerPaletteId', q.answer_palette_id")
    const safeState = definition('get_player_game_state')
    expect(safeState).toContain("'answerPaletteId', q.answer_palette_id")
    expect(safeState).not.toContain('correct')
    expect(safeState).not.toContain('leaderboard')
    expect(migration).toContain('revoke all on function public.host_save_quiz(jsonb) from public, anon;')
    expect(migration).toContain('grant execute on function public.host_save_quiz(jsonb) to authenticated;')
    expect(migration).toContain('grant execute on function public.get_player_game_state(text) to anon, authenticated;')
    expect(migration).not.toContain('service_role')
  })

  it('wraps only quiz persistence and harmless safe-state configuration', () => {
    expect(migration.match(/create or replace function public\./g)).toHaveLength(4)
    for (const name of ['score_answer', 'host_change_phase', 'host_launch_game']) {
      expect(migration).not.toContain(`create or replace function public.${name}`)
    }
  })
})
