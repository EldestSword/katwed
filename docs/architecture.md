# Katwed! architecture

This document describes the **current architecture on `main`**. For current release/migration status, read [`current-production-state.md`](current-production-state.md) first.

Historical feature documents remain useful for detailed design, security and verification evidence, but their pre-release status wording is not authoritative after a feature ships.

## Production topology

Katwed! is a React/Vite client deployed through Netlify. Supabase provides Auth, PostgreSQL, Storage and Realtime.

```text
Authenticated host
  ├─ Library / Studio
  │    ├─ quiz CRUD, archive/restore/delete
  │    ├─ import/export and duplication
  │    ├─ Storage Manager
  │    └─ quiz authoring / preview
  ├─ Game setup: /host/quizzes/:quizId/setup
  ├─ Controller: /host/game/:sessionId/control
  │    ├─ private host controls
  │    ├─ owner-only live response detail
  │    └─ compact PresentationStage preview
  └─ Presentation: /host/game/:sessionId/present
       ├─ read-only audience surface
       └─ only surface that owns shared-game audio playback

Anonymous/player-authenticated contestant
  └─ Player: /play/:roomCode
       ├─ join/reconnect
       ├─ player-scoped answer/session actions
       └─ responsive phone/tablet/desktop UI

GameRepository
  ├─ SupabaseGameRepository → RPCs + Realtime + Storage
  └─ DemoGameRepository → local browser persistence/events
```

The Controller is private and intended for the host's own monitor. The Presentation is read-only and intended to be shared as a browser window through Teams or another meeting product. There is no Teams API integration.

`PresentationStage` is shared by the real Presentation and the Controller preview so both interpret safe game state consistently without an iframe or a second audible media engine.

## Repository boundary

Screens depend on the `GameRepository` contract rather than directly on a storage implementation.

### Supabase implementation

`SupabaseGameRepository` uses:

- authenticated owner RPCs for quiz/session administration;
- anonymous/player-authenticated RPCs for join, reconnect and player actions;
- Realtime broadcast refresh signals for shared game-state transitions;
- Supabase Storage for uploaded quiz images;
- database-authoritative validation/scoring/phase transitions.

### Demo implementation

`DemoGameRepository` mirrors the same domain contracts using browser persistence, locking and browser events so application behaviour can be exercised without credentials.

Demo mode is a development/test convenience, not the production data source.

## Domain model

### Question types

`Question` is a strict discriminated union. The current registry contains ten knowledge-scored variants:

- `single-choice`
- `multiple-select`
- `true-false`
- `slider`
- `pinpoint`
- `typed-answer`
- `mashup`
- `ordering`
- `matching`
- `connections`

The registry in `src/features/questions/registry.ts`, domain types, factories, authoring, safe/reveal serializers, Player renderers, Presentation renderers, TypeScript scoring and PostgreSQL validation/scoring are coordinated extension points. Adding a new type requires extending those boundaries together.

`PlayerAnswerPayload` is also discriminated. TypeScript and PostgreSQL both reject a payload whose discriminator/shape does not match the active question.

### Quiz-level modes and metadata

A saved quiz contains the authored definition, including Standard vs Head-to-Head configuration, rounds, theme/background/palette/media configuration, people-bank data and saved question modifiers that belong in the portable format.

Head-to-Head is a **quiz-level mode**, not a separate question hierarchy. It has exactly two stable competitors and each question is assigned to one competitor. The shared question definitions remain reusable.

Quiz Settings is a portal-rendered, focus-trapped authoring modal operating on the same in-memory draft as the editor. It currently has six quiz-wide sections:

1. Themes
2. Backgrounds
3. Answer colours
4. Cover
5. Game
6. People bank

Closing Quiz Settings neither saves nor discards. The normal `saveQuiz` boundary remains the persistence action.

### Session-level modes

Standard sessions can layer runtime/session configuration such as:

- Individuals or Teams;
- Points or Survivor;
- team assignment strategy;
- Power-Ups enabled/disabled;
- shuffle / answer order seed;
- auto-close behaviour;
- sound/prelude settings;
- tie-break runtime state.

Session-only state is not automatically portable quiz data.

## Standard game flow

Ordinary Standard play uses host-controlled phases around the active question, with round-intro and tie-break phases where applicable.

The normal shape is:

```text
lobby
  → optional round-intro
  → question
  → locked
  → reveal
  → leaderboard
  → next question / next round
  → finished (after explicit final-results reveal)
```

The exact final-question transition preserves Katwed's deliberate final-results withholding; final totals are not exposed merely because the last answer was revealed.

Standard auto-lock feeds the same authoritative lock transition used by the timer and **Close answers now**. It may close when every joined player has submitted, or when the authoritative deadline expires. Empty rooms do not auto-lock. Session configuration may disable the all-submitted behaviour.

## Head-to-Head flow

Head-to-Head uses an untimed two-player loop:

```text
lobby → question → reveal → question … → finished
```

Each named competitor claims one slot and reconnects to that identity. Both resolve each question, but only a correct answer by the competitor assigned to that question earns one point. The other competitor may play along or skip for zero.

Head-to-Head bypasses Standard timed score modifiers and Standard leaderboard/locked flow. Safe state publishes only the information required for the two-player progression and withholds correctness until reveal.

## Rounds and Teams

### Rounds

Standard quizzes contain ordered rounds. A round may have an audience intro. Session shuffle stays within round boundaries. Round intros contain no stale answer/leaderboard information and do not alter the next question's full authored timer.

### Teams

Teams are session state. Players still receive authoritative individual answer/scoring rows; team standings are derived from those scores rather than from a second independent scoring system. Team assignment can be player choice, balanced random or host assignment.

Final team standings use the established authoritative individual totals. Team mode does not weaken player-safe answer boundaries.

## Scoring pipeline

The database is authoritative. TypeScript mirrors expected behaviour for local/test/UI purposes.

For Standard questions, the broad scoring pipeline is:

1. Validate the submitted payload for the active question.
2. Calculate the question-type base result, including explicit partial-credit rules where supported.
3. Apply the question's timing model:
   - Connections uses its clue-based points ladder;
   - Progressive Reveal replaces ordinary Speed Scoring;
   - otherwise Speed Scoring may scale a positive result using authoritative timestamps;
   - fixed-score questions retain their authored base result.
4. Apply authored Double Score where eligible.
5. Apply the Wager adjustment.
6. Apply an eligible armed Power-Up effect such as Double Up; Fast Five modifies only the Speed Scoring time input and 50/50 changes private answer-option availability rather than correctness.
7. Persist authoritative points/correctness/response-time statistics atomically with the accepted answer.

Wager losses can produce negative awarded/cumulative scores. Double Score does not double the Wager stake. Double Up doubles only a positive final result after ordinary scoring and Wager adjustment.

### Multiple Select

Multiple Select supports its explicit exact-set or partial-with-wrong-answer-wipeout behaviour. Mash-up never inherits that partial mode.

### Typed Answer

Typed Answer stores one primary answer plus optional alternatives. Matching uses Unicode NFKC normalisation, lower-casing and removal of non-letter/non-number characters, then exact equality. It is not fuzzy matching.

The owner may accept/undo an incorrect current-question Typed Answer after answers close. The authoritative correction path recalculates the affected scoring/statistics from the original response data rather than trusting UI-computed deltas.

### Connections

Connections reveals an ordered clue list without changing the active question phase/deadline. The score decreases according to how many clues have been revealed. Alternatives remain private answer-key data.

### Pinpoint

Pinpoint submissions are normalised image coordinates. The authored target is a discriminated circle, rectangle or polygon/freehand representation. Correct geometry remains withheld from Players until reveal. Database geometry is authoritative.

## Progressive Reveal

Progressive Reveal is a saved modifier for eligible Standard image questions. Reveal progress derives from the authoritative question-open timestamp rather than per-client local start time.

It replaces ordinary Speed Scoring for that question and uses its own decaying points model. Reduced-motion rendering may use discrete visual steps without exposing the complete image early.

## Wagers

A Player can choose no wager or an allowed percentage before Lock in. The stake is stored with the authoritative answer transaction. Fully correct answers add the stake after ordinary scoring; incorrect/partial answers lose it. Typed Answer corrections reuse the original wager.

Only the private Controller may expose submitted wager detail before results.

## Correct Answer Streaks

Streaks are session statistics derived from authoritative full-correct outcomes. They do not directly change scoring/ranking. Wrong, partial and missing eligible answers break the streak; Buzz-In-neutral positions are excluded according to the implemented rules.

## Buzz-In

Buzz-In uses an atomic server claim. The first valid claimant owns the answer window; there is no rebound. Losing claims do not create answer rows or noisy room broadcasts. Only the winner may submit while the claim is active.

The claim does not replace the ordinary question-open response timestamp used by existing metrics/scoring.

## Survivor

Survivor adds authoritative Player life state to Standard Individual sessions. Full-correct ordinary answers are safe; wrong/partial/missing eligible answers cost a life. Eliminated Players remain connected as spectators but server-side guards reject future competitive actions.

Lives and points are separate systems: ordinary score calculations remain intact while Survivor standings prioritise survival state according to the implemented ranking rules.

Typed Answer corrections can require life-state recomputation.

## Power-Ups

Power-Ups are optional session state with one Double Up, one 50/50 and one Fast Five per Player/run.

- **Double Up** doubles a positive final result after ordinary scoring and Wager.
- **50/50** privately retains the correct Single Choice option plus one deterministic wrong option without identifying which is correct.
- **Fast Five** reduces only the Speed Scoring elapsed-time input by five seconds; real response time remains authoritative for other metrics.

Inventory is private player state. Power-Up use must never leak an answer key through shared safe state.

## Automatic tie-breakers

Supported genuine first-place ties divert into a closest-number tie-break flow using the private audited question bank. Tie-break answers are separate from ordinary quiz answers and use PostgreSQL `NUMERIC` distance calculations.

Tie-break resolution does not mutate ordinary quiz question scoring, streak or life history. Teams, Head-to-Head and unsupported terminal conditions retain their documented non-tie-break behaviour.

The original seeded bank migration is immutable; later RC migrations restrict host control privileges and apply audited content corrections.

## Player-safe state boundary

The player-safe contract is one of Katwed's primary security boundaries.

Before reveal, safe state must remove/withhold answer-bearing data such as:

- correct choice IDs/sets;
- hidden Multiple Select scoring keys;
- the correct Boolean;
- Slider answer/tolerance;
- Pinpoint target geometry;
- Typed Answer primary/alternatives where not yet revealable;
- Mash-up answer member IDs;
- Matching/Ordering answer keys;
- Connections unrevealed clues/accepted alternatives;
- reveal-only captions/metadata.

The demo implementation constructs safe objects deliberately; the Supabase implementation uses server-side serializers. New features must extend both without introducing a "serialize everything then delete a few keys" regression.

Leaderboard rows and cumulative totals are available only in established permitted phases. Final results remain host-gated.

Host-only response detail and Typed Answer review are separate authenticated owner data and never belong in Player-safe state.

## Realtime and polling model

The production realtime-scaling migration is applied.

The model deliberately avoids broadcasting every Standard answer/presence write to every Player:

- shared room broadcasts represent meaningful GameSession transitions;
- Standard joins/answers/routine presence do not fan out as room-wide answer events;
- Head-to-Head retains a narrow Player-change path required for its two-person readiness loop;
- Controller/Presentation use bounded polling plus immediate refresh on relevant session broadcasts;
- Players use Realtime plus a low-frequency sanity refresh and temporary recovery polling after channel failure/timeout;
- shared single-flight scheduling prevents overlapping refresh storms;
- Standard answer transactions use locking compatible with concurrent answer bursts while remaining ordered against conflicting host phase transitions.

Do not reintroduce answer-per-player room fan-out without measuring and justifying the load impact.

## Game audio

Shared game audio is Presentation-owned. Controller preview and Player routes must not create duplicate audible game-audio engines.

A pure mapping layer converts safe game state/prelude/countdown information into event intent. `GameAudioEngine` owns music/sting playback on `/present`, including shuffled multi-variant pack selection and the authoritative Double Score prepared variant/timing relationship.

Sound-pack IDs are registry-backed safe slugs. Asset URLs are not accepted from untrusted quiz/session input.

See [`audio-language.md`](audio-language.md).

## Themes, backgrounds and answer palettes

The current visual catalogue contains 51 themes and 153 theme-compatible backgrounds.

Theme/background IDs are registry-backed trusted values. Unknown or incompatible IDs are normalised/rejected according to the read/save boundary; arbitrary CSS or asset URLs are never persisted as theme definitions.

Built-in backgrounds are static repository assets. Covers and uploaded question images are separate Supabase Storage references.

Answer palettes contain 17 preset eight-colour tuples plus Custom. Option colours are assigned after deterministic display ordering. Foreground text colour is derived from contrast calculations and is not persisted.

See [`visual-theme-language-v2.md`](visual-theme-language-v2.md).

## Import/export

Portable quiz import/export is an application-layer adapter around the normal repository save/read boundaries.

- Export target: **v12**.
- Imports: **v1-v12**.
- Current schema: `schemas/katwed-quiz-v12.schema.json`.

Export maps internal identities to deterministic file-local references. Import treats JSON as untrusted, validates the declared version/schema and relationships, generates fresh internal IDs and then uses the normal create/save boundary.

Portable files do not contain runtime sessions, players, submitted answers or scores. Image references are referenced rather than embedding/copying binary data.

Older version schemas are compatibility contracts and should not be retrofitted with newer-version fields.

## Persistence and media

Production PostgreSQL uses relational columns plus constrained JSONB where appropriate, owner-scoped RLS and narrow functions/RPCs. Security-definer functions must retain explicit authentication/ownership checks, restricted search paths and deliberate grants.

Uploaded images live in the Supabase Storage `question-images` bucket. Browser upload processing validates supported input, bounds size, resizes without upscaling and encodes WebP before upload.

Archive/permanent-delete and Storage Manager operations preserve shared media references. Database deletion and Storage cleanup are intentionally separate so a failed Storage cleanup cannot pretend the relational deletion failed.

Built-in backgrounds never enter Storage Manager.

## Production migrations

Production has 48 applied migrations through:

```text
20260906084106_host_typed_answer_review.sql
```

The exact ledger is maintained in [`current-production-state.md`](current-production-state.md).

Applied migrations are immutable. Schema evolution is forward-only.

## Validation and extension discipline

Architecture-sensitive work should preserve these rules:

- inspect existing boundaries before adding a parallel abstraction;
- extend repository contracts instead of bypassing them from screens;
- keep the database authoritative for competitive rules;
- keep safe state spoiler-free;
- keep Controller/Presentation/Player responsibilities distinct;
- keep Realtime fan-out bounded;
- preserve mobile input/accessibility behaviour;
- add focused unit/component/database/browser coverage at the affected boundary;
- update `README.md`, `current-production-state.md`, this document and any specialist design document when the architecture or production state changes.
