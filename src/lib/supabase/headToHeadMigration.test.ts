import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve('supabase/migrations/202608070006_head_to_head_foundation.sql')
const migration = readFileSync(migrationPath, 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('Head-to-Head foundation migration', () => {
  it('adds the constrained quiz type, two-person competitor model and same-quiz assignment reference', () => {
    expect(migration).toContain("add column quiz_type text not null default 'standard'")
    expect(migration).toContain("check (quiz_type in ('standard', 'head-to-head'))")
    expect(migration).toContain('create table public.quiz_competitors')
    expect(migration).toContain('char_length(trim(display_name)) between 1 and 30')
    expect(migration).toContain('display_order integer not null check (display_order in (0, 1))')
    expect(migration).toContain('unique (quiz_id, display_order)')
    expect(migration).toContain('on public.quiz_competitors (quiz_id, lower(trim(display_name)))')
    expect(migration).toContain('add column assigned_competitor_id uuid;')
    expect(migration).toContain('foreign key (quiz_id, assigned_competitor_id)')
    expect(migration).toContain('references public.quiz_competitors(quiz_id, id)')
  })

  it('serialises host-only type, competitor and assignment metadata without widening player-safe state', () => {
    const questionJson = definition('question_to_json')
    const quizJson = definition('quiz_to_json')
    expect(questionJson).toContain("case when p_include_answer then x.answer_key else '{}'::jsonb end")
    expect(questionJson).toContain("'assignedCompetitorId', x.assigned_competitor_id")
    expect(quizJson).toContain("'quizType', q.quiz_type")
    expect(quizJson).toContain("'headToHeadCompetitors', coalesce")
    expect(quizJson).toContain('q.id = p_quiz_id and q.owner_id = auth.uid()')
    expect(migration).not.toContain('create or replace function public.get_player_game_state')
    expect(migration).toContain('revoke all on function public.question_to_json(uuid, boolean) from public, anon;')
  })

  it('saves the new definition while preserving absent fields from older clients', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain("case when p_quiz ? 'quizType' then p_quiz ->> 'quizType' else 'standard' end")
    expect(save).toContain("case when p_quiz ? 'quizType' then p_quiz ->> 'quizType' else v_existing_quiz_type end")
    expect(save).toContain("if p_quiz ? 'headToHeadCompetitors' then")
    expect(save).toContain("when v_question ? 'assignedCompetitorId' then")
    expect(save).toContain('select x.assigned_competitor_id from public.questions x')
    expect(save).toContain('assigned_competitor_id = excluded.assigned_competitor_id')
    expect(save).toContain('cover_image_path = nullif')
    expect(save).toContain("when p_quiz ? 'themeId' then p_quiz ->> 'themeId'")
    expect(save).toContain("when p_quiz ? 'backgroundId' then p_quiz ->> 'backgroundId'")
    expect(save).toContain("p_quiz ->> 'themeId' = 'arcade' and background_id in (")
    expect(save).toContain("if v_quiz_type = 'standard' then")
    expect(save).toContain('Standard quizzes cannot contain Head-to-Head competitors.')
    expect(save).toContain('Standard questions cannot be assigned to Head-to-Head competitors.')
    expect(save).toContain('Head-to-Head quizzes need exactly two competitors.')
    expect(save).toContain('Assign every question to a competitor.')
  })

  it('retains ownership, RLS and restricted definer execution', () => {
    expect(migration).toContain('alter table public.quiz_competitors enable row level security;')
    expect(migration).toContain('q.id = quiz_id and q.owner_id = auth.uid()')
    for (const name of ['question_to_json', 'quiz_to_json', 'host_save_quiz', 'host_launch_game']) {
      expect(definition(name)).toContain('security definer')
      expect(definition(name)).toContain('set search_path = public')
    }
    expect(migration).not.toMatch(/grant execute[^;]+\bto anon\b/)
    expect(migration).not.toContain('service_role')
  })

  it('blocks Head-to-Head launch before creating or resuming a room and preserves Standard launch', () => {
    const launch = definition('host_launch_game')
    expect(launch).toContain("if v_quiz_type = 'head-to-head' then")
    expect(launch).toContain('Head-to-Head live play is not available in this build yet.')
    expect(launch.indexOf("if v_quiz_type = 'head-to-head'")).toBeLessThan(
      launch.indexOf('select id into v_session_id'),
    )
    expect(launch).toContain("where quiz_id = p_quiz_id and status = 'active'")
    expect(launch).toContain('insert into public.game_sessions (quiz_id, room_code)')
  })

  it('does not redefine scoring, phases, answers, media deletion or game-state functions', () => {
    expect(migration.match(/create or replace function public\./g)).toHaveLength(4)
    for (const name of [
      'score_answer',
      'host_change_phase',
      'submit_answer',
      'get_player_game_state',
      'host_permanently_delete_quiz',
      'host_classify_media_paths',
    ]) expect(migration).not.toContain(`create or replace function public.${name}`)
  })

  it('leaves all 12 earlier migrations byte-for-byte unchanged', () => {
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
      '202608070004_quiz_themes.sql': 'befcb4c70ea6c5ef23f1149a26f00d3c841c1a9a2bcf2ba621d0f632f07456a7',
      '202608070005_quiz_backgrounds.sql': '557982df4fb57a3a4e2af06ff4ab1f117b05f2806084580241eef6f50da5af1d',
    }

    for (const [filename, expected] of Object.entries(expectedHashes)) {
      const bytes = readFileSync(resolve('supabase/migrations', filename))
      expect(createHash('sha256').update(bytes).digest('hex'), filename).toBe(expected)
    }
  })
})
