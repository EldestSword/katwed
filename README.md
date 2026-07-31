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

Version 2 is implemented as a React, Vite and strict TypeScript application. It includes:

- a private controller;
- a read-only 16:9 presentation screen;
- responsive player controls for every supported type;
- a three-panel quiz editor;
- image and YouTube media;
- five progressive image-reveal effects;
- accessible image enlargement;
- a shared question validation and scoring engine;
- a local multi-tab demo repository;
- a forward Supabase migration with server-side validation and scoring.

Demo mode is the quickest way to explore the platform. Production use requires a Supabase project, the migrations and a host account. The new migration is implemented but has not been applied to the project owner’s eventual Supabase instance.

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
| `/host/game/:sessionId/control` | Private host controller | Yes |
| `/host/game/:sessionId/present` | Read-only shared presentation | No |
| `/play/:roomCode` | Player screen | Answer submission only |

The legacy `/host/game/:sessionId` route redirects to `/control`.

Both host routes require host authentication in production. The presentation uses the same authenticated Supabase session as the controller and never exposes host controls.

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

Media can appear on the presentation, player devices or both. YouTube defaults to the presentation. Common `youtube.com`, `youtu.be`, Shorts, Live and embed URLs are normalised to the video ID; arbitrary iframe HTML is never accepted.

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
- pixelated to clear;
- tile uncover;
- zoom out.

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

## Supabase setup and migration

1. Create a Supabase project.
2. Install and sign in to the Supabase CLI.
3. Link this folder.
4. Apply every migration in order:

   ```powershell
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

5. Enable email/password authentication and create a host.
6. Set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   VITE_DEMO_MODE=false
   ```

Migration `202607310001_multiformat_quiz_platform.sql`:

- preserves existing mash-up rows;
- adds common question fields, constrained media, type configuration and protected answer keys;
- adds question options;
- generalises player answer payloads and points;
- replaces quiz save, safe-state and answer-submission RPCs;
- keeps ownership, Row Level Security, phase changes and scoring authoritative in PostgreSQL.

`202607310002_answer_reveals_final_results.sql` adds reveal-only multiple-select metadata, withholds totals until leaderboard or finished phases, and enforces the final-question transition.

The `question-images` bucket accepts JPEG, PNG and WebP files up to 8 MB. Uploads are authenticated and owner-prefixed. Public reads allow account-free players to display current images; generated filenames must not contain answers.

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

The committed `netlify.toml` builds with `npm run build`, publishes `dist`, uses Node.js 20 and redirects application routes to `index.html`.

Add the three public environment variables in Netlify. Do not deploy a real `.env` file.

## Deferred formats and limitations

Typed answer, ordering, matching, polls, word clouds, open response and brainstorming are intentionally deferred. The discriminated question model and constrained JSON configuration can add them without replacing the common question, media or answer tables.

Other current limitations:

- no speed bonuses;
- no remote co-host;
- no automatic media synchronisation;
- no Teams integration;
- aggregate presentation results do not show named individual answers;
- production Supabase migration still requires application and smoke testing against the owner’s project.

## Troubleshooting

- **Supabase is not configured** — add both Supabase variables, or explicitly enable local demo mode.
- **Demo login is missing** — confirm `VITE_DEMO_MODE=true` and restart Vite.
- **Image upload fails** — apply all migrations and use JPEG, PNG or WebP under 8 MB.
- **A player cannot rejoin** — use the same browser origin so its opaque reconnect token is available.
- **Playwright cannot find Chromium** — run `npx playwright install chromium`.
- **Two React Router audit findings** — npm reports the direct and transitive copies for the same RSC-mode advisory. Katwed! is a client-only SPA and does not use React Server Components; do not run a forced downgrade.
