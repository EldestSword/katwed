# Buzz-In — Phase 2 Pass 8

`buzzInEnabled` is an optional browser-domain boolean with a false default and an explicit value in saved and portable v12 questions. It applies only to Standard Single Choice, Multiple Select, True/False, Slider, Pinpoint, Mash-up, Typed Answer, Ordering and Matching. Connections, Progressive Reveal and Head-to-Head are rejected in editor choices, validation, portable import, database save and launch. Teams, Rounds, Wager, Speed Scoring and Double Score remain valid.

## One atomic winner

Forward migration `20260904181607_core_buzz_in.sql` adds `questions.buzz_in_enabled boolean not null default false` and a complete nullable claim tuple on `game_sessions`: winner player ID, claim time and answer deadline. A composite foreign key proves the winner belongs to the same session. Existing questions and sessions remain ordinary non-Buzz data.

`claim_buzz(room, player, reconnect token)` verifies the player before taking an exclusive lock on the single session row. While holding it, the function rechecks active status, Standard mode, Question phase, the current saved modifier, question opening and closing times. The first valid caller stores the winner and timestamps. Later callers observe the same winner and perform no write. The authoritative deadline is `least(question_closes_at, claimed_at + 10 seconds)`.

Only the winner can submit. Submission must begin strictly before both the Buzz deadline and question close. The retained response time still starts at `question_opened_at`; claiming does not make Speed Scoring or Quickest Thinker faster. The ordinary type validator, scoring, Wager, Double Score, answer insert and player update remain one transaction. With the existing auto-lock setting enabled, the winner's accepted answer locks the question immediately. There is no rebound.

The authenticated host can reset only a current unanswered claim. Reset and answer submission use the same exclusive session lock, so neither can cross the other. Opening another question, entering a round intro, restart, finish and close remove stale claim state. Patches fail loudly when the expected predecessor function or trigger is absent.

## Streaks and safe state

Buzz questions are neutral in both Demo and PostgreSQL. The completed question prefix is filtered by the saved modifier, then eligible positions are numbered again. A correct Buzz answer does not advance a run; a missing, wrong or timed-out Buzz answer does not break it. Score, ranking, Final Awards and correctness statistics keep their existing rules.

Player-safe state exposes only `{ winnerPlayerId, claimedAt, answerDeadlineAt }`, and the browser parser verifies complete timestamps, room membership, eligible current question, valid phase and the question time window. It contains no reconnect token, answer payload, correctness or score. The private host session carries the same public claim state alongside its existing answer monitor.

## Three screens and traffic

Before a claim, Player shows the prompt, permitted media, main question timer, Wager control when configured and one large accessible Buzz button. Answer controls do not exist in the page until an authoritative winning result. The winner sees a confirmation, countdown and the existing controls. Everyone else sees the winner's nickname and Team where applicable, with no answer control. Expiry removes the winner's controls.

Presentation and compact preview show a small open/winner status and countdown. Reveal may name the winner. The controller shows the same state, an eligible answer count of zero or one and a Reset Buzz action only before the winner answers. No new phase, channel, subscription, polling interval or safe-state fetch exists.

A winning claim updates the session once, producing the existing room refresh and controller-topic copy. Losing claims write and publish nothing. Reset produces the same two existing refreshes. An ordinary Buzz answer produces no event unless its existing auto-lock transition changes the session phase.

## Focused verification

Pure rules, Demo authority, safe parsing, repository RPC mapping, editor, Player, Presentation, compact preview, controller, Wager/Team/Round/Streak compatibility and portable v12 have focused unit/component coverage. `supabase/tests/buzz_in_test.sql` covers strict metadata, exclusions, claims, winner-only submission, deadlines, reset, auto-lock, safe state, transport and neutral streaks through the complete migration chain. `buzz_concurrency.mjs` runs 75 simultaneous claims against disposable native PostgreSQL and requires one winner, 74 write-free losers, two existing refresh messages and zero answer rows. Production credentials are neither required nor used.
