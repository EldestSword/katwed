import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve('supabase/migrations/202608070001_quiz_archive_lifecycle.sql')
const migration = readFileSync(migrationPath, 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('quiz archive lifecycle migration', () => {
  it('adds archive metadata and narrow, hardened lifecycle RPCs', () => {
    expect(migration).toContain('add column archived_at timestamptz')
    for (const functionName of [
      'host_list_archived_quizzes',
      'host_archive_quiz',
      'host_restore_quiz',
      'host_permanently_delete_quiz',
    ]) {
      const sql = definition(functionName)
      expect(sql).toContain('security definer')
      expect(sql).toContain('set search_path = public')
      expect(migration).toContain(`revoke all on function public.${functionName}`)
      expect(migration).toContain(`grant execute on function public.${functionName}`)
    }
    expect(migration).not.toContain('service_role')
  })

  it('owner-scopes both libraries and every mutating lifecycle RPC', () => {
    expect(definition('host_list_quizzes')).toContain('q.owner_id = auth.uid() and q.archived_at is null')
    expect(definition('host_list_archived_quizzes')).toContain(
      'q.owner_id = auth.uid() and q.archived_at is not null',
    )
    for (const functionName of [
      'host_archive_quiz',
      'host_restore_quiz',
      'host_permanently_delete_quiz',
      'host_launch_game',
    ]) {
      expect(definition(functionName)).toContain('q.id = p_quiz_id and q.owner_id = auth.uid()')
    }
  })

  it('enforces active-room and archived-state guards on the server', () => {
    expect(migration).toContain('create trigger quizzes_enforce_archive_lifecycle')
    const trigger = definition('enforce_quiz_archive_lifecycle')
    expect(trigger).toContain("tg_op = 'UPDATE'")
    expect(trigger).toContain("tg_op = 'DELETE' and auth.uid() is not null")
    expect(trigger).toContain("gs.status = 'active'")
    expect(definition('host_archive_quiz')).toContain("gs.status = 'active'")
    expect(definition('host_archive_quiz')).toContain('Close the active game before archiving this quiz.')
    expect(definition('host_restore_quiz')).toContain('v_quiz.archived_at is null')
    expect(definition('host_permanently_delete_quiz')).toContain('v_quiz.archived_at is null')
    expect(definition('host_permanently_delete_quiz')).toContain("gs.status = 'active'")
    expect(definition('host_launch_game')).toContain('v_archived_at is not null')
    expect(definition('host_launch_game')).toContain('Restore this quiz before launching it.')
  })

  it('removes the old delete bypass and preserves exact references used by any other quiz', () => {
    expect(migration).toContain(
      'revoke all on function public.host_delete_quiz(uuid) from public, anon, authenticated;',
    )
    const deletion = definition('host_permanently_delete_quiz')
    expect(deletion).toContain("x.media ->> 'path'")
    expect(deletion).toContain('select x.quiz_id, x.image_path as reference')
    expect(deletion).toContain('select x.quiz_id, o.image_path as reference')
    expect(deletion).toContain('where not exists (')
    expect(deletion).toContain('other.quiz_id <> p_quiz_id')
    expect(deletion).toContain("nullif(trim(other.reference), '') = t.reference")
    expect(deletion.indexOf('into v_media_paths')).toBeLessThan(deletion.indexOf('delete from public.quizzes'))
  })
})
