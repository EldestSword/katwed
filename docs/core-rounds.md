# Core Rounds

`Quiz.rounds` owns ordered `QuizRound` records and every `Question.roundId` references one of them. The editor keeps its existing three panels, grouping its navigator by round. Round controls edit title, subtitle and intro behaviour, reorder rounds and add questions directly into a chosen group. The selected question's Round field moves it to another round; its duplicate stays in its original round. Global numbering follows round order and then within-round question order.

The last round cannot be deleted. A non-empty round cannot be deleted until its questions have been moved elsewhere. Empty rounds can be saved during authoring, but launching requires at least one question per round. Head-to-Head exposes one structural round and retains competitor-driven progression; switching a multi-round Standard draft to Head-to-Head is blocked with instructions to consolidate it first.

## Standard progression

The existing phase sequence stays intact, with `round-intro` added before an enabled round's first question. `host_start_round_game` delegates the new `start-round` action to the private retained `host_change_phase` function. An intro holds the pending question's global index, but stores `current_question_id`, `question_opened_at` and `question_closes_at` as null. Only Start round starts the ordinary question/prelude clock. Lock, reveal, answer submission and repeated start/next actions are rejected in inappropriate phases.

Within a round, play remains Question → Locked → Reveal → Leaderboard → Next question. At a round boundary the controller calls the same Next action labelled **Next round**. Enabled rounds pause on their intro; disabled rounds open immediately. The final question still requires the host's **Reveal final results** action. Restart returns to the lobby with the first round selected and keeps the persisted session shuffle order.

`currentRound` in safe state contains only id, title, subtitle, introEnabled, roundNumber, totalRounds and questionCount. It includes no future question content or answer data. The parser rejects unexpected round fields and rejects live-question/timer data in `round-intro`. Existing cumulative-score and leaderboard gates remain intact. Presentation, compact preview and Player inherit the existing quiz theme/background. Round intros use the audio engine's existing silent fallback.

## Storage and migration

Forward migration `20260903221013_core_rounds.sql` runs once after all earlier migrations, including Visual Pinpoint Targets. It creates `quiz_rounds`, with owner-scoped SELECT RLS and writes restricted to the authenticated save path. Composite foreign keys prevent question/session references across quizzes. Foreign-key indexes support grouped reads and deletion checks. Deferred checks require at least one round and exactly one for Head-to-Head at transaction completion.

Existing quizzes receive exactly one deterministic round: its ID equals the quiz ID in the separate rounds identity namespace, its title is `Round 1`, its subtitle is empty and its intro is disabled. Existing question order, session question order and opening/deadline timestamps are preserved. Existing sessions receive the current question's round, with the default round as fallback. New legacy-client quiz inserts receive the same silent default. Legacy clients can save single-round quizzes; saving a multi-round quiz without round structure fails with a reload instruction, preventing accidental flattening.

The migration patches narrowly matched fragments of retained save, launch, serialisation and phase functions. Missing signatures/fragments fail the migration. Existing sound/theme/Pinpoint/scoring/security wrappers keep their identities and grants. The phase implementation takes an exclusive session lock before checking its phase/index, remaining ordered against the existing shared Standard submission locks. Head-to-Head submission/progression implementations are unchanged.

The existing session broadcast trigger watches `phase` and `current_question_index`, so round-intro and start-round transitions already reach controller, presentation and players. No channels, subscriptions, polling intervals or Standard answer/player broadcasts are added.

This migration is deliberately **not idempotent**: the migration ledger must apply it once. It must not be run repeatedly as an ad hoc script. Deploy this frontend only after deliberate application of its pending migration chain. Production Supabase and Netlify were not changed by implementation.

## Focused verification

The dedicated unit checks cover normalisation, validation, editing helpers, grouping/shuffle, duplicate remapping, Demo phases, safe-state privacy and v7 plus v1–v6 transfer compatibility. `tests/e2e/rounds.spec.ts` covers editor save/reload, intro/start/answer/reveal/next-round across all three screens and direct legacy-style start on desktop and mobile. `supabase/tests/core_rounds_test.sql` exercises retained RPCs, malformed saves, reference constraints, safe metadata, legacy launch, Standard transitions, H2H and ownership in a rollback-only test.

Local SQL verification uses the complete repository migration chain and real PostgreSQL/pgcrypto in a disposable PGlite instance. Auth, Storage and Realtime infrastructure are local fixtures. It additionally seeds a pre-migration live room and checks that migration preserves its exact order and timestamps. It does not claim managed Supabase Realtime delivery or multi-connection contention testing. No full unit or E2E suite is required for this pass.
