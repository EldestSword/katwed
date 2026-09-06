# Katwed!

Katwed! is a live, host-led quiz platform for phones, tablets and shared screens. It is built with React/Vite, deployed through Netlify and backed by Supabase Auth, PostgreSQL, Storage and Realtime.

This README describes the **current `main` / production-era feature set**. Historical release-candidate and implementation documents are kept under `docs/` as engineering evidence; when they describe a feature as "pending", the current production-state document takes precedence.

See [`docs/current-production-state.md`](docs/current-production-state.md) for the compact source of truth covering deployed features, production migrations and release history.

## Current status

- Phase 2 was merged to `main` on 5 September 2026 in commit `d7a1895439a1e2bf4a152d57ab04c540bda88a19`.
- The premium homepage/Studio/controller redesign was merged on 6 September 2026 in commit `cb39a247dad4267649b664fb2069b1c12b99725c`.
- The six-section premium Studio Quiz Settings hotfix was merged on 6 September 2026 in commit `168c28870bf48b1103ac681b0b968a041936204f`.
- The production Supabase project has **48 applied migrations**, ending at `20260906084106_host_typed_answer_review`.
- The portable quiz format exports **v12** and imports **v1-v12**.
- The audience catalogue contains **51 themes** and **153 built-in backgrounds**.

The production site is `https://katwed.co.uk`, with `https://katwed.netlify.app` as the Netlify fallback.

## Question formats

Katwed currently has ten knowledge-scored question formats:

1. **Single choice** - choose one correct option.
2. **Multiple select** - choose the complete correct set, with exact-set or explicit partial/wrong-answer-wipeout scoring.
3. **True or false** - two fixed Boolean choices.
4. **Slider** - choose a numeric value within authored range/tolerance rules.
5. **Pinpoint** - select a position on an image using circle, rectangle or freehand/polygon targets.
6. **Typed answer** - exact matching after normalising capitals, spaces and punctuation, with one primary answer and optional alternatives.
7. **Mash-up** - identify exactly two different people from the quiz people bank. Both must be correct; no partial credit is ever awarded.
8. **Ordering** - arrange authored items into the correct sequence.
9. **Matching** - pair every item with its correct partner.
10. **Connections** - identify the connection from progressively revealed clues.

The registry in `src/features/questions/registry.ts` is the code-level source of truth for question types.

## Game and scoring features

Katwed supports:

- **Standard** quizzes and two-competitor **Head-to-Head** quizzes;
- ordered **Rounds** with optional round-intro stages;
- **Individuals** or **Teams**, with player-choice, balanced-random or host-assigned team membership;
- normal **Points** play or individual **Survivor** mode;
- optional **Speed Scoring**;
- authored **Double Score** questions with server-authoritative opening timing;
- **Progressive Reveal** image questions;
- optional **Wagers** of 25%, 50% or 100%;
- **Correct Answer Streaks** as session statistics/commentary without changing ordinary score rules;
- **Buzz-In** questions with one atomic winner and no rebound;
- optional per-player **Power-Ups**: Double Up, 50/50 and Fast Five;
- automatic numeric **Tie-Breakers** for supported genuine first-place ties;
- deterministic answer-option ordering and tile reveal behaviour;
- animated leaderboards, movement commentary and lightweight Final Awards;
- host review/acceptance of incorrect Typed Answers after answers close.

The database remains authoritative for validation, deadlines, phase changes, answer submission, scoring, team/session state, Survivor lives, Buzz claims, Wagers, Power-Up use and tie-break resolution.

## Studio and quiz authoring

The authenticated Studio provides a project-style quiz library and three-panel editor with Presentation/Player previews.

Quiz Settings is a portal-rendered modal with six dedicated sections:

1. **Themes**
2. **Backgrounds**
3. **Answer colours**
4. **Cover**
5. **Game**
6. **People bank**

Quiz-wide settings stay in the editor draft and persist only through the normal **Save quiz** action. The permanent editor sidebar is reserved for question-specific authoring.

Other authoring/library features include:

- Active and Archived quiz libraries;
- title search and deterministic sorting;
- duplicate quiz with fresh internal identities;
- optional 16:9 quiz covers;
- Storage Manager for explicit unused-image review and cleanup;
- versioned `.katwed.json` import/export;
- 51 audience themes and 153 compatible static backgrounds;
- 17 preset eight-colour answer palettes plus Custom;
- shared Presentation sound packs and game-preflight options;
- quiz people banks for Mash-up questions;
- image and YouTube question media;
- immediate, blur, pixelate, tile and zoom-out image reveal treatments.

## Host, presentation and player surfaces

Katwed deliberately separates the host and audience experiences:

| Route | Purpose | Mutating controls |
|---|---|---:|
| `/host/quizzes/:quizId/setup` | Game preflight and lobby creation | Creates session |
| `/host/game/:sessionId/control` | Private host production controller | Yes |
| `/host/game/:sessionId/present` | Read-only 16:9 audience presentation | No |
| `/play/:roomCode` | Responsive player interface | Player-scoped actions only |

The controller is intended for the host's private monitor. The presentation is intended to be shared as a browser window through Teams or another meeting tool. Katwed has no Teams API integration.

`PresentationStage` is shared by the real Presentation and compact controller preview so they interpret safe game state consistently without using an iframe or starting duplicate audible media.

## Media and appearance

Uploaded quiz images use the authenticated Supabase Storage `question-images` bucket. JPEG, PNG and WebP sources up to 8 MB are resized without upscaling to a maximum 1,600-pixel edge and encoded as WebP before upload.

Built-in quiz backgrounds are repository static assets under `public/backgrounds/`; they are not Supabase Storage objects and do not appear in Storage Manager.

YouTube media is supported by normalising common YouTube URLs to a video ID. Autoplay, adverts, branding and embedding restrictions remain browser/YouTube constraints, and cross-device playback synchronisation is not implemented.

## Answer-key and privacy boundary

Before reveal, player-safe state must not expose correct answers or scoring secrets. This includes correct option IDs/sets, Slider answers/tolerances, Pinpoint targets, Typed Answer alternatives, Mash-up member IDs and reveal-only captions.

Leaderboard rows and cumulative totals remain withheld during ordinary answering/reveal phases. Final results require the established explicit reveal flow. The browser never receives a Supabase service-role credential.

Authenticated host-only data, including live response detail and Typed Answer review, stays outside the player-safe state boundary.

## Realtime model

Shared room broadcasts represent meaningful shared game/session transitions rather than every individual answer/presence write. Host surfaces use bounded polling plus Realtime refresh signals, while Players use Realtime with a low-frequency sanity refresh and temporary recovery polling when the channel is unhealthy.

Standard answer submissions avoid room-wide answer fan-out. Head-to-Head retains the narrower two-player live-state behaviour required for its player-controlled loop.

See [`docs/architecture.md`](docs/architecture.md) for the current data-flow and concurrency boundaries.

## Portable quiz format

Export currently targets **Katwed portable format v12**. Imports support **v1 through v12**.

The versioned format carries authored quiz structure such as question definitions, local references, appearance/media configuration and supported saved modifiers. It deliberately excludes live rooms, sessions, players, submitted answers, scores and other runtime state.

Current schema: [`docs/schemas/katwed-quiz-v12.schema.json`](docs/schemas/katwed-quiz-v12.schema.json)

Current format notes: [`docs/katwed-quiz-format-v12.md`](docs/katwed-quiz-format-v12.md)

Older schemas/docs remain versioned compatibility records and should not be rewritten to describe newer formats.

## Local setup

Requirements:

- Node.js 20.9 or newer;
- npm;
- Git.

```powershell
npm install
copy .env.example .env.local
```

For credential-free local development:

```dotenv
VITE_DEMO_MODE=true
```

Then:

```powershell
npm run dev
```

Production-style local configuration uses:

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Production/Supabase development | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Production/Supabase development | Public browser key protected by RLS |
| `VITE_DEMO_MODE` | Local demo only | Must be exactly `true` for demo mode |

Never put a service-role credential in a `VITE_` variable and never commit real `.env` files.

## Validation

The normal application gate is:

```powershell
npm run check
npm run test:e2e
```

`npm run check` runs lint, typecheck, the Vitest suite and a production build.

Useful individual commands:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm audit
git diff --check
```

Critical host/player changes should keep desktop and mobile Playwright coverage green.

## Supabase migrations

Production currently has every repository migration through:

```text
20260906084106_host_typed_answer_review.sql
```

That is **48 applied migrations** as of 6 September 2026. There is currently no documented pending production migration stack after that point.

Never edit an applied migration in place. Add a chronological forward migration and preserve existing grants, RLS, compatibility wrappers and security boundaries.

For the exact current ledger and feature-to-migration mapping, see [`docs/current-production-state.md`](docs/current-production-state.md).

## Deployment

`netlify.toml` builds with `npm run build`, publishes `dist`, uses Node.js 20 and redirects application routes to `index.html` for SPA routing.

Production releases must remain deliberate. A GitHub push and a production-release decision are not conceptually the same thing; follow the project owner's current Netlify deployment setting rather than assuming every push should publish immediately.

## Documentation map

Use documents according to their role:

- [`docs/current-production-state.md`](docs/current-production-state.md) - **authoritative current feature/deployment/migration snapshot**.
- [`docs/architecture.md`](docs/architecture.md) - current architecture, state boundaries and extension points.
- [`AGENTS.md`](AGENTS.md) - mandatory repository rules for coding agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - development and validation workflow.
- [`docs/phase2-release-candidate.md`](docs/phase2-release-candidate.md) - historical Phase 2 release evidence.
- [`docs/premium-complete.md`](docs/premium-complete.md) and [`docs/premium-release-checklist.md`](docs/premium-release-checklist.md) - historical premium-release evidence.
- Feature documents such as `core-rounds.md`, `team-mode.md`, `ordering-matching.md`, `connections.md`, `progressive-reveal.md`, `wagers.md`, `correct-answer-streaks.md`, `buzz-in.md`, `survivor-mode.md`, `power-ups.md` and `automatic-tiebreakers.md` - detailed design, security and focused verification records.
- `katwed-quiz-format-v*.md` and `docs/schemas/katwed-quiz-v*.schema.json` - immutable/versioned portable-format contracts.
- [`docs/audio-language.md`](docs/audio-language.md), [`docs/visual-theme-language-v2.md`](docs/visual-theme-language-v2.md), [`docs/live-game-visual-language.md`](docs/live-game-visual-language.md) and [`docs/backstage-visual-language.md`](docs/backstage-visual-language.md) - specialist presentation/visual systems.

Historical feature documents may retain descriptions of the implementation state at the time they were written. They are useful evidence, but **`current-production-state.md` wins whenever a historical release note conflicts with current deployment status**.
