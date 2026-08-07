import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608070004_quiz_themes.sql'), 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('quiz themes migration', () => {
  it('adds a non-null Katwed-default column constrained to exactly six supported IDs', () => {
    expect(migration).toContain("add column theme_id text not null default 'katwed';")
    const constraint = migration.match(/check \(theme_id in \(([^)]+)\)\)/)?.[1]
    expect(constraint?.match(/'[^']+'/g)).toEqual([
      "'katwed'", "'midnight'", "'sunset'", "'arcade'", "'mint'", "'paper'",
    ])
  })

  it('returns theme, cover and archive metadata through the owner-scoped quiz serializer', () => {
    const serialiser = definition('quiz_to_json')
    expect(serialiser).toContain("'themeId', q.theme_id")
    expect(serialiser).toContain("'coverImagePath', q.cover_image_path")
    expect(serialiser).toContain("'archivedAt', q.archived_at")
    expect(serialiser).toContain('q.id = p_quiz_id and q.owner_id = auth.uid()')
  })

  it('persists explicit themes while keeping old-client insert and update saves safe', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain('insert into public.quizzes (owner_id, title, cover_image_path, theme_id)')
    expect(save).toContain("case when p_quiz ? 'themeId' then p_quiz ->> 'themeId' else 'katwed' end")
    expect(save).toContain("when p_quiz ? 'themeId' then")
    expect(save).toContain("when p_quiz ? 'themeId' then p_quiz ->> 'themeId'")
    expect(save).toContain('else theme_id')
    expect(save).toContain('where id = v_quiz_id and owner_id = auth.uid()')
    expect(save).toContain("jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb))")
  })

  it('adds only the theme to the existing player-safe state and retains answer boundaries', () => {
    const safeState = definition('get_player_game_state')
    expect(safeState).toContain("'themeId', v_quiz.theme_id")
    expect(safeState).toContain("- 'quizId' - 'revealCaption' - 'scoringMode'")
    expect(safeState).toContain("v_session.phase in ('reveal', 'leaderboard', 'finished')")
    expect(safeState).toContain("'leaderboard', case when v_scores_visible")
    expect(safeState).not.toContain('host_change_phase')
  })

  it('keeps definer functions scoped and grants no new privileged access', () => {
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

  it('does not redefine scoring or phase mutation functions', () => {
    expect(migration.match(/create or replace function public\./g)).toHaveLength(3)
    for (const name of ['score_answer', 'host_change_phase', 'host_launch_game', 'join_game']) {
      expect(migration).not.toContain(`create or replace function public.${name}`)
    }
  })

  it('leaves every earlier migration byte-for-byte unchanged', () => {
    const expectedHashes: Record<string, string> = {
      '202607300001_initial_katwed.sql': '3d31bcfa5d90c8d5a78a92d0653774d46ae7b141be2084b1ec1815cadc16cf2e',
      '202607300002_question_image_storage.sql': '82954e809b8a117c46f61a90ed75625e986c589314293f807ce57a7663096d8d',
      '202607300003_realtime_broadcast.sql': '459ddd510e223502ce7d039c8f2a646fd93e88da5c75dc2938b980656b3f94c3',
      '202607300004_room_and_rpc_hardening.sql': '9bc1e289c4c5125a7b4d5d2d3297795892303dcb3f63f8409acaa7f90de543e7',
      '202607310001_multiformat_quiz_platform.sql': '2fe8ca3c7878e3adeb1296ef3fd9686edcea5d0ba161690e3dbcb8729e395acb',
      '202607310002_answer_reveals_final_results.sql': '3bae305a506d1d84f125fec8ad6d7ca53b2ec28c25e89b906bd14a1b00a19ae4',
      '202608060001_fix_pgcrypto_schema.sql': 'fa06a4d2a052cc7bceca557cf715703f8f787127261e948ee862f01f4fd8a264',
      '202608070001_quiz_archive_lifecycle.sql': 'afbfd5248dddc563a7144dde76c7388bf56d283acad641f80a5f8b6a3287537c',
      '202608070002_quiz_covers.sql': '9c46579e4696e391fea0663a0c7a18dd03724d0c610ac96c067c91e420f63060',
      '202608070003_storage_manager.sql': '9355e6a16a28971631bc225b84550158cd8791670c740ff09dffdf9929c1ca70',
    }
    for (const [filename, expected] of Object.entries(expectedHashes)) {
      const bytes = readFileSync(resolve('supabase/migrations', filename))
      expect(createHash('sha256').update(bytes).digest('hex'), filename).toBe(expected)
    }
  })
})
