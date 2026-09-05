# Automatic Tie-Breakers

Automatic Tie-Breakers are session endgame gameplay for Standard Individual Points and Survivor games. They are not quiz questions, modifiers, rounds or portable quiz content. Katwed portable files remain version 12.

## Endgame rules

Points mode starts a tie-breaker when two or more players share the highest final `totalScore`. Correct-answer count, cumulative response time, nickname and ID do not avoid that tie. Survivor starts one when two or more living players share the highest life count. In a total wipeout, it uses the players tied at the latest `survivorEliminatedAtQuestion`. A single living player wins normally.

Each round lasts 20 seconds and accepts one signed integer or decimal estimate per finalist, transported as a validated decimal string with an absolute magnitude no greater than `1e15`. PostgreSQL `NUMERIC` calculates absolute distance from the bank answer. The lowest distance wins; equal distance uses the lowest authoritative response time. Equal distance and equal response time remain unresolved, so only those players continue. A sole submitter beats missing answers, while no submissions continue the full contender group.

The winning player moves to rank one in the final authoritative leaderboard. Other players retain their relative order and all ranks remain unique. Tie-break answers never enter `player_answers` and never change score, correct count, cumulative correct-response time, streaks, Survivor lives, elimination history or Final Awards. Total Wipeout remains the final headline and identifies the tie-break winner beneath it.

Teams and Head-to-Head are excluded. Emergency Finish from Question, Locked or a non-final Reveal keeps the historical direct-finish behaviour.

## Private researched bank

`docs/data/tiebreaker-bank-v1.json` is the non-runtime audit copy of the supplied 200-question research file. Migration `20260904223000_automatic_tiebreakers.sql` seeds all IDs `TB001`–`TB200` into `tiebreaker_questions`. The runtime table has forced RLS, no player policy and revoked public, anonymous and authenticated table access. Browser code never imports the audit JSON.

The server chooses from enabled, unused rows by a stable SHA-256 ordering of session ID, round and question ID. A category different from the previous round is preferred before the stable hash order. Used IDs stay on the session and restart clears them. Selection fails if the bank is exhausted.

Before `tiebreaker-result`, public and host views receive the prompt, unit, contenders, timestamps and submitted count only. Player-safe parsing rejects answer, result, source, ordinary-question, reveal or leaderboard data in the open phase. Public result state includes the correct value, guesses, absolute errors, response times and outcome. Research source metadata appears only in the private host result.

## Database-first and live updates

`automatic_tiebreakers_enabled` defaults to false in PostgreSQL. A frontend deployed before this migration omits the launch field and always receives the old direct Final Results flow. This frontend explicitly sends true for supported Standard Individual sessions; the server forces false for Team and Head-to-Head launches.

Contender membership and estimates use private tables with same-session foreign keys and one answer per player and round. The submission RPC checks the active phase, room, reconnect-token digest, contender membership, current deadline, numeric grammar and duplicate constraint while holding the session lock. The final required answer may resolve the round in the same transaction.

Entering a tie-breaker, revealing its result, opening another round and revealing Final Results update the existing game-session row and therefore reuse the existing room/controller refresh channel. Individual estimate inserts produce no broadcast. The controller and presentation reuse the current question-like safety poll cadence during the open phase; players use the authoritative deadline locally. No new channel, subscription, fetch loop or Realtime trigger was added.

## Focused verification

The dedicated unit and component tests cover Points and Survivor tie detection, exact decimal resolution, fastest equal-distance fallback, unresolved continuation, missing answers, final ordering, parser spoiler rejection, reconnect lock state, player/spectator/presentation/controller screens, compact result behaviour and Total Wipeout copy. The SQL fixture covers all 200 bank rows, table/function privileges, old-client capability fallback, mode exclusions, authentication failures, deadlines, duplicates, no-repeat/category preference, statistical neutrality, ranking, restart and existing broadcast counts. A separate disposable-database check submits 75 authenticated contender estimates concurrently and verifies 75 unique rows, deterministic resolution and only the existing result-phase refresh.
