# Correct Answer Streaks — Phase 2 Pass 7B

> **Current production status (6 September 2026): shipped.** Migration `20260904151357_correct_answer_streaks.sql` is applied to production and Correct Answer Streaks are part of the merged Phase 2 frontend. Portable v12 remains current. The remainder of this file preserves the original Pass 7B engineering/verification record; pre-release deployment wording describes that pass at the time it was written. See [`current-production-state.md`](current-production-state.md) for authoritative current status.

Streaks are Standard runtime statistics for Individual games, Teams and Rounds. They are not a question modifier, saved quiz setting or score bonus. Buzz-In questions are streak-neutral: they neither advance nor break a run, and the remaining eligible history is compacted before streaks are calculated. Portable v12 contains only the authored Buzz flag and still excludes runtime streak values. Head-to-Head and the existing three Final Awards remain unchanged.

## Authoritative history

`currentCorrectStreak` counts consecutive completed answers whose authoritative `correct` Boolean is true. `longestCorrectStreak` is the longest such run in the current game. Wrong, partial, missing and timed-out answers break the run. Points never determine correctness: Wager losses, positive partial credit, Progressive decay, Connections stages, Double and Speed retain their existing scoring. Neither statistics nor badges affect ranking or tie ordering.

One forward migration, `20260904151357_correct_answer_streaks.sql`, adds default-zero integer columns `players.current_correct_streak` and `players.longest_correct_streak`, constrained to `current >= 0` and `longest >= current`. Existing rows receive zero values. TypeScript accepts missing legacy fields and normalises both to zero at repository boundaries; malformed/non-integer/negative or inconsistent values are rejected. Individual leaderboard entries carry optional statistics; Team adapters omit them.

The private `recompute_player_streaks(session, optional player, completed count)` helper joins the whole roster against the completed prefix of `question_order`, left joins authoritative answers and calculates runs with a window function. Missing rows count as false. One set-based update writes only changed statistics; it performs no query per player/question. It is inaccessible to PUBLIC, anon and authenticated callers and runs only through trusted Standard host functions holding the existing session lock. Retained patches fail loudly if their expected predecessor is missing.

The existing Reveal → Leaderboard transaction includes the current question. Final Reveal → Finished does the same, without an invisible leaderboard. Early Finish from Question or Locked preserves the last completed statistics. Submission, Locked and Reveal leave streaks unchanged, so safe state exposes only prior completed streaks alongside the existing score/answer gates. Restart resets both; reconnect and Round Intro preserve them.

Typed Answer accept/undo before finalisation changes the answer normally. During Leaderboard, it additionally recomputes that player from authoritative completed history; there is no ad-hoc reversal of a streak. Wager/Progressive scoring, original response time, correctness counts and score deltas remain untouched. Demo implements the same lifecycle with one indexed answer pass and a pure correctness-history utility.

## Feedback and commentary

Individual leaderboard rows show a small readable badge at two or more correct answers. Phones show “Your streak · 3 correct in a row” without replacing Individual/Team rank feedback. Team rows contain no fabricated Team streak. Badges are opt-in for live leaderboards, so Final Results retains its existing structure. Player controls wrap at 320px; presentation and compact preview use the existing theme and animation layout.

`useStreakCommentary` is independent of movement and Final Awards history. It records authoritative pre-leaderboard values for a known question ID/opening, then requires exactly one increment. Eligible milestones are 3, 5 and every subsequent multiple of five. Refreshing directly at a leaderboard has no baseline and announces nothing. Duplicate polls retain the same displayed event; corrections do not start another announcement. History stays in component memory, survives Round Intro and clears on session/lobby/restart/closed/finished boundaries. No localStorage or database commentary history is created.

The pure selection layer chooses one callout: new leader → enters top three → streak 5+ → climb 3+ places → streak 3 → proven top-five overtake. Among simultaneous streak milestones, highest streak wins, then current Individual rank where available, then nickname/player ID. Team movement uses the same priority with individual streaks as another source. Copy is fixed; no random rotation, extra live region or animation framework is added. Existing score count-up, FLIP identities, cancellation and reduced-motion behaviour are preserved.

## Traffic and release

Zero new RPCs, channels, subscriptions, polling, fetches, session state or answer writes. The existing host phase change sends its ordinary room refresh and host-topic copy. Bulk Standard Player updates emit no broadcasts. No scoring/Team aggregation write is added. The existing typed-review refresh path remains unchanged.

The migration supports a database-first release and has been applied only to disposable local PostgreSQL. Main, the hosted database, Netlify deployment and unrelated artwork are untouched. Production release requires the deliberate pending migration chain; this branch is not deployed.

## Focused verification

- 528 unit/component tests across 42 selected files passed in aggregate, including focused correction reruns. A legacy join assertion now expects zero-valued stats, and the phase-only presence assertion waits for reconnect settlement. The added badge/FLIP check passes. No complete unit suite ran.
- Full local migration chain on PostgreSQL 17.10 passed with real pgcrypto and local Auth/Storage/Realtime fixtures. All eight SQL files passed, plus 12 Standard/H2H Pinpoint games and both Connections lock-order checks. Existing Player rows gained only zero statistics.
- SQL covers finalisation, no-answer breaks, partial Matching/Multiple Select, Wager/Progressive/Connections independence, early Finish, Teams/Rounds, reconnect, restart, late accept/undo and safe/host serialisation. It verifies one room phase broadcast plus its host copy, with zero answer/per-player broadcasts.
- 75 players × 100 completed questions, including 75 missing answers: 7,425 answer rows, correct current/longest results, **36.34 ms** local recomputation, zero broadcasts. This is a local performance check, not a production capacity guarantee.
- Four dedicated Streak browser checks passed across desktop/mobile Chromium, including the focused rerun after adding a wait for lobby creation. Individual/Team, three correct, wrong/missing, pre/late review, Round Intro, refresh, final results and 320px overflow checks passed. Phone, 16:9 presentation and controller screenshots were inspected. No unrelated Playwright files ran.
- Typecheck, lint and production build passed. No hosted migration, deployment, PR or merge was performed.

## Files changed

- `README.md`
- `docs/correct-answer-streaks.md`
- `src/components/AnimatedLeaderboard.tsx`
- `src/components/Leaderboard.tsx`
- `src/features/game/PlayerLeaderboard.tsx`
- `src/features/game/PresentationStage.tsx`
- `src/features/game/leaderboardMovement.ts`
- `src/features/game/StreakBadge.tsx`
- `src/features/game/StreakFeedback.test.tsx`
- `src/features/game/streakCommentary.ts`
- `src/features/game/streakCommentary.test.ts`
- `src/features/game/streaks.ts`
- `src/features/game/streaks.test.ts`
- `src/hooks/useStreakCommentary.ts`
- `src/hooks/useStreakCommentary.test.ts`
- `src/lib/demo/DemoGameRepository.ts`
- `src/lib/demo/streaks.test.ts`
- `src/lib/supabase/SupabaseGameRepository.ts`
- `src/lib/supabase/safeGameState.ts`
- `src/lib/supabase/teamRepository.test.ts`
- `src/lib/supabase/streaks.test.ts`
- `src/routes/PlayPage.test.tsx`
- `src/routes/PlayPage.tsx`
- `src/styles/streaks.css`
- `src/test/streakFixtures.ts`
- `src/types/domain.ts`
- `src/utils/scoring.ts`
- `supabase/migrations/20260904151357_correct_answer_streaks.sql`
- `supabase/tests/streaks_performance.mjs`
- `supabase/tests/streaks_test.sql`
- `tests/e2e/streaks.spec.ts`
