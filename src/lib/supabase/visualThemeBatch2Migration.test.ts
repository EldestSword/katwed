import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quizBackgrounds } from '../../features/themes/quizBackgrounds'
import { QUIZ_THEME_IDS } from '../../types/domain'

const migration = readFileSync(
  resolve('supabase/migrations/202608300002_visual_theme_batch_2.sql'),
  'utf8',
)

function sha256(path: string): string {
  const content = readFileSync(resolve(path), 'utf8').replaceAll('\r\n', '\n')
  return createHash('sha256').update(content).digest('hex')
}

describe('Visual Theme Batch 2 migration', () => {
  it('leaves the applied chain and pending Batch 1 migration immutable', () => {
    expect(sha256('supabase/migrations/202608070004_quiz_themes.sql')).toBe(
      'befcb4c70ea6c5ef23f1149a26f00d3c841c1a9a2bcf2ba621d0f632f07456a7',
    )
    expect(sha256('supabase/migrations/202608070005_quiz_backgrounds.sql')).toBe(
      '557982df4fb57a3a4e2af06ff4ab1f117b05f2806084580241eef6f50da5af1d',
    )
    expect(sha256('supabase/migrations/20260828074030_multi_variant_sound_packs.sql')).toBe(
      '91befa3921f47dcb1ad3685cec808dd9341d09189444fea0e0c1343ae56d3d35',
    )
    expect(sha256('supabase/migrations/202608300001_visual_theme_batch_1.sql')).toBe(
      'd155628f2f314d1d2fb662aa4de7ec606479b8acf6bbb2410fa348d1ff8f067e',
    )
  })

  it('expands the controlled theme constraint to the exact 36 registered IDs', () => {
    const constraint = migration.match(/add constraint quizzes_theme_id_check check \(theme_id in \(([\s\S]*?)\)\)/)?.[1]
    expect(constraint).toBeTruthy()
    const ids = [...constraint!.matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(ids).toEqual(QUIZ_THEME_IDS.slice(0, 36))
    expect(ids).toHaveLength(36)
  })

  it('uses one strict 108-pair compatibility matrix for the constraint and save wrapper', () => {
    const matrix = migration.match(/from \(values([\s\S]*?)\) as allowed\(theme_id, background_id\)/)?.[1]
    expect(matrix).toBeTruthy()
    const pairs = [...matrix!.matchAll(/\('([^']+)', '([^']+)'\)/g)]
      .map((match) => [match[1], match[2]])
    expect(pairs).toEqual(quizBackgrounds.slice(0, 108).map((background) => [background.themeId, background.id]))
    expect(pairs).toHaveLength(108)
    expect(migration).toContain('or public.is_quiz_background_compatible(theme_id, background_id)')
  })

  it('builds on the pending Batch 1 save chain and preserves stale-client background behaviour', () => {
    expect(migration).toContain('rename to host_save_quiz_without_visual_theme_batch_2')
    expect(migration).toContain("and not (p_quiz ? 'backgroundId')")
    expect(migration).toContain("jsonb_set(p_quiz, '{backgroundId}', 'null'::jsonb, true)")
    expect(migration).toContain('public.is_quiz_background_compatible(')
    expect(migration).toContain('return public.host_save_quiz_without_visual_theme_batch_2(v_forward_quiz)')
    expect(migration).toContain('grant execute on function public.host_save_quiz(jsonb) to authenticated')
  })

  it('does not alter scoring, phases, player-safe state or anonymous answer submission', () => {
    expect(migration).not.toContain('submit_answer')
    expect(migration).not.toContain('safe_game_state')
    expect(migration).not.toContain('game_sessions')
    expect(migration).not.toContain('player_answers')
    expect(migration).not.toContain('grant execute on function public.host_save_quiz(jsonb) to anon')
  })
})
