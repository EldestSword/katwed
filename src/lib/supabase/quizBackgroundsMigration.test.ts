import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUIZ_BACKGROUND_IDS } from '../../types/domain'

const migrationPath = resolve('supabase/migrations/202608070005_quiz_backgrounds.sql')
const migration = readFileSync(migrationPath, 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('quiz backgrounds migration', () => {
  it('adds one nullable background column with all 18 explicit theme-bound values', () => {
    expect(migration).toContain('add column background_id text;')
    const constraint = migration.slice(
      migration.indexOf('add constraint quizzes_background_theme_check'),
      migration.indexOf('create or replace function public.quiz_to_json'),
    )
    expect(constraint).toContain('background_id is null')
    const allowedIds = [...constraint.matchAll(/background_id in \(([^)]+)\)/g)]
      .flatMap((match) => match[1].match(/'([^']+)'/g) ?? [])
      .map((value) => value.slice(1, -1))
    expect(allowedIds).toEqual([...QUIZ_BACKGROUND_IDS])
    expect(constraint).toContain("theme_id = 'katwed'")
    expect(constraint).toContain("theme_id = 'midnight'")
    expect(constraint).toContain("theme_id = 'sunset'")
    expect(constraint).toContain("theme_id = 'arcade'")
    expect(constraint).toContain("theme_id = 'mint'")
    expect(constraint).toContain("theme_id = 'paper'")
  })

  it('returns nullable background metadata through owner and player-safe reads', () => {
    const serialiser = definition('quiz_to_json')
    const safeState = definition('get_player_game_state')
    expect(serialiser).toContain("'backgroundId', q.background_id")
    expect(serialiser).toContain('q.id = p_quiz_id and q.owner_id = auth.uid()')
    expect(safeState).toContain("'backgroundId', v_quiz.background_id")
    expect(safeState).toContain("- 'quizId' - 'revealCaption' - 'scoringMode'")
    expect(safeState).toContain("v_session.phase in ('reveal', 'leaderboard', 'finished')")
    expect(safeState).toContain("'leaderboard', case when v_scores_visible")
  })

  it('defaults old-client inserts and distinguishes absent, explicit null and explicit values', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain('insert into public.quizzes (owner_id, title, cover_image_path, theme_id, background_id)')
    expect(save).toContain("case when p_quiz ? 'backgroundId' then p_quiz ->> 'backgroundId' else null end")
    expect(save).toContain("when p_quiz ? 'backgroundId' then p_quiz ->> 'backgroundId'")
    expect(save).toContain('else background_id')
  })

  it('preserves an absent compatible background but clears it for an incompatible theme change', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain("when p_quiz ? 'themeId' and background_id is not null and not (")
    expect(save).toContain("p_quiz ->> 'themeId' = 'arcade' and background_id in (")
    expect(save).toContain("'arcade-circuit', 'arcade-grid', 'arcade-neon'")
    expect(save).toContain(') then null')
    expect(save.indexOf("when p_quiz ? 'backgroundId'")).toBeLessThan(
      save.indexOf("when p_quiz ? 'themeId' and background_id is not null"),
    )
  })

  it('retains quiz persistence, ownership and restricted definer boundaries', () => {
    const save = definition('host_save_quiz')
    for (const token of [
      "jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb))",
      "jsonb_array_elements(coalesce(p_quiz -> 'roster', '[]'::jsonb))",
      "v_type in ('single-choice', 'multiple-select')",
      'Both correct people must be active members of the people bank',
      'where id = v_quiz_id and owner_id = auth.uid()',
    ]) expect(save).toContain(token)
    for (const name of ['quiz_to_json', 'host_save_quiz', 'get_player_game_state']) {
      expect(definition(name)).toContain('security definer set search_path = public')
    }
    expect(migration).toContain('revoke all on function public.quiz_to_json(uuid) from public, anon;')
    expect(migration).toContain('revoke all on function public.host_save_quiz(jsonb) from public, anon;')
    expect(migration).toContain('revoke all on function public.get_player_game_state(text) from public;')
    expect(migration).toContain('grant execute on function public.host_save_quiz(jsonb) to authenticated;')
    expect(migration).toContain('grant execute on function public.get_player_game_state(text) to anon, authenticated;')
    expect(migration).not.toContain('service_role')
  })

  it('does not redefine scoring, phase, deletion or Storage functions', () => {
    expect(migration.match(/create or replace function public\./g)).toHaveLength(3)
    for (const name of [
      'score_answer',
      'host_change_phase',
      'host_launch_game',
      'host_permanently_delete_quiz',
      'host_classify_media_paths',
    ]) expect(migration).not.toContain(`create or replace function public.${name}`)
  })

  it('leaves the pending theme migration byte-for-byte unchanged', () => {
    const bytes = readFileSync(resolve('supabase/migrations/202608070004_quiz_themes.sql'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'befcb4c70ea6c5ef23f1149a26f00d3c841c1a9a2bcf2ba621d0f632f07456a7',
    )
  })
})
