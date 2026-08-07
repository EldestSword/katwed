import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608070003_storage_manager.sql'), 'utf8')

function definition(functionName: string): string {
  const start = migration.indexOf(`create or replace function public.${functionName}`)
  const next = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('Storage Manager migration', () => {
  it('adds only owner-scoped authenticated listing for the existing bucket', () => {
    const policy = migration.slice(0, migration.indexOf('create or replace function'))
    expect(policy).toContain('create policy "question_images_host_select"')
    expect(policy).toContain("bucket_id = 'question-images'")
    expect(policy).toContain('(storage.foldername(name))[1] = auth.uid()::text')
    expect(policy).toContain('for select to authenticated')
    expect(policy).not.toMatch(/for select to anon|to anon/)
  })

  it('requires authentication, bounds input and accepts only caller-owned generated WebP paths', () => {
    const rpc = definition('host_classify_media_paths')
    expect(rpc).toContain('v_user_id uuid := auth.uid()')
    expect(rpc).toContain("raise exception 'Sign in required'")
    expect(rpc).toContain('array_length(p_paths, 1), 0) > 200')
    expect(rpc).toContain("'^' || v_user_id::text")
    expect(rpc).toContain("/[0-9]{4}/[0-9a-f]{8}")
    expect(rpc).toContain("[0-9a-f]{12}\\.webp$'")
  })

  it('uses a restricted security-definer RPC and authenticated-only execution', () => {
    const rpc = definition('host_classify_media_paths')
    expect(rpc).toContain('security definer')
    expect(rpc).toContain('set search_path = public')
    expect(migration).toContain('revoke all on function public.host_classify_media_paths(text[]) from public, anon;')
    expect(migration).toContain('grant execute on function public.host_classify_media_paths(text[]) to authenticated;')
    expect(migration).not.toMatch(/grant execute[^;]+to anon/)
    expect(migration).not.toContain('service_role')
  })

  it('checks every supported reference globally without exposing another host inventory', () => {
    const rpc = definition('host_classify_media_paths')
    expect(rpc).toContain('select q.cover_image_path as reference')
    expect(rpc).toContain("select x.media ->> 'path' as reference")
    expect(rpc).toContain('select x.image_path as reference')
    expect(rpc).toContain('select o.image_path as reference')
    expect(rpc).toContain('from public.quizzes q')
    expect(rpc).not.toContain('q.owner_id = auth.uid()')
    expect(rpc).toContain("trim(media.reference) = candidate.path")
    expect(rpc).toContain("%/storage/v1/object/public/question-images/%")
    expect(rpc).toContain("'ignoredPaths'")
  })

  it('classifies only and never deletes Storage metadata or quiz data', () => {
    const rpc = definition('host_classify_media_paths')
    expect(rpc).toContain("'referencedPaths'")
    expect(rpc).toContain("'unusedPaths'")
    expect(rpc).not.toMatch(/delete\s+from/i)
    expect(rpc).not.toContain('storage.objects')
  })

  it('leaves every applied migration byte-for-byte unchanged', () => {
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
    }
    for (const [filename, expected] of Object.entries(expectedHashes)) {
      const bytes = readFileSync(resolve('supabase/migrations', filename))
      expect(createHash('sha256').update(bytes).digest('hex'), filename).toBe(expected)
    }
  })
})
