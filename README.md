# Katwed!

Katwed! is a live, host-led quiz platform for phones, tablets and shared screens. The deployed release supports seven knowledge-scored question formats:

- single choice;
- multiple select;
- true or false;
- slider;
- pinpoint;
- typed answer;
- the original two-person face mash-up.

The mash-up rule remains strict: players select exactly two different people and score only when both are correct. Order does not matter, and partial credit is never awarded for a mash-up.

## Status

Katwed! version 2 is deployed on Netlify from the `EldestSword/katwed` GitHub repository and uses a live Supabase project. The production setup has been exercised with real host authentication, stored quizzes, uploaded media and multiple player tabs.

### Implemented and production-tested

The hosted application has verified support for:

- a private controller;
- a read-only 16:9 presentation screen;
- responsive phone, tablet and desktop player controls;
- a three-panel quiz editor;
- quiz creation, saving and persistence after refresh;
- Supabase Storage image upload and persistent image display on controller, presentation and player screens;
- real-time player-count and answer-count updates without manual refresh;
- anonymous player joining and reconnect after refresh;
- database-authoritative answer submission and scoring;
- answer reveal and deliberate final-results withholding;
- the controller/presentation window split in the hosted application;
- a shared question validation and scoring engine.

The production migration chain through `202608260001_quiz_answer_palettes.sql` is applied to the live project. A real host account exists, and host sign-in works against Supabase Auth. The matching answer-palette frontend is not deployed by this development change; Netlify releases remain deliberate.

### Implemented and deployed

The active/archive quiz lifecycle is deployed to the production Supabase project and Netlify site. Active quizzes can be archived only after their live room is closed; archived quizzes can be restored or deliberately permanently deleted. Permanent deletion removes relational quiz and game history first, then uses the authenticated Storage client to remove only now-unreferenced Katwed image objects. Shared image references are preserved, and failed Storage cleanup is reported without pretending the database deletion failed.

The production release applied `202608070001_quiz_archive_lifecycle.sql` and deployed the matching frontend. Release verification confirmed the live routes and archive-lifecycle frontend bundle. The complete lifecycle remains covered by local repository and browser tests; authenticated production lifecycle UAT was not automated during this release because no secure host session was available.

### Implemented but environment-dependent

YouTube media is supported, but autoplay depends on browser policy. YouTube controls, branding, adverts and embedding restrictions remain external constraints, and cross-device playback synchronisation is not implemented.

The presentation window can be shared manually through Microsoft Teams or another meeting tool. Katwed! has no Teams API integration and does not require one.

### Duplicate quiz release

Active quizzes can be duplicated from the host library. A duplicate opens directly in its editor with fresh quiz, people-bank, question and choice-option identities, while preserving authored question settings and remapping answer references. It starts without game history or an active room. Uploaded-image references and YouTube settings are intentionally reused; no Storage objects are copied, and shared-reference-safe permanent deletion continues to protect media used by another quiz.

The Duplicate Quiz frontend is deployed to Netlify. The production release verified the public root and host-login routes, SPA routing, the immutable deploy URL and the production dashboard bundle containing Duplicate. Authenticated production duplication UAT was not performed during the release because no secure host browser session was available. The complete flow remains covered by local repository, component and browser tests.

This feature uses the existing authenticated quiz read/save repository path and required no database migration.

### Quiz library search and sorting

Title search, Last edited metadata and deterministic library sorting are deployed to Netlify. Search is case-insensitive, trims the query and filters only the currently selected Active or Archived library. Sorting defaults to most recently edited, with Name A–Z, Name Z–A and Newest created alternatives; the selected sort is retained for the current browser session.

The production release verified the public root and host-login routes, SPA routing, the immutable deploy URL and the hosted dashboard bundle containing the search, clear and sort controls. Authenticated production dashboard UAT was not performed because no secure host session was available. The complete library flow remains covered by local helper, component and desktop/mobile browser tests.

This feature works entirely in the browser over the already-loaded quiz lists and uses the existing `createdAt` and `updatedAt` values. It adds no search endpoint, repository operation or database migration.

### Quiz covers

Quiz covers are deployed to the production Supabase project and Netlify site. Hosts can choose, preview, replace or remove an optional 16:9 library cover in the quiz editor; the change becomes persistent only when the quiz is saved. Active and Archived cards show the stored cover with the existing question-count artwork as a graceful fallback.

Covers use the existing authenticated `question-images` upload pipeline: JPEG, PNG and WebP input up to 8 MB is resized without upscaling to a maximum 1,600-pixel edge and encoded as WebP. Duplicate Quiz reuses the exact stored reference rather than uploading a copy. Archive and Restore retain it, while permanent deletion treats cover references as part of the existing exact cross-quiz shared-media safety check.

The production release applied `202608070002_quiz_covers.sql` and deployed the matching frontend. Release verification confirmed the public root and host-login routes, SPA deep-link fallback, immutable deploy URL and hosted cover controls/rendering bundle. Subsequent manual authenticated production UAT confirmed host access, cover upload and preview, Save persistence, dashboard display, editor reload persistence, and Remove cover plus Save restoring the fallback. Archive preservation, duplicate cover sharing and shared-media permanent deletion were not part of that manual check. The complete cover lifecycle remains covered by local repository, component and desktop/mobile browser tests.

### Storage Manager

Storage Manager is deployed at `/host/storage`. It reports Total, In use and Unused Katwed images for the signed-in host's folder in the existing `question-images` bucket. Legacy or unmanaged objects are included as Other / protected when Storage metadata is available, but are never offered for automatic deletion.

The browser lists only the authenticated host's folder. A bounded security-definer RPC then checks strict Katwed-generated owner/year/UUID WebP paths against cover, question-media, retained legacy question-image and option-image references across every quiz, including other hosts' quizzes. Cleanup is always user-triggered and confirmed; the proposed unused paths are checked again immediately before the authenticated Storage API removes only the still-unused subset. No scheduled or background cleanup exists. Demo mode provides the same report and cleanup flow over the existing IndexedDB image store.

The production release applied `202608070003_storage_manager.sql` and deployed the matching frontend. Release verification confirmed the public root and host-login routes, SPA deep-link fallback, immutable deploy URL, deployed Storage Manager assets and the `/host/storage` authentication boundary. A later manual authenticated cleanup reported 2 images totalling 456.3 KB: 1 in use at 211.6 KB and 1 unused at 244.7 KB. After explicit confirmation the UI reported "1 image was removed." The refreshed report showed 1 total/in-use image at 211.6 KB and 0 unused, and the referenced image remained intact. That manual check did not attempt to manufacture a newly protected or concurrent-reference race; those revalidation paths remain covered by automated tests.

### Per-quiz themes and backgrounds

Each quiz selects one of six built-in audience themes: `katwed`, `midnight`, `sunset`, `arcade`, `mint` or `paper`. Katwed is the default and preserves the existing presentation/player character. Themes apply to the full presentation, compact controller preview, editor audience preview and joined player game screens across phases; host dashboard, editor chrome, Storage Manager, landing and pre-join screens retain the standard Katwed interface. The quiz-editor preview changes immediately, while the ordinary Save quiz action persists the choice.

Each theme also offers three curated built-in 16:9 image backgrounds plus Theme default, which uses no image and preserves the existing themed surface. The editor shows only the current theme's backgrounds. Changing theme clears an incompatible selection rather than choosing a replacement. Backgrounds use trusted static assets under `public/backgrounds/`; they are not uploads, Supabase Storage objects or Storage Manager inventory.

Theme palettes and backgrounds use central typed registries rendered through scoped audience-surface CSS. `themeId` and nullable `backgroundId` travel with quiz definitions and through the player-safe game state without changing answer-key filtering, scoring or phase behaviour. Covers remain separate library metadata. Duplicate preserves both appearance choices alongside the existing independently remapped quiz definition.

The production release applied `202608070004_quiz_themes.sql` and `202608070005_quiz_backgrounds.sql` in order and deployed the matching frontend at `https://katwed.co.uk` with `https://katwed.netlify.app` as the Netlify fallback. Both migrations are now immutable production history.

Authenticated production UAT confirmed host login and existing quiz/editor loading, all six themes, three compatible backgrounds per theme plus Theme default, immediate editor preview, incompatible-theme reset, Save/reload persistence with Arcade + Grid, matching presentation/player rendering through question, submitted/locked, reveal, leaderboard and final results, the controller preview, the `katwed.co.uk` join/QR origin, and Theme default removing the static image after Save/reload. Automated tests continue to cover broader validation, database constraints, normalisation and compatibility behaviour; the manual run did not exercise every theme/background combination or Storage/permanent-deletion scenarios for built-ins.

### Head-to-Head live play

Head to Head is implemented and tested locally as a quiz type, not a question type. A quiz has exactly two named competitors and assigns every existing Katwed question to one of them. Competitors claim their named slot rather than entering a nickname, both answer every question, and either may start and continue the game. The assigned competitor earns exactly one point for a correct answer; the other competitor may play along for no points or explicitly skip. Questions are untimed, reveal automatically only after both players resolve them, and finish with a two-person score and win/draw result.

The editor, duplication remapping and the six deployed question formats remain shared with Standard quizzes. Standard games retain their existing timed host-controlled question, lock, reveal, leaderboard and final-results flow. Head-to-Head presentation and controller views expose the assignment and two-person progress without giving the host Standard phase controls. Reconnect preserves the claimed slot, and safe state withholds answer correctness until reveal.

Head-to-Head live play and quiz import v1 are deployed with production migrations `202608070006_head_to_head_foundation.sql` and `202608070007_head_to_head_live_play.sql`. Authenticated production UAT verified Head-to-Head reveal wording and mobile slider interaction after the follow-up frontend fix. Export was not manually exercised during that production UAT and remains covered by automated tests.

### Quiz import and export

Active and Archived quizzes can be exported as ordinary UTF-8 `.katwed.json` files using the versioned `katwed-quiz` format. The format uses deterministic file-local keys rather than database identities and carries Standard or Head-to-Head definitions, all current deployed question formats, people-bank and answer references, themes, backgrounds, covers and question media settings. It deliberately excludes archive state, timestamps, rooms, sessions, players, submitted answers and scores.

Import treats local JSON as untrusted, enforces a 2 MB limit, rejects unknown structure and unsafe media schemes, remaps every portable reference to fresh UUIDs, then passes the result through the normal quiz validation and existing create-only `saveQuiz` boundary. A valid file receives a spoiler-safe dashboard preview containing metadata only; successful import remains in the Active library rather than opening the answer-bearing editor. Export actions are available in both library views and warn that the downloaded file contains correct answers.

Version 4 is the export target. It adds quiz-wide positional answer palettes to the version 3 Standard speed-scoring, Double Score and tile-grid definition, while the importer remains backward-compatible with versions 1, 2 and 3 and normalises their missing palette to Classic. All versions reference image paths and URLs but do not embed or upload image bytes. See [`docs/katwed-quiz-format-v4.md`](docs/katwed-quiz-format-v4.md) and the companion [JSON Schema](docs/schemas/katwed-quiz-v4.schema.json); the v1-v3 documentation and schemas remain available for existing generators.

Import/export versions 1 and 2 and Typed Answer are deployed. Version 4 exports are implemented and tested, and the required database migrations are applied; the matching frontend still requires a deliberate Netlify release.

### Typed Answer and deterministic tile reveal

Typed Answer uses one primary answer plus up to 19 optional alternatives. Matching applies Unicode NFKC normalisation, lower-casing and removal of every non-letter/non-number character, then requires an exact match. It is intentionally not fuzzy. The player submits a trimmed answer of at most 120 characters; PostgreSQL repeats validation and authoritative scoring for Standard and Head-to-Head games. Only the primary answer is revealed, while alternatives remain secret answer-key data.

The existing 24-tile image reveal now uses a deterministic seeded shuffle derived from the media path and authoritative question-open timestamp. Controller, presentation and player screens therefore reveal the same random-looking order across rerenders and reconnects without using render-time randomness. Timing, reduced-motion behaviour and the existing `tiles` effect ID are unchanged.

Typed Answer and deterministic 24-tile ordering are deployed. Focused authenticated production UAT confirmed saving a Typed Answer, normalised positive matching for `RED-DWARF` against `Red Dwarf`, and rejection of the deliberately wrong `RED-DWARFF` spelling.

### Standard scoring, Double Score and tile grids

New Standard questions default to speed scoring on, while existing questions and all imported v1/v2 questions remain fixed-score unless explicitly changed. Positive scores use a linear 100%-to-50% multiplier across the authoritative question window. Double Score multiplies the existing base score first, followed by speed scaling and integer flooring. Multiple Select partial-wipeout continues to determine its proportional or zero base before either modifier.

Double Score questions have a shared 1.5-second server-timed introduction on player, presentation and compact controller-preview screens. The authoritative opening timestamp is placed after that notice, so the full configured timer remains available, reconnect does not restart the notice, and early answers or host Lock/Finish attempts are rejected.

New tile authoring supports 6-by-6, 8-by-8, 12-by-12 and 16-by-16 grids, defaulting to 8-by-8. Existing tile media without a size retains the deployed 24-tile 6-by-4 layout. All grids keep deterministic per-opening reveal order, total reveal duration, reduced-motion behaviour and image enlargement.

These features are implemented and tested. `202608090002_standard_scoring_and_tile_options.sql` is applied production history. No Netlify deployment was performed during this answer-palette development package.

### Quiz settings, Standard auto-lock and answer palettes

Quiz-wide configuration now opens from **Quiz settings** in an accessible modal, covering quiz type, competitors, theme, background, cover and answer colours. Changes remain part of the editor draft and persist only through the ordinary **Save quiz** action. The permanent right sidebar is question-specific and grouped into Question, Answers, Scoring, and Media & presentation sections.

Standard rooms close answers automatically once every joined player has submitted, using the same authoritative lock transition as the timer and the host's **Close answers now** action. Joined-player count deliberately includes disconnected players, so a missing device cannot cause a premature close and the host retains the manual override. Empty rooms never auto-lock and Head-to-Head behaviour is unchanged.

Each quiz selects one of 17 preset eight-colour palettes or an eight-colour Custom palette. Colours are assigned by final displayed answer position after the shared deterministic option ordering; True uses position 1 and False position 2. Player, presentation, controller preview, reveal and suitable result surfaces share that mapping. Text uses the WCAG relative-luminance contrast ratio to choose controlled near-black or white, with pure black reserved for the narrow colour range where neither preferred foreground reaches AA. Duplicate, Demo/Supabase save and load, safe live state, and portable format v4 preserve the configuration.

### Visual design system, pass 1

The first visual redesign pass establishes reusable foundations without redesigning complete screens. Bricolage Grotesque is bundled locally through `@fontsource-variable/bricolage-grotesque`; there are no runtime font requests to third-party services. Semantic CSS is split into tokens, typography, primitives and visual-lab layout under `src/styles/`, while the existing `global.css` remains the screen-layout layer until later redesign passes.

Shared game primitives now cover positional answer tiles, eight non-colour SVG markers, selected/disabled/locked/correct/incorrect states, image answers, status badges, circular timers, button hierarchy, focus treatment, form controls, surfaces and reduced-motion behaviour. The player and presentation choice/timer paths use the shared primitives while retaining the established safe-state, scoring, deadline, theme, background and answer-palette contracts.

Authenticated hosts can review the system at `/host/design-system` (also linked as **Visual lab** from the host dashboard). The lab changes local specimen state only: it does not save quiz data, call scoring operations or expose answer keys. It demonstrates every theme, positional marker and core state at desktop and mobile widths. This pass adds no database migration and does not change deployment settings.

### Planned

The next phase continues quiz-library and storage management alongside broader visual identity work, further question formats, and formal multi-player load testing. These items are described in [Roadmap](#roadmap).

Demo mode remains the quickest credential-free way to explore the platform locally.

## Local setup

Requirements are Node.js 20.9 or newer, npm and Git.

```powershell
npm install
copy .env.example .env.local
```

Set:

```dotenv
VITE_DEMO_MODE=true
```

Then run:

```powershell
npm run dev
```

Open the host area and choose **Enter demo host area**. Demo authentication and game state are available across tabs in the same browser profile. Demo data is local development data only.

Two demo quizzes are included:

- **The Curious Crew** preserves the original three-question mash-up game.
- **Katwed! Mixed Quiz** covers all seven question types and a deterministic tile-based progressive image reveal.

All names and artwork are fictional and local to the repository.

### Background artwork preparation

Approved local background artwork can be converted into production-ready static assets with `npm run prepare:backgrounds`. Put a lowercase kebab-case PNG, JPEG or WebP source in `artwork/backgrounds-source/`; the command applies orientation, centre-crops to 16:9, limits output to 1920x1080 without upscaling, and writes a quality-82 WebP to `public/backgrounds/`. Large sources are ignored by Git, while finished WebPs are versioned. See [`artwork/README.md`](artwork/README.md) for the workflow and composition guidance.

The 18 approved outputs are registered as three optional built-in backgrounds per quiz theme. They ship as normal static frontend assets and never enter Supabase Storage.

## Live-game routes

| Route | Purpose | Mutating controls |
|---|---|---:|
| `/host/game/:sessionId/control` | Private host controller, normally kept on a second monitor | Yes |
| `/host/game/:sessionId/present` | Read-only shared presentation window | No |
| `/play/:roomCode` | Responsive phone, tablet and desktop player interface | Answer submission only |

The legacy `/host/game/:sessionId` route redirects to `/control`.

Both host routes require host authentication in production. The presentation uses the same authenticated Supabase session as the controller and never exposes host controls. It is intended to be shared as an ordinary browser window through Teams or another meeting tool; no meeting-platform integration is involved.

## Recommended Teams workflow

1. Open the controller.
2. Launch a game.
3. Select **Open presentation window**.
4. Move the presentation to the main monitor.
5. Share only that browser window in Microsoft Teams.
6. Keep the controller on the second monitor.
7. Ask players to join using the room code or QR code.

Katwed! does not integrate with Teams. It provides a browser window designed to be shared through Teams.

## Question types and scoring

### Single choice

Two to eight text, image or mixed options. Exactly one option is correct. Option order may be randomised deterministically for a question.

### Multiple select

Two to eight options, with configurable minimum and maximum selections.

- **Exact set:** all correct options and no incorrect options are required.
- **Partial with wrong-answer wipeout:** selected correct options earn a proportional integer score, but selecting any wrong option awards zero.

### True or false

Large, accessible True and False controls. Visual order is stable.

### Slider

Configurable minimum, maximum, step, answer, tolerance, prefix, suffix and unit. The player sees the current numeric value and can use a keyboard.

### Pinpoint

The player selects normalised `x` and `y` coordinates on a contained image. Scoring uses Euclidean distance from a normalised target and radius, independent of rendered size. Keyboard range controls provide an alternative.

### Typed answer

One primary answer and up to 19 alternatives are matched exactly after Unicode NFKC normalisation, lower-casing and removal of non-letter/non-number characters. This intentionally ignores capitalisation, spaces, punctuation, apostrophes and hyphens without introducing fuzzy or spelling-correction behaviour.

### Mash-up

Uses the optional quiz people bank. Exactly two distinct active people must be selected. The complete pair is required and no partial mode exists.

All points are non-negative integers. Leaderboards are ordered by total score, correct-answer count, correct response time and nickname for deterministic ties. Pending Standard scoring can optionally reduce positive scores from 100% to 50% according to authoritative response time; Head-to-Head remains fixed at one or zero.

## Media

Questions support:

- no media;
- uploaded JPEG, PNG or WebP images;
- a normalised YouTube video ID.

Media can appear on the controller, presentation, player devices or a configured combination. Production image upload, refresh persistence and display across all three screen types have been verified. YouTube defaults to the presentation. Common `youtube.com`, `youtu.be`, Shorts, Live and embed URLs are normalised to the video ID; arbitrary iframe HTML is never accepted.

YouTube playback is deliberately modest:

- normal YouTube controls and branding remain visible;
- autoplay is not promised;
- player devices do not autoplay by default;
- the controller preview is muted;
- browsers may require a click to begin playback;
- ads and embedding restrictions remain subject to YouTube.

Remote playback synchronisation is not implemented.

### Image reveal effects

Images support:

- immediate;
- blur to clear;
- pixelate to clear;
- tile uncover;
- zoom-out.

Progress is calculated from the authoritative question-open timestamp and reveal duration, so open screens converge on approximately the same point. Pending tile-grid authoring supports 6-by-6, 8-by-8, 12-by-12 and 16-by-16; omitted grid metadata retains the historical 24-tile layout. Reduced-motion preferences receive an immediate result.

Images and image answer options have a separate enlargement control. The modal traps keyboard focus, closes with Escape, restores focus and uses `object-fit: contain`. Enlarging an answer image does not select it.

## Architecture

The central discriminated unions live in `src/types/domain.ts`. The question registry, factories, editor validation, player renderers, presentation renderer and scoring module share those types.

Screens use the `GameRepository` contract:

- `DemoGameRepository` persists to local storage and synchronises tabs with `BroadcastChannel`;
- `SupabaseGameRepository` calls narrow RPC functions;
- both use the same TypeScript domain and scoring semantics.

`PresentationStage` is shared by the controller preview and real presentation. The controller never uses an iframe or starts a second audible video.

See [`docs/architecture.md`](docs/architecture.md) for the data flow, safe payloads and extension points.

## Answer-key protection

Before reveal, player-safe state omits:

- correct choice IDs;
- multiple-select correct sets and scoring mode;
- the correct Boolean;
- slider answer and tolerance;
- pinpoint target and radius;
- typed-answer primary and accepted answers;
- mash-up member IDs;
- reveal captions.

The presentation may receive answer options according to visibility settings, but not correctness metadata. Production answers are accepted only through the generic `submit_answer` RPC. The database checks the room, player token, phase, deadline, active question, payload shape, type-specific rules and duplicate submissions before scoring.

Once the game enters `reveal`, player devices always receive and display the actual answer, including choice labels, formatted slider values, both mash-up names and the pinpoint target overlay. Correctness metadata is never placed in the pre-reveal DOM or safe payload.

Leaderboard rows and cumulative player totals are withheld from player-safe state during `question`, `locked` and `reveal`. Non-final questions continue through `reveal → leaderboard → next question`. The final question instead moves from `reveal` directly to `finished` only when the host deliberately selects **Reveal final results**, so no ordinary leaderboard or final total is disclosed early.

The browser never receives a Supabase service-role credential.

## Supabase production and setup

The live Katwed! deployment uses Supabase Auth, PostgreSQL, Storage and Realtime. Host authentication, quiz persistence, image upload, multiplayer updates, anonymous joining, reconnect, scoring and reveal behaviour have all been verified against the real project. Production currently has every committed migration through `202608260001_quiz_answer_palettes.sql` applied. The palette migration was applied only after a dry run showed it as the sole pending file; no Netlify frontend deployment accompanied it.

For a new Supabase environment:

1. Create a Supabase project.
2. Install and sign in to the Supabase CLI.
3. Link this folder.
4. Apply every migration in order:

   ```powershell
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

5. Enable email/password authentication and create a host account.
6. Set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   VITE_DEMO_MODE=false
   ```

### Migration history

Applied production migrations, in order:

```text
202607300001_initial_katwed.sql
202607300002_question_image_storage.sql
202607300003_realtime_broadcast.sql
202607300004_room_and_rpc_hardening.sql
202607310001_multiformat_quiz_platform.sql
202607310002_answer_reveals_final_results.sql
202608060001_fix_pgcrypto_schema.sql
202608070001_quiz_archive_lifecycle.sql
202608070002_quiz_covers.sql
202608070003_storage_manager.sql
202608070004_quiz_themes.sql
202608070005_quiz_backgrounds.sql
202608070006_head_to_head_foundation.sql
202608070007_head_to_head_live_play.sql
202608080001_typed_answer.sql
202608090001_fix_typed_answer_validation_trigger.sql
202608090002_standard_scoring_and_tile_options.sql
202608260001_quiz_answer_palettes.sql
```

`202607310001_multiformat_quiz_platform.sql` preserves existing mash-up rows, adds the generic six-format question model and keeps ownership, Row Level Security, phase changes and scoring authoritative in PostgreSQL.

`202607310002_answer_reveals_final_results.sql` adds reveal-only multiple-select metadata, withholds totals until leaderboard or finished phases, and enforces the final-question transition.

`202608070001_quiz_archive_lifecycle.sql` adds nullable archive timestamps, active and archived library RPCs, archive/restore guards, archive-first permanent deletion, archived-launch rejection and shared-media reference checking. It is applied to the live production schema.

`202608070002_quiz_covers.sql` adds nullable quiz-cover metadata, includes it in authenticated quiz reads and saves, and extends permanent deletion's exact cross-quiz reference check to covers. It is applied to the live production schema and is immutable history.

`202608070003_storage_manager.sql` adds authenticated owner-folder listing for the existing public image bucket and a bounded classification RPC. The RPC validates caller-owned Katwed-generated paths and checks all quiz-cover, question-media, retained legacy question-image and option-image references globally. It classifies only; physical deletion remains an authenticated browser Storage API operation after immediate revalidation. It is applied to the live production schema and is immutable history.

`202608070004_quiz_themes.sql` is applied immutable production history. It adds the constrained, non-null `quizzes.theme_id` definition with a backward-compatible Katwed default, returns it through owner quiz reads and player-safe game state, and extends the existing save function without changing question persistence, scoring or phases.

`202608070005_quiz_backgrounds.sql` is applied immutable production history. It adds nullable `quizzes.background_id`, constrains all 18 curated IDs to their owning themes, and carries safe background metadata through owner reads, saves and player-safe game state. Old-client inserts default to no image; updates preserve an absent compatible background but clear it if an old client changes to an incompatible theme. Explicit null clears the background.

`202608070006_head_to_head_foundation.sql` and `202608070007_head_to_head_live_play.sql` are applied immutable production history. They add the Head-to-Head definition, competitor claims, one-resolution-per-player live play, player-authenticated start/skip/continue operations, exact assigned scoring and the extended safe game state.

`202608080001_typed_answer.sql` and `202608090001_fix_typed_answer_validation_trigger.sql` are applied immutable production history. Together they add the seventh question discriminator, save validation, server normalisation, authoritative Standard/Head-to-Head scoring, a primary-answer-only reveal boundary, and the repaired seven-type validation trigger. Focused production UAT confirmed save, a positive normalised match and a negative wrong-spelling result.

`202608090002_standard_scoring_and_tile_options.sql` is applied immutable production history. It adds backward-compatible false database defaults, owner/safe serialisation, authoritative Standard score modifiers, Double Score opening protection and tile-grid validation.

`202608260001_quiz_answer_palettes.sql` is applied immutable production history. It adds a constrained palette ID and exact eight-colour custom tuple with Classic defaults, wraps the established authenticated quiz read/save boundary, and adds only harmless palette configuration to player-safe state. It does not change answer filtering, scoring, phases or grants.

### Production pgcrypto repair

The first live anonymous-player test exposed `function gen_random_bytes(integer) does not exist`. Supabase had installed pgcrypto in the `extensions` schema, while the hardened RPCs deliberately retained `search_path = public` and called pgcrypto functions without qualification.

The forward migration `202608060001_fix_pgcrypto_schema.sql` corrected `join_room`, `reconnect_player`, `set_player_presence` and `submit_answer` with `extensions.gen_random_bytes(...)`, `extensions.digest(...)` and core PostgreSQL `pg_catalog.encode(...)`. It preserved security-definer behaviour, reconnect-token hashing, explicit grants, RLS, scoring and phase validation.

After application, the real production flow passed anonymous join, reconnect, answer submission, reveal, final-results release and 1,000-point server-side scoring.

### Quiz data and Storage

Live quiz definitions remain in Supabase PostgreSQL. Uploaded quiz images are stored in the Supabase Storage `question-images` bucket; authenticated question-image uploads and display after refresh have been verified in production. Images display on controller, presentation and player screens. Deployed quiz covers use the same pipeline and bucket, but are library-only metadata and are not sent to live-game screens.

Before upload, the browser accepts JPEG, PNG and WebP source files up to 8 MB, resizes them without upscaling so the longest edge is at most 1,600 pixels, and encodes the result as WebP at quality 0.86. Uploads to the `question-images` bucket are authenticated and owner-prefixed. Public reads allow account-free players to display current images; generated filenames must not contain answers.

GitHub is not the live quiz database. It contains the application code, migrations, local demo data and documentation. Storage usage visibility and explicit orphaned-media cleanup are deployed through Storage Manager. Portable quiz import/export is implemented locally without embedding or copying media; future storage work remains planned for further image optimisation and optional media reuse.

Built-in quiz backgrounds are versioned static files under `public/backgrounds/`. They are not stored in the `question-images` bucket, are not counted or classified by Storage Manager, and are never deleted with a quiz.

The production archive lifecycle performs database deletion before best-effort Storage cleanup. It checks quiz covers, question media, the retained question image path and option image paths across other quizzes before returning any candidate object. Only Katwed-generated objects in the configured project's `question-images` bucket and the signed-in host's folder are eligible for automatic removal. Shared images are retained. Failed, replaced, removed or abandoned uploads may remain cleanup debt until a host reviews and explicitly removes eligible unused files through Storage Manager.

Never put a service-role key in a `VITE_` variable.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Production | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Production | Public browser key protected by RLS |
| `VITE_DEMO_MODE` | Local demo only | Must be exactly `true`; ignored in production builds |

## Validation

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run check
npm audit
git diff --check
```

Playwright runs the controller, presentation and three player pages through the mixed quiz, plus representative mobile widths.

## Deployment

Katwed! is deployed successfully on Netlify at `https://katwed.co.uk`, with `https://katwed.netlify.app` as the fallback hostname, and is connected to the `EldestSword/katwed` GitHub repository. HTTPS is valid for the custom domain and `www.katwed.co.uk` redirects to the apex domain. The committed `netlify.toml` builds with `npm run build`, publishes `dist`, uses Node.js 20 and redirects application routes to `index.html`.

Add the three public environment variables in Netlify. Do not deploy a real `.env` file.

During active development, production builds are deliberately controlled through the project owner's Netlify settings to avoid spending deploy credits on every small commit. The intended operating workflow is:

```text
Codex/local changes
→ commit to main
→ push to GitHub
→ no automatic production build during active development
→ test locally
→ manually/reactivate deployment when a production release is wanted
```

This is an operational workflow, not a claim that the repository itself disables Netlify build automation. The live site remains online while new builds are stopped, and future production releases should be deliberate.

## Planning assumptions and load testing

This section records planning assumptions, not guaranteed capacity. The Supabase Free plan has practical limits around database size, Storage, Realtime connections, Realtime message rate and egress. Until formal load testing is complete, treat Katwed! as suitable for small-to-medium private quiz sessions.

Planned test points are approximately 25, 50, 75 and 100 simultaneous players. These room sizes must not be advertised as supported until the relevant tests pass.

## Roadmap

### Quiz library and storage management

Archive, restore, safer permanent deletion, duplicate quiz, Search, Last edited, sorting, Quiz Covers, Storage Manager, Head-to-Head, Typed Answer and portable quiz formats v1/v2 are implemented and deployed. Portable format v4, Quiz settings, answer palettes and Standard auto-lock are implemented and tested; their database migration is applied, while their frontend awaits a deliberate Netlify release. The lifecycle removes relational game history on permanent deletion, safely preserves shared media references and provides explicit review and cleanup of eligible unused Katwed images.

- tags;
- optional media reuse;
- old game-session cleanup;
- further image and storage optimisation controls.

### Themes and visual identity

The six curated per-quiz colour themes and 18 optional built-in backgrounds are deployed and manually production-UAT verified. Theme default supplies the themed surface without a static image, while each theme owns three compatible built-in backgrounds.

Planned work:

- Katwed! typography;
- custom themes.

### Further question formats

Planned further formats:
- ordering;
- matching;
- poll;
- scale;
- word cloud;
- open response;
- brainstorm;
- ranking;
- closest-wins;
- progressive clue formats;
- other future Katwed!-specific formats.

The generic discriminated question model and constrained JSON configuration are intended to support these additions without replacing the common question, media or answer tables.

### Load testing

Formal multi-player load testing is required before advertising larger room capacities.

## Current limitations

- Standard speed scoring and Double Score are pending production release;
- no remote co-host;
- no cross-device YouTube playback synchronisation;
- no Teams integration;
- aggregate presentation results do not show named individual answers.

## Troubleshooting

- **Supabase is not configured** — add both Supabase variables, or explicitly enable local demo mode.
- **Demo login is missing** — confirm `VITE_DEMO_MODE=true` and restart Vite.
- **Image upload fails** — apply all migrations and use JPEG, PNG or WebP under 8 MB.
- **A player cannot rejoin** — use the same browser origin so its opaque reconnect token is available.
- **Playwright cannot find Chromium** — run `npx playwright install chromium`.
- **Two React Router audit findings** — npm reports the direct and transitive copies for the same RSC-mode advisory. Katwed! is a client-only SPA and does not use React Server Components; do not run a forced downgrade.
