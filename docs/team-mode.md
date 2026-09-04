# Core Team Mode

Team Mode is a Standard game-session setting, not a quiz type. The launch form defaults to Individuals and offers Teams only for Standard quizzes. Saved quiz definitions and `.katwed.json` format v7 remain unchanged. Launch-only `teamNames` become canonical `game_teams` records; persisted settings contain `playMode` and `teamAssignmentMode`, without another copy of the names.

## Membership and integrity

Each session has 2–8 teams, named with 1–30 trimmed characters and unique case-insensitively. Display order determines the existing theme accent. A nullable `players.team_id` and composite `(game_session_id, team_id)` foreign key prevent cross-session membership. Only authenticated owners can read the table directly; public lobby/safe-state RPCs return permitted team definitions and membership. Membership writes require the owner RPCs or validated joining path.

- **Player choice:** joining requires a team from the same active room.
- **Balanced random:** the server counts members and chooses a smallest team, using random selection for equal sizes.
- **Host assigns:** joining leaves membership null; the phone waits for assignment.

All joining, host reassignment, balancing and start operations lock the same session row first. At PostgreSQL READ COMMITTED isolation, a waiting join counts membership after the preceding transaction commits. This serialises the short membership operation, including races with start, without changing shared answer-submission locks. Host balance randomly distributes current players across teams with sizes differing by at most one. IDs, names and score statistics are preserved. Start rejects empty Team games and any unassigned player. Membership freezes outside the active lobby, survives reconnect and rounds, and is retained when the host restarts the same game with reset scores.

## Standings and screens

`teamStandings` is pure and sums visible authoritative leaderboard entries using current server membership. It never reads `Player.totalScore`. Team order is combined score descending, correct count descending, total correct response milliseconds ascending, then display order/name. No second scoring pipeline or stored team totals exist. Ordinary individual answer validation, scoring and reveal behaviour remain authoritative in the existing database functions.

`competitionState` adapts stable team IDs and names to the existing ranked-entry display. A separate competition identity keeps Team and Individual histories apart while reusing `useRevealedLeaderboard` unchanged. Round Intro retains the last revealed board; reload has no invented previous board. Commentary uses the existing deterministic selection. Hidden phases, including Answer Reveal, have no team standings.

Presentation groups the lobby by team and uses team standings and podium. The private controller adds labelled assignment selects and Balance teams; Presentation has no membership controls. Phones show their assigned team and highlight that team's leaderboard/final position. Final Results reuse the podium layout with a Team winners heading. Most Correct and Quickest Thinker remain legitimate **Individual honours**; awards receive no individual rank baseline, so Biggest Climber cannot appear. The compact preview suppresses secondary award details through existing compact styles, and phone cards wrap at 320px.

## Release and traffic

The single forward migration is `20260904100005_core_team_mode.sql`, after `20260903203203_visual_pinpoint_targets.sql` and `20260903221013_core_rounds.sql`. It wraps existing RPCs and preserves the old `host_launch_game` and `join_room(text,text)` signatures, Individual defaults, reconnect-token validation and safe-state score gates. Existing rooms backfill as Individuals with null team membership. Head-to-Head cannot launch Teams and keeps its separate controls and scoring.

The intended release order is the reviewed pending database chain, then the matching frontend. This development pass applies nothing to production and performs no deployment.

There are zero extra score writes, broadcasts, subscriptions or room channels. Membership changes use permitted owner RPC writes. The controller refreshes after its own action; existing lobby refresh handles Presentation. Player membership updates through the unchanged focus/visibility/online recovery, room transitions or 45-second healthy sanity refresh (three-second fallback only for an unhealthy connection). No Team-specific poll or safe-state fetch has been added.

## Focused verification

Team calculation, settings, repository, safe-state and UI tests cover validation, all assignment modes, reconnect, balance, start gates, aggregation, privacy, Round Intro history, refresh safety and individual honours. Dedicated `tests/e2e/teams.spec.ts` exercises the three modes, rounds and final results on desktop and mobile, including 320px layouts. `supabase/tests/team_mode_test.sql` runs against the full local migration chain and checks legacy Individual calls, same-session integrity, ownership, grants, score privacy and absence of membership broadcasts. The existing focused Pinpoint, Slider, leaderboard, final and round regressions remain relevant.

Local verification also used a disposable native PostgreSQL 17.10 server with 24 independent connections held behind the session lock: all 24 joins succeeded into eight teams of three. A join racing host balance retained sizes within one, and a join waiting behind host start was rejected without inserting a player. The full migration chain and Team, Rounds and Pinpoint SQL assertions ran against native PostgreSQL as well as PGlite. Auth, Storage and Realtime infrastructure were local fixtures with real pgcrypto; these checks do not constitute a managed Supabase deployment test. Local Supabase Advisor could not connect because the Docker-backed stack was unavailable. Production services were not contacted.
