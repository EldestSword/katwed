# Katwed current production state

**Status date:** 6 September 2026

This document is the authoritative repository snapshot for **what is currently in `main` and what migrations are applied to the production Supabase project**. It exists because earlier feature documents and release-candidate notes intentionally preserve the state of development at the time they were written.

When an older document says a feature is "pending", "local only" or "not applied" and this document says it is current, **this document wins**.

## Release baseline

Current main-line release history:

- **Phase 2 gameplay expansion merged:** `d7a1895439a1e2bf4a152d57ab04c540bda88a19` on 5 September 2026.
- **Premium Katwed redesign merged:** `cb39a247dad4267649b664fb2069b1c12b99725c` on 6 September 2026.
- **Premium Studio Quiz Settings completion merged:** `168c28870bf48b1103ac681b0b968a041936204f` on 6 September 2026.

The live Supabase project reports **48 applied migrations**, ending at:

```text
20260906084106_host_typed_answer_review
```

There is no currently documented pending migration stack after that migration.

The public production hostname is `https://katwed.co.uk`, with `https://katwed.netlify.app` as the Netlify fallback.

## Current question formats

The question registry contains ten knowledge-scored variants:

| Type | Current | Notes |
|---|---:|---|
| Single choice | Yes | One correct option |
| Multiple select | Yes | Exact set or explicit partial/wrong-answer-wipeout behaviour |
| True or false | Yes | Fixed Boolean choice |
| Slider | Yes | Numeric range/tolerance |
| Pinpoint | Yes | Circle, rectangle and freehand/polygon authoring targets |
| Typed answer | Yes | Primary + alternatives; exact match after normalisation |
| Mash-up | Yes | Exactly two different people; complete pair required; never partial credit |
| Ordering | Yes | Correct sequence |
| Matching | Yes | Pair all items |
| Connections | Yes | Progressive clue reveal with connection answer |

Code-level source of truth: `src/features/questions/registry.ts`.

## Current game/session features

| Feature | Current | Persistence / migration notes |
|---|---:|---|
| Standard quizzes | Yes | Core platform |
| Head-to-Head | Yes | `202608070006`, `202608070007` |
| Speed Scoring | Yes | `202608090002` |
| Double Score | Yes | `202608090002`, timing/audio follow-ups |
| Sound packs / game preflight | Yes | `202608270001` through `20260828074030` |
| Realtime scaling model | Yes | `20260902064111` |
| Visual Pinpoint targets | Yes | `20260903203203` |
| Rounds | Yes | `20260903221013` |
| Teams | Yes | `20260904100005` |
| Ordering / Matching | Yes | `20260904110937` |
| Connections | Yes | `20260904122702` |
| Progressive Reveal | Yes | `20260904131727` |
| Wagers | Yes | `20260904141715` |
| Correct Answer Streaks | Yes | `20260904151357` |
| Buzz-In | Yes | `20260904181607` |
| Survivor | Yes | `20260904203000` |
| Automatic numeric tie-breakers | Yes | `20260904223000` + RC fixes |
| Power-Ups | Yes | `20260904223001` |
| Animated leaderboard movement/commentary | Yes | Frontend/session-safe behaviour |
| Lightweight Final Awards | Yes | Frontend/session-history behaviour |
| Typed Answer host acceptance/undo | Yes | `202608270009`; premium review reader in `20260906084106` |

Session-only configuration such as Teams, Survivor, Power-Ups and tie-break runtime state is deliberately not part of the portable quiz definition unless explicitly documented by the relevant portable version.

## Current authoring/library features

| Feature | Current | Notes |
|---|---:|---|
| Active / Archived libraries | Yes | Archive-first permanent deletion |
| Search / sort | Yes | Client-side over loaded library |
| Duplicate quiz | Yes | Fresh quiz/question/option/people identities; media references reused safely |
| Quiz covers | Yes | 16:9 library metadata using existing image pipeline |
| Storage Manager | Yes | Explicit, revalidated unused-image cleanup |
| Import / export | Yes | Export v12; import v1-v12 |
| Themes | Yes | 51 built-in themes |
| Backgrounds | Yes | 153 compatible built-in backgrounds |
| Answer palettes | Yes | 17 presets + Custom |
| Sound packs | Yes | Quiz/session audio configuration |
| People bank | Yes | Quiz-wide Mash-up roster |
| Six-section Quiz Settings | Yes | Themes, Backgrounds, Answer colours, Cover, Game, People bank |
| Premium Studio/editor layout | Yes | Current host authoring UI |
| Premium host controller | Yes | Current private production-console UI |
| Premium public homepage | Yes | Current public landing presentation |
| Typed Answer review panel | Yes | Owner-only incorrect-response review after answers close |

Quiz Settings is quiz-wide draft state. Closing the modal does not save or discard; the normal **Save quiz** action remains the persistence boundary.

## Current appearance/media catalogue

- **51 themes**.
- **153 theme-compatible built-in backgrounds**.
- **17 preset eight-colour answer palettes**, plus Custom.
- Uploaded quiz images use the Supabase `question-images` bucket.
- Built-in backgrounds are static repository assets and are never Storage Manager objects.
- Question media supports uploaded images and normalised YouTube video IDs.
- Image treatments include immediate, blur, pixelate, tiles and zoom-out.
- Progressive Reveal uses the authoritative question-open timestamp and its own scoring behaviour.

## Current portable format

- **Export target:** v12.
- **Import compatibility:** v1-v12.
- Current schema: `docs/schemas/katwed-quiz-v12.schema.json`.
- Current notes: `docs/katwed-quiz-format-v12.md`.

Older format documents and schemas are compatibility contracts. They should remain unchanged unless a defect is found in the documentation of that specific historical version.

## Production migration ledger

The production Supabase project currently reports these 48 migrations in order:

```text
202607300001_initial_katwed
202607300002_question_image_storage
202607300003_realtime_broadcast
202607300004_room_and_rpc_hardening
202607310001_multiformat_quiz_platform
202607310002_answer_reveals_final_results
202608060001_fix_pgcrypto_schema
202608070001_quiz_archive_lifecycle
202608070002_quiz_covers
202608070003_storage_manager
202608070004_quiz_themes
202608070005_quiz_backgrounds
202608070006_head_to_head_foundation
202608070007_head_to_head_live_play
202608080001_typed_answer
202608090001_fix_typed_answer_validation_trigger
202608090002_standard_scoring_and_tile_options
202608260001_quiz_answer_palettes
202608270001_quiz_sound_pack
202608270002_double_score_intro_five_seconds
202608270003_game_preflight_session_settings
202608270004_fix_wrapped_submit_answer_search_path
202608270005_fix_public_submit_answer_search_path
202608270006_qualify_legacy_submit_answer_digest
202608270007_qualify_all_submit_answer_overloads
202608270008_refresh_session_and_quiz_readers
202608270009_host_intelligence_and_typed_overrides
202608270010_bound_host_response_serialisation
20260828074030_multi_variant_sound_packs
202608300001_visual_theme_batch_1
202608300002_visual_theme_batch_2
202608300003_visual_theme_batch_3
20260902064111_realtime_scaling_free_tier
20260903203203_visual_pinpoint_targets
20260903221013_core_rounds
20260904100005_core_team_mode
20260904110937_ordering_matching_questions
20260904122702_connections_questions
20260904131727_progressive_reveal
20260904141715_wagers
20260904151357_correct_answer_streaks
20260904181607_core_buzz_in
20260904203000_core_survivor_mode
20260904223000_automatic_tiebreakers
20260904223001_core_power_ups
20260904232901_rc_tiebreaker_rpc_privileges
20260905081403_rc_tiebreaker_content_audit
20260906084106_host_typed_answer_review
```

Applied migrations are immutable production history. Never edit one in place.

## Important security and behaviour invariants

These remain non-negotiable across future work:

- Mash-up always requires **exactly two different people** and awards **no partial credit**.
- Player-safe state must not reveal answer keys before the permitted reveal phase.
- Leaderboard rows/cumulative totals must stay within their established permitted phases.
- Final results remain explicitly revealed rather than leaking automatically.
- Database validation is authoritative for answer payloads, scoring, deadlines and phase transitions.
- The browser must never receive a service-role credential.
- Host-only response detail and Typed Answer review must never enter player-safe state.
- The three-surface model remains private Controller, read-only Presentation and responsive Player.
- Production migrations are forward-only.

## Documentation roles

### Current sources of truth

- `README.md` - product/repository overview.
- `docs/current-production-state.md` - release/deployment/migration status.
- `docs/architecture.md` - current architecture.
- `AGENTS.md` - mandatory coding-agent rules.
- `CONTRIBUTING.md` - development workflow.

### Historical release evidence

- `docs/phase2-release-candidate.md`.
- `docs/premium-complete.md`.
- `docs/premium-release-checklist.md`.
- Feature implementation/verification records such as `core-rounds.md`, `team-mode.md`, `ordering-matching.md`, `connections.md`, `progressive-reveal.md`, `wagers.md`, `correct-answer-streaks.md`, `buzz-in.md`, `survivor-mode.md`, `power-ups.md` and `automatic-tiebreakers.md`.

Those historical documents may contain pre-release language because they record the development pass. Their architecture/security detail remains useful; their deployment-status wording is superseded by this file.

## Updating this document

Update this file whenever any of the following changes:

- a migration is applied to production;
- a feature is merged/released or deliberately withdrawn;
- the portable export target changes;
- the question registry changes;
- the theme/background catalogue size changes;
- production topology, deployment domains or safety boundaries change.

Do not make future agents reconstruct current state from commit archaeology when this file can state it directly.
