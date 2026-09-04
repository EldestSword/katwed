# Core Survivor Mode

Survivor is a launch-time Game Mode for a normal Standard quiz. It does not alter the saved quiz definition, question types or portable schema. Hosts choose Points or Survivor before opening a lobby. Points remains the default; Survivor V1 is individual-only and starts every Player with either one or three lives, with three as the default. Team and Head-to-Head launches are rejected when Survivor is requested.

## Authoritative life history

PostgreSQL stores the resolved session mode, starting lives, each Player's remaining lives and the actual one-based session question where elimination occurred. The private `recompute_survivor_state` function scans the bounded completed portion of the session's authoritative question order. For every ordinary question it reads only `player_answers.correct`:

- fully correct costs no life;
- wrong, partial or missing costs one life;
- Buzz-In questions are removed from damage history for the winner and every non-winner.

Lives never fall below zero. Elimination is recorded at the actual session question position where cumulative damage first reaches the starting-life count. Points, Wager outcome, Progressive Reveal value, Connections clue value and Streaks do not decide damage. Existing scoring and correct-answer metrics continue unchanged.

The host's transition to Leaderboard finalises the current question. On the final question, Reveal to Final Results performs the same calculation first. Finishing from Question or Locked excludes the unresolved question; finishing from Reveal includes it. Lives therefore expose only previously completed results and cannot reveal current correctness early.

Typed Answer accept or undo on an already displayed Leaderboard reruns the affected Player's complete bounded history. A correction can restore a life and clear elimination, or an undo can eliminate the Player again, without separate life-editing controls.

## Spectators, eligibility and terminal play

An eliminated Player remains in the room and receives safe question, reveal and standings state. Submission and Buzz claim functions reject that Player after reconnect-token validation. The public `eligibleResponderCount` uses alive Players for an ordinary Survivor question, zero before a Buzz winner and one afterwards. Controller auto-close and submitted counts therefore ignore spectators. Round Intro preserves current lives, while Restart restores the configured starting lives and clears elimination.

After a Leaderboard leaves zero or one Player alive, the server rejects Next Question. The host must reveal the final result from that terminal board. One alive Player is the last player standing; zero is a valid total wipeout. A natural final question may leave several survivors and still produces a Survivor winner from the final standings.

## Standings and presentation

Both PostgreSQL and the Demo repository produce the same deterministic order:

1. alive Players before eliminated Players;
2. more remaining lives among alive Players;
3. later elimination question among eliminated Players;
4. total score;
5. correct-answer count;
6. lower total correct-response time;
7. nickname and stable Player ID.

The shared Animated Leaderboard retains stable Player IDs, score count-up and row movement, with compact `3 LIVES`, `1 LIFE` and `OUT` metadata. Client-only history emits at most one witnessed elimination callout and cannot invent one after refresh. Final Results show survival-first podium details and retain Most Correct and Quickest Thinker honours; Biggest Climber is omitted for Survivor.

## Compatibility and transport

Forward migration `20260904203000_core_survivor_mode.sql` follows Core Buzz-In. Old launch calls omit the new settings and create Points sessions. Existing rows receive harmless Points/zero-life defaults, and public RPC signatures stay unchanged. The migration uses existing session phase refreshes only: it creates no Realtime channels, subscriptions, polling changes, additional safe-state reads or Player-level broadcasts.

Portable quiz import/export remains version 12 because Survivor state belongs only to a live session. The migration must be released before its matching frontend and remains deliberately unapplied to production until that release is authorised.
