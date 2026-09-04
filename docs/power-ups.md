# Core Power-Ups

Power-Ups are an optional Standard session feature, defaulting to **off**. Each player receives one Double Up, one 50/50 and one Fast Five for the entire run, with at most one use per question. There is no sabotage, gifting, refund or replenishment between rounds. Restart clears uses and changes the session's public run identity. Quizzes and portable v1–v12 schemas are unchanged; export remains v12.

## Rules and scoring

- **Double Up:** after ordinary correctness/partial points, Speed Scoring or Progressive Reveal, authored Double Score and Wager, double the final points only when positive. Zero and negative Wager losses stay unchanged. Positive partial Matching points double without becoming correct.
- **50/50:** normal Single Choice questions with at least four options only. Immediate activation consumes the use even if no answer follows. Return exactly the correct option and one wrong option, without identifying which is correct. Choose the wrong option by SHA-256 of session/player/question/option identities. Return IDs in stable ID order; render them in the existing safe option order, preserving labels, colours and IDs. Reconnect restores the same pair.
- **Fast Five:** Speed Scoring questions only, excluding Progressive Reveal and Connections. Feed `max(actualResponseMs - 5000, 0)` to the existing timed calculation. Authored Double Score and Wager keep their existing positions. The answer deadline and stored response time never change. Quickest Thinker, host monitoring and correctness metrics use the actual response.

Double Up and Fast Five are armed locally and can be changed before Lock in. Only the successfully committed answer consumes the selected use. Invalid, duplicate, expired and ineligible submissions roll back the entire transaction. Typed Answer host acceptance/undo reuses the original use and real response time in the same scoring pipeline.

Teams keep individual inventories; modified player scores contribute normally to team totals. Survivor lives still follow authoritative correctness: wrong/partial answers lose lives and eliminated players cannot use assists. Head-to-Head forces the feature off. Buzz-In rejects activation and answer metadata. Tie-Breaker screens and numeric submission contracts stay unchanged.

## Storage, authentication and compatibility

Forward migration `20260904223001_core_power_ups.sql` follows the complete Tie-Breaker migration. It uses fail-loud patches of the hardened predecessor functions. Old clients omit the default-false capability and optional metadata and keep ordinary scoring.

`player_powerup_uses` has same-session player and session-quiz/question foreign keys, a fixed Power-Up ID check, uniqueness on session/player/Power-Up and on session/player/question. Uses carry no duplicate score values. Forced RLS and explicit revokes prevent direct client access. The internal personal-state helper is not executable by client roles.

`activate_fifty_fifty` validates active Standard room, player identity and hashed reconnect token, current question identity, phase, deadline, Survivor eligibility and absence of an answer. A shared session lock protects against host phase/restart changes; a player row lock serialises that player's activations and submissions without serialising all players. Unique constraints enforce both inventory limits. The use and retained IDs commit atomically.

Join/reconnect returns only the authenticated player's use history. The main safe-state payload contains only the enabled flag and run identity, never inventories or retained option metadata. The safe-state parser rejects private inventory keys. React goes through the repository interface; Demo mirrors authentication, scoring, private recovery and restart rules using its existing mutation lock.

## UI and network

The small three-button tray shows availability, eligibility reasons and text-based armed/used states. It fits at 320px above existing answer controls. Arming does not reset answer or Wager drafts. 50/50 clears a selected answer only if removed, preserves surviving choices and restores focus to an available answer when needed. Submitted feedback is personal. Controller and Presentation have no management panel or public activation commentary.

Double Up/Fast Five add no RPC and travel in the normal answer request. 50/50 adds **one explicit activation RPC**. Inventory recovery extends existing join/reconnect responses. There are **zero new channels, subscriptions, polling loops, routine fetches or room broadcasts**. Use inserts have no broadcast trigger, activation is not an answer, and ordinary answer bursts remain silent.

## Focused verification

Use only the Power-Up rule, repository, player component and directly affected scoring/settings/payload/mode tests. `supabase/tests/powerups_test.sql` covers database-first compatibility, security, rollback, score order, modes and recovery on a disposable full migration chain. `powerups_concurrency.mjs` accepts disposable database client factories for 75 mixed authenticated answers and 75 private 50/50 activations, asserting exact consumption, real response metrics, no duplicates/deadlocks and no broadcasts.

`tests/e2e/powerups.spec.ts` covers Double Up/reconnect, exact 50/50 recovery and Presentation privacy, Fast Five's comparable timed scores and actual metrics, and 320px overflow in desktop/mobile Chromium projects. No production database, deployment, full unit suite or unrelated browser suite is part of this pass.

Local verification on 5 September 2026 passed 284 tests across 22 focused unit/component files and six dedicated Demo browser checks. All 45 migrations applied to disposable native PostgreSQL 17; the SQL fixture's assertions passed using local Supabase schema/crypto/broadcast stubs (pgTAP reporting wrappers omitted). The final load run completed 75 mixed answers in 886.4ms and 75 50/50 activations in 152.6ms with all assertions passing. An initial native database process reset during connection setup was retried successfully; these results do not measure hosted Supabase capacity.
