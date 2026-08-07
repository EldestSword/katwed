# Katwed!

Katwed! is a live, host-led quiz platform for phones, tablets and shared screens. It supports six knowledge-scored question formats:

- single choice;
- multiple select;
- true or false;
- slider;
- pinpoint;
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

The production migration chain through `202608070001_quiz_archive_lifecycle.sql` is applied to the live project. A real host account exists, and host sign-in works against Supabase Auth.

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

### Planned

The next phase focuses on quiz-library and storage management, followed by themes and visual identity, further question formats, and formal multi-player load testing. These items are described in [Roadmap](#roadmap) and are not yet production features.

Demo mode remains the quickest credential-free way to explore the platform locally.

## Local setup

Requirements are Node.js 20 or newer, npm and Git.

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
- **Katwed! Mixed Quiz** covers all six question types and a tile-based progressive image reveal.

All names and artwork are fictional and local to the repository.

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

### Mash-up

Uses the optional quiz people bank. Exactly two distinct active people must be selected. The complete pair is required and no partial mode exists.

All points are non-negative integers. Leaderboards are ordered by total score, correct-answer count, correct response time and nickname for deterministic ties. There is no speed bonus.

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

Progress is calculated from the authoritative question-open timestamp and reveal duration, so open screens converge on approximately the same point. Reduced-motion preferences receive an immediate result.

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
- mash-up member IDs;
- reveal captions.

The presentation may receive answer options according to visibility settings, but not correctness metadata. Production answers are accepted only through the generic `submit_answer` RPC. The database checks the room, player token, phase, deadline, active question, payload shape, type-specific rules and duplicate submissions before scoring.

Once the game enters `reveal`, player devices always receive and display the actual answer, including choice labels, formatted slider values, both mash-up names and the pinpoint target overlay. Correctness metadata is never placed in the pre-reveal DOM or safe payload.

Leaderboard rows and cumulative player totals are withheld from player-safe state during `question`, `locked` and `reveal`. Non-final questions continue through `reveal → leaderboard → next question`. The final question instead moves from `reveal` directly to `finished` only when the host deliberately selects **Reveal final results**, so no ordinary leaderboard or final total is disclosed early.

The browser never receives a Supabase service-role credential.

## Supabase production and setup

The live Katwed! deployment uses Supabase Auth, PostgreSQL, Storage and Realtime. Host authentication, quiz persistence, image upload, multiplayer updates, anonymous joining, reconnect, scoring and reveal behaviour have all been verified against the real project. Production currently has every migration through `202608070001_quiz_archive_lifecycle.sql` applied.

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
```

`202607310001_multiformat_quiz_platform.sql` preserves existing mash-up rows, adds the generic six-format question model and keeps ownership, Row Level Security, phase changes and scoring authoritative in PostgreSQL.

`202607310002_answer_reveals_final_results.sql` adds reveal-only multiple-select metadata, withholds totals until leaderboard or finished phases, and enforces the final-question transition.

`202608070001_quiz_archive_lifecycle.sql` adds nullable archive timestamps, active and archived library RPCs, archive/restore guards, archive-first permanent deletion, archived-launch rejection and shared-media reference checking. It is applied to the live production schema.

### Production pgcrypto repair

The first live anonymous-player test exposed `function gen_random_bytes(integer) does not exist`. Supabase had installed pgcrypto in the `extensions` schema, while the hardened RPCs deliberately retained `search_path = public` and called pgcrypto functions without qualification.

The forward migration `202608060001_fix_pgcrypto_schema.sql` corrected `join_room`, `reconnect_player`, `set_player_presence` and `submit_answer` with `extensions.gen_random_bytes(...)`, `extensions.digest(...)` and core PostgreSQL `pg_catalog.encode(...)`. It preserved security-definer behaviour, reconnect-token hashing, explicit grants, RLS, scoring and phase validation.

After application, the real production flow passed anonymous join, reconnect, answer submission, reveal, final-results release and 1,000-point server-side scoring.

### Quiz data and Storage

Live quiz definitions remain in Supabase PostgreSQL. Uploaded quiz images are stored in the Supabase Storage `question-images` bucket; authenticated uploads and display after refresh have been verified in production. Images display on controller, presentation and player screens.

Before upload, the browser accepts JPEG, PNG and WebP source files up to 8 MB, resizes them without upscaling so the longest edge is at most 1,600 pixels, and encodes the result as WebP at quality 0.86. Uploads to the `question-images` bucket are authenticated and owner-prefixed. Public reads allow account-free players to display current images; generated filenames must not contain answers.

GitHub is not the live quiz database. It contains the application code, migrations, local demo data and documentation. Future storage work is planned for further image and storage optimisation, optional media reuse, orphaned-media cleanup, storage-usage visibility and quiz export/import.

The production archive lifecycle performs database deletion before best-effort Storage cleanup. It checks question media, the retained question image path and option image paths across other quizzes before returning any candidate object. Only Katwed-generated objects in the configured project's `question-images` bucket and the signed-in host's folder are eligible for automatic removal. Shared images are retained; failed or legacy cleanup remains recoverable through the planned orphan-media tooling.

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

Katwed! is deployed successfully on Netlify, connected to the `EldestSword/katwed` GitHub repository. The committed `netlify.toml` builds with `npm run build`, publishes `dist`, uses Node.js 20 and redirects application routes to `index.html`.

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

Archive, restore, safer permanent deletion and duplicate quiz are implemented and deployed. The lifecycle removes relational game history on permanent deletion and safely preserves shared media references. Planned work now extends that foundation:

- general orphaned-media discovery and cleanup;
- quiz thumbnails;
- tags;
- storage-usage visibility;
- quiz export and import;
- optional media reuse;
- old game-session cleanup;
- further image and storage optimisation controls.

### Themes and visual identity

Planned work:

- Katwed! typography;
- a background system;
- presentation themes;
- per-quiz colour themes;
- quiz cover images;
- answer-card styling.

### Further question formats

Planned formats:

- typed answer;
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

- no speed bonuses;
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
