import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve('supabase/migrations/202608070002_quiz_covers.sql')
const migration = readFileSync(migrationPath, 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('quiz covers migration', () => {
  it('adds a nullable cover column and returns it through the owner-scoped quiz JSON', () => {
    expect(migration).toContain('add column cover_image_path text;')
    expect(migration).not.toContain('cover_image_path text not null')
    const serialiser = definition('quiz_to_json')
    expect(serialiser).toContain("'coverImagePath', q.cover_image_path")
    expect(serialiser).toContain('q.id = p_quiz_id and q.owner_id = auth.uid()')
    expect(serialiser).toContain('security definer set search_path = public')
  })

  it('persists nullable covers on both quiz creation and update without changing nested save behaviour', () => {
    const save = definition('host_save_quiz')
    expect(save).toContain('insert into public.quizzes (owner_id, title, cover_image_path)')
    expect(save).toContain("nullif(trim(p_quiz ->> 'coverImagePath'), '')")
    expect(save).toContain("cover_image_path = nullif(trim(p_quiz ->> 'coverImagePath'), '')")
    expect(save).toContain('where id = v_quiz_id and owner_id = auth.uid()')
    expect(save).toContain("jsonb_array_elements(coalesce(p_quiz -> 'roster', '[]'::jsonb))")
    expect(save).toContain("jsonb_array_elements(coalesce(p_quiz -> 'questions', '[]'::jsonb))")
    expect(save).toContain('security definer set search_path = public')
  })

  it('protects exact shared references symmetrically across every supported image location', () => {
    const deletion = definition('host_permanently_delete_quiz')
    expect(deletion).toContain('select q.id as quiz_id, q.cover_image_path as reference')
    expect(deletion).toContain("select x.quiz_id, x.media ->> 'path' as reference")
    expect(deletion).toContain('select x.quiz_id, x.image_path as reference')
    expect(deletion).toContain('select x.quiz_id, o.image_path as reference')
    expect(deletion).toContain('all_media_references')
    expect(deletion).toContain('other.quiz_id <> p_quiz_id')
    expect(deletion).toContain("nullif(trim(other.reference), '') = t.reference")
    expect(deletion.indexOf('select q.id as quiz_id, q.cover_image_path')).toBeLessThan(
      deletion.indexOf('into v_media_paths'),
    )
  })

  it('retains archive, active-room, database-first deletion and Storage hand-off safeguards', () => {
    const deletion = definition('host_permanently_delete_quiz')
    expect(deletion).toContain('q.id = p_quiz_id and q.owner_id = auth.uid()')
    expect(deletion).toContain('v_quiz.archived_at is null')
    expect(deletion).toContain("gs.status = 'active'")
    expect(deletion.indexOf('into v_media_paths')).toBeLessThan(deletion.indexOf('delete from public.quizzes'))
    expect(deletion.indexOf('delete from public.quizzes')).toBeLessThan(deletion.indexOf("return jsonb_build_object('mediaPaths'"))
    expect(deletion).toContain('Storage removal happens afterwards in the authenticated browser client.')
  })

  it('preserves restricted execution and introduces no anonymous or service-role access', () => {
    for (const functionName of ['quiz_to_json', 'host_save_quiz', 'host_permanently_delete_quiz']) {
      expect(definition(functionName)).toContain('security definer set search_path = public')
      expect(migration).toContain(`revoke all on function public.${functionName}`)
    }
    expect(migration).toContain('grant execute on function public.host_save_quiz(jsonb) to authenticated;')
    expect(migration).toContain('grant execute on function public.host_permanently_delete_quiz(uuid) to authenticated;')
    expect(migration).not.toMatch(/grant execute[^;]+\bto anon\b/)
    expect(migration).not.toContain('service_role')
  })

  it('leaves every previously committed migration byte-for-byte unchanged', () => {
    const expectedHashes: Record<string, string> = {
      '202607300001_initial_katwed.sql': '3d31bcfa5d90c8d5a78a92d0653774d46ae7b141be2084b1ec1815cadc16cf2e',
      '202607300002_question_image_storage.sql': '82954e809b8a117c46f61a90ed75625e986c589314293f807ce57a7663096d8d',
      '202607300003_realtime_broadcast.sql': '459ddd510e223502ce7d039c8f2a646fd93e88da5c75dc2938b980656b3f94c3',
      '202607300004_room_and_rpc_hardening.sql': '9bc1e289c4c5125a7b4d5d2d3297795892303dcb3f63f8409acaa7f90de543e7',
      '202607310001_multiformat_quiz_platform.sql': '2fe8ca3c7878e3adeb1296ef3fd9686edcea5d0ba161690e3dbcb8729e395acb',
      '202607310002_answer_reveals_final_results.sql': '3bae305a506d1d84f125fec8ad6d7ca53b2ec28c25e89b906bd14a1b00a19ae4',
      '202608060001_fix_pgcrypto_schema.sql': 'fa06a4d2a052cc7bceca557cf715703f8f787127261e948ee862f01f4fd8a264',
      '202608070001_quiz_archive_lifecycle.sql': 'afbfd5248dddc563a7144dde76c7388bf56d283acad641f80a5f8b6a3287537c',
    }

    for (const [filename, expected] of Object.entries(expectedHashes)) {
      const bytes = readFileSync(resolve('supabase/migrations', filename))
      expect(createHash('sha256').update(bytes).digest('hex'), filename).toBe(expected)
    }
  })
})
