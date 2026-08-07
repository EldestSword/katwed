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

Quiz duplication also stays behind this boundary. Both implementations use the same pure clone/remapping helper, reject archived sources, and persist the resulting definition through the existing `saveQuiz` path. Supabase reads through `host_get_quiz` and writes through `host_save_quiz`; no duplication RPC or schema migration is required. Because game sessions are stored separately and are not part of the save input, a duplicate starts without players, answers, scores or an active room, while any source room remains untouched.

Quiz-library title search and sorting are intentionally client-side over the complete Active or Archived arrays already returned by the repository. The dashboard filters the selected library, then applies an explicit deterministic sort using existing `createdAt` and `updatedAt` values. Sort choice is browser-session state; search terms are not sent to Supabase. The frontend is deployed to Netlify; release verification confirmed the public routes, SPA fallback, immutable deploy URL and hosted dashboard bundle. Authenticated production dashboard UAT was not performed because no secure host session was available; helper, component and desktop/mobile browser coverage passed locally before deployment.

Storage Manager also stays behind the repository boundary. The Supabase implementation lists the authenticated host's Storage folder with pagination, sends only strict Katwed-generated candidate paths to a bounded classification RPC, and uses the authenticated Storage API for batched removal. The Demo implementation enumerates and removes blobs in the existing `katwed-demo-images` IndexedDB store. Both return the same Total, In use, Unused and protected report model, and both reclassify immediately before deletion. The migration and matching frontend are deployed; release verification confirmed public route health, SPA fallback, the hosted assets and the `/host/storage` authentication boundary. Authenticated production reporting and cleanup were not exercised because no secure host browser session was available, and no production Storage object was removed during the release.

The Duplicate Quiz frontend is deployed to Netlify. Release verification confirmed the public and host-login routes, SPA routing, immutable deploy URL and production dashboard bundle. Authenticated production duplication UAT was not performed during the release because no secure host browser session was available; repository, component and browser coverage passed locally before deployment.

The Supabase implementation is the proven production backend. Demo mode remains a development and browser-test convenience, not the production data source.

## Generic question engine

`Question` is a strict discriminated union with six current variants: single choice, multiple select, true or false, slider, pinpoint and mash-up. Every variant contains the common prompt, supporting text, timer, points, order, caption, media and visibility settings. Type-specific answer keys exist only on authoring and trusted host/server models. These discriminated question, answer, safe-state and reveal contracts are the main shared extension boundary.

`PlayerAnswerPayload` is a second discriminated union. `scoreQuestion` rejects a payload whose discriminator does not match the active question before applying type-specific validation. PostgreSQL repeats authoritative payload validation and scoring rather than trusting the browser.

The registry provides shared question-type metadata—name, description, icon and classification—and delegates its scoring entry point to the common `scoreQuestion` function. Factories, quiz-editor validation and controls, player rendering, reveal rendering, presentation rendering, TypeScript scoring, and PostgreSQL validation and scoring remain separate but coordinated extension points. A new type should extend those existing boundaries rather than replace the question engine.

The mash-up variant always requires exactly two different active people, both correct, in either order, with no partial credit.

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

Quiz definitions and live game state remain in Supabase PostgreSQL. Uploaded quiz images are stored in the Supabase Storage `question-images` bucket. Production upload, persistence after refresh and display on controller, presentation and player surfaces have been verified. The client already resizes accepted source images to a maximum 1,600-pixel edge and converts them to WebP before upload. GitHub stores code, migrations, demo data and documentation; it is not the live quiz database.

Quiz covers are deployed as nullable quiz-definition metadata. The editor uses the same authenticated JPEG/PNG/WebP validation, resize, WebP conversion, owner-prefixed object path and `question-images` bucket as question images. Covers are intentionally library-only: Active and Archived cards resolve either normal public references or demo IndexedDB references and fall back to the question-count artwork if absent or unavailable. Choosing, replacing or removing a cover updates local editor state and requires the ordinary quiz save; it does not mutate a live game or trigger immediate Storage deletion. Manual authenticated production UAT confirmed upload, preview, Save persistence, dashboard display, editor reload, and Remove plus Save returning to the fallback; archive, duplicate and shared-delete cover behaviour were not part of that manual check.

The quiz lifecycle, covers and Storage Manager are deployed through `202608070003_storage_manager.sql` and the matching Netlify frontend. Active and archived libraries are separate repository queries. Archive and permanent deletion reject quizzes with active rooms, archived quizzes cannot launch, and permanent deletion requires an archived quiz. A database trigger preserves those rules even if an authenticated client attempts a direct row operation.

Permanent deletion is deliberately database-first. The deployed security-definer RPC gathers image references from quiz covers, question media, the retained question image path and choice-option image paths, excludes any exact reference still used by another quiz, then deletes the quiz. Cover sharing uses the same exact-reference comparison without weakening owner, archive or active-room guards. Existing cascades remove its questions, options, game sessions, players and answers. The authenticated browser subsequently accepts only Katwed-generated paths from the configured project's public `question-images` bucket and signed-in host folder for best-effort Storage removal. A Storage failure is reported as cleanup debt rather than misreporting the completed database deletion; Storage Manager provides explicit discovery and cleanup for safe unreferenced objects left by replacement, removal, abandoned uploads or earlier failures.

Duplicated quizzes intentionally retain the same cover, uploaded-image URLs and option-image paths, and preserve YouTube media settings. No Storage upload or file-copy operation occurs during duplication. The exact cross-quiz reference check therefore prevents one duplicate's permanent deletion from removing media still used by the other.

The deployed Storage Manager migration adds an authenticated SELECT policy on `storage.objects` limited to the caller's first folder in `question-images`. Its security-definer classifier accepts at most 200 paths per call, rejects non-owner or non-generated paths, and checks candidate object paths against cover, question JSON media, retained legacy question-image and option-image references across all quizzes without exposing another host's inventory. The browser never deletes `storage.objects` rows directly. After explicit confirmation it repeats classification and sends only the still-unused subset to the authenticated Storage API in bounded batches. Unmanaged objects remain protected, classification uncertainty prevents deletion, and there is no automatic cleanup process.

Questions may also reference normalised YouTube video IDs. Autoplay remains browser-dependent, and cross-device playback synchronisation is a future extension rather than part of the current architecture.

## Realtime model

Database changes to sessions, players and answers trigger refresh broadcasts. Host, presentation and player clients then fetch fresh safe state through the repository boundary. Production tests confirmed that player counts and answer counts update across multiple tabs without manual refresh.

Realtime is a state-refresh signal, not an alternative scoring path: PostgreSQL remains authoritative for typed payloads, reconnect tokens, deadlines, phases and scores.

## Migration discipline

The live Supabase project has applied every migration through `202608070003_storage_manager.sql`. Applied files are immutable history; production changes require a new chronological forward migration.

`202608060001_fix_pgcrypto_schema.sql` explicitly resolves pgcrypto through Supabase's `extensions` schema in `join_room`, `reconnect_player`, `set_player_presence` and `submit_answer`, while retaining `search_path = public`, reconnect-token hashing, grants, RLS, scoring and phase validation.

`202608070001_quiz_archive_lifecycle.sql` is applied to production. The matching archive-lifecycle frontend is deployed on Netlify; release verification confirmed the live routes and deployed bundle, while complete authenticated lifecycle UAT was not automated during the release because no secure host session was available.

`202608070002_quiz_covers.sql` is applied production history. It adds nullable `quizzes.cover_image_path` metadata and replaces `quiz_to_json`, `host_save_quiz` and `host_permanently_delete_quiz` with cover-aware definitions while preserving their existing validation, ownership, lifecycle and grant boundaries. The matching frontend is deployed to Netlify; public routes, deep-link fallback, immutable deploy URL and hosted cover bundles were verified. Subsequent manual authenticated production UAT confirmed upload, preview, Save persistence, dashboard display, editor reload persistence, and Remove plus Save returning to the fallback; archive, duplicate and shared-delete cover behaviour were not part of that check.

`202608070003_storage_manager.sql` is applied production history and is immutable. It adds owner-scoped authenticated listing for the existing `question-images` bucket and the bounded `host_classify_media_paths` RPC. The matching frontend is deployed to Netlify; release verification confirmed public route health, SPA fallback, the immutable deploy URL, hosted Storage Manager assets and the `/host/storage` authentication boundary. Authenticated production reporting and cleanup were not exercised because no secure host browser session was available, and no production Storage object was removed during the release.

## Future extension points

The existing boundaries allow future work without replacing the core model:

- new question discriminators, payloads and reveal types;
- further quiz-library metadata and tags building on the archive lifecycle;
- further image optimisation and optional media reuse;
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
