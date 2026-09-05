# Phase 2 release candidate

## Scope and identity

- Production/main baseline (`origin/main`, verified again after validation): `97912b03e5979f5a21e9b589b34677c18735dc19`.
- Supplied Phase 2 base: `7eb000ead70d5eb53188e4ad9a07ec239cb7cb24` (Pass 11 Power-Ups).
- Branch: `phase2/release-candidate`.
- Validated code revision: `31d4c15bd50c35ac2bd0faa1b49f31db8723126b`. The final RC tip is the immediately following documentation-only commit containing this report and the README release link.
- Local validation date: 5 September 2026.

The initial RC was 14 commits ahead of `origin/main`, zero behind, with `origin/main` as its exact merge base. The pre-existing local `main` reference is older (`d4f8240cb20125143c18f4083d9cd8323cd88da6`) and was left untouched. The complete changed-file inventory was inspected. Earlier feature branches were already incorporated and were not merged again. The theme importer version-list extension was intentional; no unrelated artwork, generated output, credentials or production settings were added. Existing untracked artwork remains outside the commits.

This pass does not release the application. Main, hosted Supabase, Netlify and the production database were not changed. No PR, merge or deployment was performed.

The RC adds six commits: four fixes grouped by root cause, one integration-test commit and this documentation commit. Eighteen files changed during integration; the complete inventory appears below.

## Preserved feature inventory

- Visual Pinpoint circles, rectangles and polygons; native Slider controls, value bubble, decimals and mobile interaction.
- All ten question types: Single Choice, Multiple Select, True/False, Slider, Pinpoint, Typed Answer, Ordering, Matching, Connections and exact-pair Mash-up.
- Rounds, optional Round Intro and shuffle within rounds.
- Standard Teams: player choice, balanced random and host assignment; team standings/finals and individual honours.
- Progressive Reveal, Wagers, Buzz-In, animated scores/FLIP movement, deterministic commentary, streaks and Final Awards.
- Survivor, automatic individual tie-breakers and Double Up, 50/50 and Fast Five.
- Portable export v12 and import v1–v12. Live session settings, inventories, wagers, clues, streaks, lives and tie-break state remain excluded.

No new gameplay feature, Audio/Video work, Team Survivor, Team tie-breaker or Buzz rebound was introduced.

## Migration order and security correction

All twelve pending migrations were read in order and remain byte-for-byte unchanged:

1. `20260903203203_visual_pinpoint_targets.sql`
2. `20260903221013_core_rounds.sql`
3. `20260904100005_core_team_mode.sql`
4. `20260904110937_ordering_matching_questions.sql`
5. `20260904122702_connections_questions.sql`
6. `20260904131727_progressive_reveal.sql`
7. `20260904141715_wagers.sql`
8. `20260904151357_correct_answer_streaks.sql`
9. `20260904181607_core_buzz_in.sql`
10. `20260904203000_core_survivor_mode.sql`
11. `20260904223000_automatic_tiebreakers.sql`
12. `20260904223001_core_power_ups.sql`

One forward RC migration follows them: `20260904232901_rc_tiebreaker_rpc_privileges.sql`. Supabase default privileges can grant EXECUTE directly to `anon`; revoking `PUBLIC` alone leaves that separate grant intact. The existing three host tie-break RPCs checked ownership but retained this unnecessarily broad API grant. The forward migration revokes anonymous execution of `host_resolve_tiebreaker`, `host_next_tiebreaker` and `host_reveal_tiebreaker_final`, retaining authenticated access and every existing owner check. See [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api). The original migration was preserved to avoid rewriting the reviewed function chain.

The final audit found no anonymously executable `host_*` RPC. All 15 public tables have RLS. The private tie-break bank, contenders, answers and Power-Up use tables retain FORCE RLS and revoked direct client grants. Fixed security-definer search paths, qualified pgcrypto calls, reconnect-token validation, owner checks and same-session foreign keys remain intact. Tests reject pre-reveal answers/Pinpoint targets, future Connections clues, other players' private state and early tie-break answers/sources.

## Database and old-client evidence

A fresh disposable PostgreSQL 17 database, `katwed_rc_final` on loopback port 55439, applied **all 46 repository migrations from zero** successfully: 33 baseline migrations, the twelve Phase 2 migrations, then the RC grant correction. No migration was skipped and no application predecessor function was pre-populated. This verifies that the successive retained-function patches match the actual chain.

The platform baseline supplied Supabase roles and default table/function/sequence grants, `auth.uid`, minimal Auth/Storage/Realtime structures, a captured `realtime.send`, and real pgcrypto and pgTAP in `extensions`. The first local build lacked the platform's default grants; that omission was corrected and the complete final chain rebuilt from zero before accepting security results.

**All 13 SQL fixtures passed**, with 44 top-level TAP assertions. Twelve fixtures each wrap a larger PL/pgSQL assertion programme in one TAP result; `realtime_scaling_test.sql` has 32. Fixtures: automatic tie-breakers, Buzz-In, Connections, rounds, Ordering/Matching, Pinpoint targets, Power-Ups, Progressive Reveal, Realtime scaling, streaks, Survivor, Teams and Wagers.

The RPC games and load batches ran in the separate disposable `katwed_rc` database with the same complete 46-migration schema. Neither database used production data or a hosted connection.

`supabase/tests/rc_legacy_and_load.mjs` exercises the current main client's JSON answer contract against the upgraded database. It passed owner/non-owner/anonymous repository boundaries, legacy quiz save/list/load, omitted optional settings, Standard launch, join/reconnect, exact-pair Mash-up scoring, question/lock/reveal/leaderboard/explicit finals, restart, close and a complete two-question Head-to-Head game. Legacy sessions stayed Individual Points, with silent rounds, automatic tie-breakers off and Power-Ups off.

Scope: this is a database contract simulation of the current deployed/main frontend, not a hosted Auth login or an old bundle running through PostgREST. An obsolete UUID-array `submit_answer` overload, unused by current main, still fails the modern required answer-payload constraint; its unchanged historical implementation is outside this compatibility claim. Production release verification of the currently deployed frontend remains mandatory.

## Cross-feature games

The added `supabase/tests/rc_cross_feature.mjs` uses final public RPCs, real scoring, constraints and anonymous player roles. Direct timestamp changes only remove idle waiting in this disposable test database. Existing feature browser tests and the new RC browser scenarios provide the corresponding UI coverage.

| Game | Result and evidence |
|---|---|
| A: mixed Standard Individual | Passed seven requested formats across two rounds; authoritative safe state, timers, submissions, fixed/speed/progressive/clue scoring, final totals and reconnect. Existing browser mixed game covers the common host/presentation/player flow. |
| B: Rounds + Teams | Passed four players balanced across two teams, individual contributions/inventories, negative wagers, Ordering/Matching, Connections, round transitions and final team totals. Team browser flows cover assignments, standings and individual honours. |
| C: Progressive + Wager + Power-Up | Passed progressive score, authored Double Score, Wager and positive-only Double Up order. 50/50 stays private and reconnect restores its exact retained options; Fast Five is ineligible. |
| D: Connections + Wager + Double Up | Passed multiple clue stages, authored Double Score, Wager then Double Up; negative values are not doubled. No Fast Five/50/50 eligibility or future clue leakage. |
| E: Survivor + Rounds | Passed three-life game, two rounds, correct/partial/wrong/missing outcomes, spectators and rejected eliminated submissions/assists. |
| F: Survivor + Buzz | Passed living-player gate, one winner, loser/winner reconnect, Reset Buzz, neutral lives/streaks and later normal life damage. |
| G: Survivor + automatic tie-break | Passed surviving ties and tied latest elimination after wipeout, contender-only answers, exact closest result, unchanged lives and truthful host-gated final. |
| H: negative scores | Passed negative individuals and team totals, authoritative ordering and score composition; dedicated animation regression retains minus signs and correct ranks. |
| I: reconnect | Passed ordinary/submitted answers, persisted 50/50, round intro, leaderboard, Buzz winner/loser, eliminated spectator and submitted tie-break contender/spectator. Unsubmitted local wager selection resets on browser refresh as designed. |
| J: Typed correction | Passed Mark Correct/Undo with Wager, authored Double Score and both Double Up/Fast Five, original response time, recomputed streaks/lives and no second consumption. Browser flow verifies resurrection and subsequent wipeout tie. |

Correctness stays separate from positive partial points. Fast Five changes only Speed Scoring's time input; actual response time and award metrics stay unchanged. Double Up applies last to a positive final score only. Tie-break answers never enter ordinary scoring or honours.

## Local concurrency evidence

All checks used disposable synthetic data and 75 simultaneous native PostgreSQL clients. Times are total local batch wall time, not HTTP latency or production capacity measurements.

| Burst | Result | Time | Captured room messages |
|---|---|---:|---:|
| Normal joins | 75 unique players | 3,955.3 ms | 0 |
| Ordinary answers | 75 unique answers, exact 1,000-point scores | 732.6 ms | 0 |
| Wagered answers | 75 accepted, exact wager/totals | 707.0 ms | 0 |
| Buzz claims | 1 winner, 74 write-free losers | 1,732.3 ms | 2 existing winner refresh messages |
| Tie-break answers | 75 unique submissions, deterministic winner | 3,111.8 ms | 2 final transition refresh messages |
| Mixed Power-Up answers | 75 accepted; 50 correct consumptions, real response metrics | 803.5 ms | 0 |
| 50/50 activations | 75 private results with exactly two retained choices; duplicate use rejected | 179.8 ms | 0 |

No deadlock, statement timeout or duplicate answer/use row occurred. The Connections boundary race also passed: an answer holding the lock before clue advance received 1,000 points; clue advance first caused the later answer to receive 500. Local results do not certify hosted Free-plan capacity, quotas, transport or latency.

## Application gates and UI inspection

The complete unit/component suite passed: **167 files, 1,610 tests, zero failures or skips**, using two workers (356.67 seconds). The final complete Playwright run passed **118/118 checks: 59 scenarios in each of `chromium` and `mobile-chromium`, zero failures, skips, retries or flaky results**, using one worker (1,454.06 seconds / 24.2 minutes). Complete typecheck, lint and production build passed; Vite built 257 modules in 12.00 seconds without a bundle-size warning.

The complete application gates use the ordinary repository commands; limiting worker count does not exclude files or change assertions/retries/timeouts:

```sh
npm run test -- --maxWorkers=2
npx playwright test --workers=1
npm run typecheck
npm run lint
npm run build
```

For the native database reproduction, initialise the platform baseline with Supabase default privileges before applying every sorted migration, then execute every `supabase/tests/*_test.sql` with real pgTAP and fail on any `not ok` or exception. The exported legacy, cross-feature, Wager, Buzz, tie-break, Power-Up and Connections concurrency fixtures accept a caller-supplied `pg.Client` factory. Point that factory only at a disposable fully migrated local database; these fixtures create synthetic data and must never be called against production. The database server used here was stopped after validation.

The editor regression creates/edits all ten formats through the actual UI, uploads generated landscape/portrait/square images, verifies contained previews with meaningful height, authors a polygon target, checks Progressive/Buzz exclusivity, duplicates/deletes/reorders/moves between rounds and saves/reloads. Existing editor tests cover H2H restrictions, Wager/Progressive eligibility and invalid Ordering/Matching/Connections definitions.

Presentation and mobile evidence includes the existing dedicated feature scenarios plus RC combined games at 1280×720 and 320 px. Final Awards retain podium priority, deterministic ties and zero-to-three-card behaviour. Biggest Climber uses a separate non-persistent Question 1 baseline, survives round intros and disappears after a later refresh; Survivor omits misleading climb honours. Head-to-Head finals remain unchanged.

Leaderboard tests cover count-up (including negative scores), stable identities, FLIP displacement, reduced motion, marker cleanup, early cancellation and duplicate-poll/refresh suppression. Commentary selects one shared beat, including streaks and Survivor outcomes; ordinary commentary is absent in tie-break results.

## Failure triage and RC changes

- Fresh demo state skipped normalisation on its first read. Later reads normalised new optional fields, making archive/duplicate operations appear to change a definition. Normalising the initial state fixes the two existing regressions without changing gameplay.
- Three host-dashboard fixtures changed quiz IDs without remapping round/question ownership. The fixture now preserves that integrity; import/export assertions remain.
- Restart now intentionally renews the Power-Up run identity; the old exact-settings assertion was updated to require a fresh identity while preserving other settings. Team join expects the normalised optional `powerUps: null` field.
- Existing H2H browser tests expected portable v5 and attempted an unchanged native range fill at its initial midpoint. The test now expects v12 and makes real keyboard range input while still asserting the requested value.
- Realtime SQL structural assertions now include the legitimate Connections/Buzz session fields and permit only the precise own-player lock added by scoring recomputation. Shared session locking and no answer-burst broadcast assertions remain.
- The empty Standard editor advertised nine formats after Connections added the tenth; the copy now reports ten for Standard and nine for H2H.
- Visual inspection found editor image previews pushing the heading above the scrollable frame. A focused geometry assertion reproduced the heading 48 px above the frame. Frame-relative typography/media sizing, contained image tracks and safe centring preserve meaningful image space and keep overflow reachable; live Presentation and Player styles are untouched.
- Survivor final rows inherited a three-column phone podium, leaving a long elimination/points label to squeeze short names into a vertical column. Survivor-specific phone rows now place that detail below the name. The full Presentation Survivor podium also reserves space for its extra subtitle and honours. Narrow geometry assertions cover a readable single-line winner name at 320 px and the honours card within 720 px; Points and H2H styling is unchanged.
- The host tie-break RPC grant correction is described above. No scoring, phase, answer-submission, leaderboard, polling or Realtime implementation was rewritten.

The first full unit run was 1,602 passed / 7 failed of 1,609; all seven were reproduced in the affected 66-test subset and that subset passed after the fixes. An initial parallel browser run exhausted this Windows machine's memory (`ERR_INSUFFICIENT_RESOURCES` and browser crashes); it was stopped and not counted as a completed gate. The first complete serial browser run was 105 passed / 7 failed of 112, with no skips or retries. The stale H2H failures reproduced narrowly; the mixed game passed unchanged on narrow rerun. New RC tests also needed semantic locators and per-player demo reconnect tokens because multiple demo tabs share browser storage. No assertions were disabled, tests skipped, retries added or timeouts blindly increased.

A subsequent browser run was stopped after 33 passes when screenshot review exposed the Survivor final layout defects. The new geometry assertion reproduced the phone defect narrowly before the fix. A new correction test also exposed an immediate-read race in its own fixture; it now awaits the asynchronous correction's authoritative state instead of assuming a click completes that operation.

The next complete run passed 117 of 118 checks. Its sole failure was the new editor test forcing a 1440 px desktop viewport inside phone emulation: native focus panned the wide layout, and the trace repeatedly showed clicks intercepted by unrelated visible elements. The identical failure reproduced in the isolated mobile test. The fixture now uses 390 px for phones and 1440 px for desktop; all image, layout, authoring and persistence assertions remain. Both isolated editor projects then passed (38.2 seconds), before the final complete browser rerun.

### Files changed during integration

| Purpose | Files |
|---|---|
| Demo initial-state correction and restart contract | `src/lib/demo/DemoGameRepository.ts`, `src/lib/demo/DemoGameRepository.test.ts` |
| Editor count and contained preview | `src/routes/QuizEditorPage.tsx`, `src/styles/backstage.css`, `tests/e2e/rc-editor.spec.ts` |
| Survivor final layout | `src/styles/survivor.css` |
| Narrow host tie-break grants | `supabase/migrations/20260904232901_rc_tiebreaker_rpc_privileges.sql`, `supabase/tests/automatic_tiebreakers_test.sql` |
| Updated integrated contracts and negative-score regression | `src/routes/HostDashboardPage.test.tsx`, `src/lib/supabase/teamRepository.test.ts`, `src/components/AnimatedLeaderboard.test.tsx`, `supabase/tests/realtime_scaling_test.sql`, `tests/e2e/smoke.spec.ts` |
| Combined games and old-client/load proof | `supabase/tests/rc_cross_feature.mjs`, `supabase/tests/rc_legacy_and_load.mjs`, `tests/e2e/rc-integration.spec.ts` |
| Release guidance | `README.md`, `docs/phase2-release-candidate.md` |

## Network audit

Final migration triggers retain meaningful session-state refresh and the existing H2H player exception. Ordinary Standard joins/answers, wager submissions, Power-Up answers and explicit 50/50 activation do not broadcast to the room. Buzz claim and final tie-break resolution use their existing state transitions; individual tie-break estimates have no per-answer broadcast.

The browser retains one existing subscription with cleanup and recovery. Healthy safe-state sanity polling remains 45 seconds, unhealthy fallback 3 seconds, with 40 ms event coalescing, one in-flight fetch and a trailing refresh. Existing controller/presentation phase-specific reads and 30-second player presence remain intact. No RC change adds channels, subscriptions, broadcasts, faster polling or additional routine fetches.

## Known limits and release order

The local PostgreSQL baseline does not run hosted Supabase Auth, Storage, PostgREST or Realtime WebSockets. Browser tests use development demo mode. Local SQL proves database state and captured trigger events; it cannot prove managed service capacity or browser-to-hosted-service behaviour. Chromium desktop/mobile emulation does not replace real-device Safari/Android UAT. Existing YouTube/autoplay constraints remain.

Production migration history must be reconciled deliberately before release. Repository main includes prerequisites beyond the older production marker in AGENTS.md, including theme expansions and Realtime scaling. Git ancestry alone does not prove the hosted migration ledger. This pass neither queried nor changed that ledger.

Perform these steps later, after independent RC inspection:

1. Freeze the reviewed release-candidate commit.
2. Create the Phase 2 PR into main.
3. Require GitHub CI to pass.
4. Verify production prerequisites, then deliberately apply the pending Phase 2 database stack in the order above, including the RC grant fix, before frontend merge/deploy.
5. Verify the **currently deployed** Katwed frontend still loads/saves existing quizzes and completes Standard/H2H games against the upgraded DB.
6. Merge and deliberately deploy the Phase 2 frontend.
7. Verify production frontend assets/routes and host access.
8. Run a manual host/player/presentation smoke game.
9. Check Supabase Realtime connections, message rate, errors and database/API load for unexpected behaviour.

Rollback should normally restore the previous frontend while retaining the backwards-compatible database stack. Keep the previous deploy available. Do not attempt destructive down-migrations during a live quiz; investigate and apply a reviewed forward fix for database defects. Do not restart active rooms or discard answers as an incidental deployment action.

## Later production UAT checklist

- [ ] Host login; existing deployed quiz loads and an old quiz saves.
- [ ] Create/save/reload a mixed-format quiz; confirm export v12 and a legacy import.
- [ ] Individual Points: join/reconnect, question/lock/reveal/leaderboard and explicit finals.
- [ ] Teams: assignment, balanced membership, team totals and individual honours.
- [ ] Rounds and intros; Ordering, Matching, Connections clue progression and Pinpoint/Slider interaction.
- [ ] Progressive Reveal, Wager, streaks and all three Power-Ups; no assist in an ineligible state.
- [ ] Buzz winner/loser, host reset and next ordinary question.
- [ ] Survivor life loss, elimination/spectator, Typed correction/undo and truthful wipeout.
- [ ] Automatic tie-break contender/spectator, resolution and deliberate final reveal.
- [ ] Presentation at 16:9; compact Controller preview, response monitor and all host controls.
- [ ] Real 320 px phone: primary actions reachable, no horizontal overflow, reconnect and finals.
- [ ] Awards and podium; restart resets session state/inventory; close room.
- [ ] Realtime/error/load dashboard remains within expected behaviour during a multi-player game.
