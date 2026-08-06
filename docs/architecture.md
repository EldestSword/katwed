# Katwed! architecture

## Production topology

Katwed! is a React and Vite client deployed on Netlify with Supabase providing Auth, PostgreSQL, Storage and Realtime. The live backend has been proven with authenticated quiz management, persistent images, anonymous players, reconnect, answer submission, scoring, reveal and final-results withholding.

```text
Authenticated host
  ├─ Controller: /host/game/:sessionId/control
  │    ├─ phase-changing GameRepository calls
  │    └─ compact PresentationStage preview
  └─ Presentation: /host/game/:sessionId/present
       └─ read-only 16:9 PresentationStage

Anonymous player
  └─ Player: /play/:roomCode
       └─ typed answer submission and reconnect token

GameRepository
  ├─ SupabaseGameRepository → RPCs, Realtime and Supabase Storage
  └─ DemoGameRepository → local storage and browser events
```

The controller is private and intended for the host's second monitor. Only it can change phases. The presentation uses the same authenticated session, contains no host controls and is intended to be shared as a browser window through Teams or another meeting tool. The player surface is responsive across phones, tablets and desktop browsers. There is no Teams API integration.

`PresentationStage` renders both the full presentation and the controller preview, keeping their visual interpretation of safe state aligned without using an iframe or starting duplicate audible media.

## Repository boundary

Screens depend on the `GameRepository` contract rather than a storage implementation. `SupabaseGameRepository` calls narrow PostgreSQL RPCs and subscribes to live refresh broadcasts. `DemoGameRepository` uses the same domain models, serialises writes with a browser lock, persists to local storage and synchronises tabs through `BroadcastChannel` and storage events.

The Supabase implementation is the proven production backend. Demo mode remains a development and browser-test convenience, not the production data source.

## Generic question engine

`Question` is a strict discriminated union with six current variants: single choice, multiple select, true or false, slider, pinpoint and mash-up. Every variant contains the common prompt, supporting text, timer, points, order, caption, media and visibility settings. Type-specific answer keys exist only on authoring and trusted host/server models.

`PlayerAnswerPayload` is a second discriminated union. `scoreQuestion` rejects a payload whose discriminator does not match the active question before applying type-specific validation. PostgreSQL repeats authoritative payload validation and scoring rather than trusting the browser.

The registry owns human-facing metadata and coordinates factories, editor validation, player renderers, reveal renderers and shared scoring. The mash-up variant always requires exactly two different active people, both correct, in either order, with no partial credit.

## Player-safe state boundary

`SafeQuestion` removes answer-bearing fields for every variant. The demo repository constructs safe objects explicitly rather than deleting keys from an unsafe object. The PostgreSQL safe-state function calls `question_to_json(..., false)` and removes captions and hidden scoring configuration.

Reveal payloads are discriminated and contain only the answer plus anonymous aggregates appropriate to the active type. They are created only in permitted reveal phases. Leaderboard rows and cumulative player totals remain unavailable during `question`, `locked` and `reveal`; the final totals appear only after the host explicitly reveals final results.

This boundary has been production-tested through a complete hosted answer and final-results flow. Anonymous users cannot select protected game tables directly, and the browser never receives a service-role credential.

## Production persistence and media

The PostgreSQL schema uses:

- common relational columns for lifecycle and indexing;
- constrained `media`, `type_config`, `answer_key` and `answer_payload` JSONB;
- relational question option rows;
- check constraints and type-specific validation;
- owner-scoped RLS;
- security-definer RPCs with restricted search paths and explicit grants.

Quiz definitions and live game state remain in Supabase PostgreSQL. Uploaded quiz images are stored in the Supabase Storage `question-images` bucket. Production upload, persistence after refresh and display on controller, presentation and player surfaces have been verified. GitHub stores code, migrations, demo data and documentation; it is not the live quiz database.

Questions may also reference normalised YouTube video IDs. Autoplay remains browser-dependent, and cross-device playback synchronisation is a future extension rather than part of the current architecture.

## Realtime model

Database changes to sessions, players and answers trigger refresh broadcasts. Host, presentation and player clients then fetch fresh safe state through the repository boundary. Production tests confirmed that player counts and answer counts update across multiple tabs without manual refresh.

Realtime is a state-refresh signal, not an alternative scoring path: PostgreSQL remains authoritative for typed payloads, reconnect tokens, deadlines, phases and scores.

## Migration discipline

All committed migrations are applied to the live Supabase project. Applied files are immutable history; production changes require a new chronological forward migration.

The current chain ends with `202608060001_fix_pgcrypto_schema.sql`. It explicitly resolves pgcrypto through Supabase's `extensions` schema in `join_room`, `reconnect_player`, `set_player_presence` and `submit_answer`, while retaining `search_path = public`, reconnect-token hashing, grants, RLS, scoring and phase validation.

## Future extension points

The existing boundaries allow future work without replacing the core model:

- new question discriminators, payloads and reveal types;
- quiz-library metadata, thumbnails, tags and archive state;
- storage accounting, compression, media reuse and orphan cleanup;
- quiz export and import;
- presentation and per-quiz themes;
- old game-session retention and cleanup;
- capacity work informed by formal multi-player load testing.

## Adding a future type

1. Add the discriminator and typed question, safe-question, answer and reveal variants.
2. Add a factory and registry entry.
3. Add editor and runtime validation.
4. Add player and reveal renderers.
5. Add TypeScript scoring and PostgreSQL scoring.
6. Extend database validation and safe-state construction in a new forward migration.
7. Add leakage, unit, component and browser tests.
