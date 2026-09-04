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

The production migration chain through `20260828074030_multi_variant_sound_packs.sql` is applied to the live project. A real host account exists, and host sign-in works against Supabase Auth. The matching Audio Pass 1, game-preflight, host-intelligence and multi-variant audio frontend is not deployed by this development change; Netlify releases remain deliberate.

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

The application catalogue now contains 51 built-in audience themes: the original `katwed`, `midnight`, `sunset`, `arcade`, `mint` and `paper` identities plus 45 reviewed Visual Theme Batch 1, Batch 2 and Batch 3 identities. Batch 3 adds abstract, wildcard, entertainment and seasonal identities, including Glass, Comic Book, Deep Ocean and Summer. Katwed remains the default and preserves the existing presentation/player character. Themes apply to the full presentation, compact controller preview, editor audience preview and joined player game screens across phases; host dashboard, editor chrome, Storage Manager, landing and pre-join screens retain the standard Katwed interface. The quiz-editor preview changes immediately, while the ordinary Save quiz action persists the choice.

Each theme also offers three curated built-in 16:9 image backgrounds plus Theme default, which uses no image and preserves the existing themed surface. The editor shows only the current theme's backgrounds. Changing theme clears an incompatible selection rather than choosing a replacement. Backgrounds use trusted static assets under `public/backgrounds/`; they are not uploads, Supabase Storage objects or Storage Manager inventory.

Theme definitions use Visual Theme System v2: central typed semantic tokens, browsing category/keywords, approved display/UI font IDs and lightweight preview metadata. A safe registry-backed helper maps the selected definition to scoped CSS custom properties while retaining `data-quiz-theme`; unknown IDs fall back to Katwed and cannot inject CSS or asset URLs. Quiz Settings searches and filters all 51 themes across the nine represented categories and omits empty categories. The 45 imported cards lazy-load dedicated 480×270 preview WebPs rather than any of the 135 imported full backgrounds, and catalogue names stay in the backstage UI face so browsing does not fetch every decorative font. See [`docs/visual-theme-language-v2.md`](docs/visual-theme-language-v2.md).

Reviewed local packages are ingested with `npm run import:theme-batch -- --batch <batch-01|batch-02|batch-03> --write`. One reusable importer reads the selected reviewed batch configuration, including its exact contract, source paths, separate content/archive digests, prior registered IDs and output names. Explicit `--source`, `--source-archive`, `--expected-content-sha256` and `--expected-archive-sha256` overrides remain available for verification. The importer calculates a canonical digest from sorted source-relative paths and file bytes, verifies both supplied digests before preparing or replacing outputs, validates the strict v2 JSON Schema and reviewed contract, fully decodes every PNG, rejects unexpected channels/transparency and unsafe manifest content, produces metadata-stripped quality-82 WebPs without upscaling, generates lightweight previews, and writes trusted generated registry data plus the [Batch 1](docs/visual-theme-batch-1-size-report.json), [Batch 2](docs/visual-theme-batch-2-size-report.json) or [Batch 3](docs/visual-theme-batch-3-size-report.json) measured report. Source ZIPs, manifests and PNG masters remain ignored under `theme-source/` and are never served by the app.

`themeId` and nullable `backgroundId` still travel with quiz definitions and through the player-safe game state without changing answer-key filtering, scoring or phase behaviour. Token objects, category metadata, font files and authoring manifests are never persisted. Covers remain separate library metadata. Duplicate preserves both appearance choices alongside the existing independently remapped quiz definition. Sound Packs and Answer Palettes remain deliberately independent.

The production release applied `202608070004_quiz_themes.sql` and `202608070005_quiz_backgrounds.sql` in order and deployed the matching frontend at `https://katwed.co.uk` with `https://katwed.netlify.app` as the Netlify fallback. Both migrations are now immutable production history.

Migrations `202608300001_visual_theme_batch_1.sql`, `202608300002_visual_theme_batch_2.sql` and `202608300003_visual_theme_batch_3.sql` expand the exact database theme/background compatibility matrix in order to 51 themes and 153 backgrounds while preserving the stale-client save chain. The read-only production inspection on 1 September 2026 confirmed that all three are applied; this realtime-scaling change did not apply or deploy them.

Authenticated production UAT confirmed host login and existing quiz/editor loading, all six themes, three compatible backgrounds per theme plus Theme default, immediate editor preview, incompatible-theme reset, Save/reload persistence with Arcade + Grid, matching presentation/player rendering through question, submitted/locked, reveal, leaderboard and final results, the controller preview, the `katwed.co.uk` join/QR origin, and Theme default removing the static image after Save/reload. Automated tests continue to cover broader validation, database constraints, normalisation and compatibility behaviour; the manual run did not exercise every theme/background combination or Storage/permanent-deletion scenarios for built-ins.

### Head-to-Head live play

Head to Head is implemented and tested locally as a quiz type, not a question type. A quiz has exactly two named competitors and assigns every existing Katwed question to one of them. Competitors claim their named slot rather than entering a nickname, both answer every question, and either may start and continue the game. The assigned competitor earns exactly one point for a correct answer; the other competitor may play along for no points or explicitly skip. Questions are untimed, reveal automatically only after both players resolve them, and finish with a two-person score and win/draw result.

The editor, duplication remapping and the six deployed question formats remain shared with Standard quizzes. Standard games retain their existing timed host-controlled question, lock, reveal, leaderboard and final-results flow. Head-to-Head presentation and controller views expose the assignment and two-person progress without giving the host Standard phase controls. Reconnect preserves the claimed slot, and safe state withholds answer correctness until reveal.

Head-to-Head live play and quiz import v1 are deployed with production migrations `202608070006_head_to_head_foundation.sql` and `202608070007_head_to_head_live_play.sql`. Authenticated production UAT verified Head-to-Head reveal wording and mobile slider interaction after the follow-up frontend fix. Export was not manually exercised during that production UAT and remains covered by automated tests.

### Quiz import and export

Active and Archived quizzes can be exported as ordinary UTF-8 `.katwed.json` files using the versioned `katwed-quiz` format. The format uses deterministic file-local keys rather than database identities and carries Standard or Head-to-Head definitions, all current deployed question formats, people-bank and answer references, themes, backgrounds, covers and question media settings. It deliberately excludes archive state, timestamps, rooms, sessions, players, submitted answers and scores.

Import treats local JSON as untrusted, enforces a 2 MB limit, rejects unknown structure and unsafe media schemes, remaps every portable reference to fresh UUIDs, then passes the result through the normal quiz validation and existing create-only `saveQuiz` boundary. A valid file receives a spoiler-safe dashboard preview containing metadata only; successful import remains in the Active library rather than opening the answer-bearing editor. Export actions are available in both library views and warn that the downloaded file contains correct answers.

Version 7 is the export target on the Phase 2 integration branch. It adds ordered rounds and required question-to-round references; versions 1–6 import into a silent default Round 1. V6 circle, rectangle and polygon targets are retained, and legacy Pinpoint coordinates still become equivalent circles. Version 5's sound-pack and version 4's answer-palette semantics are retained. All seven schemas remain aligned with the trusted 51-theme/153-background registry. All versions reference image paths and URLs but do not embed or upload image bytes. See [`docs/katwed-quiz-format-v7.md`](docs/katwed-quiz-format-v7.md) and the companion [JSON Schema](docs/schemas/katwed-quiz-v7.schema.json); the v1–v6 documentation and schemas remain available for existing generators.

Import/export versions 1 and 2 and Typed Answer are deployed. Version 5 exports are implemented and tested locally. Its compatible database field is applied; the matching Audio Pass 1 frontend still awaits deliberate release approval.

### Core Rounds (implemented locally, pending release)

Standard quizzes now contain ordered rounds. The three-panel editor groups questions by round and supports round titles, subtitles, intro toggles, reordering and moving questions between rounds. New quizzes and legacy imports begin with a silent Round 1; added rounds default to an intro. Empty rounds are allowed while drafting and must receive questions before launch. Head-to-Head remains a single structural round with its existing competitor controls.

Enabled rounds pause on a themed, host-controlled intro across Presentation, the compact controller preview and Player. **Start round** opens the first question with its full normal timer. **Next round** appears at round boundaries, session shuffle stays within rounds and final results still require explicit host reveal. Safe round metadata contains no question or answer key. The existing session broadcasts cover these transitions without extra polling or answer/player fan-out.

Forward migration `20260903221013_core_rounds.sql` backfills one silent round per quiz and preserves existing question order and session timestamps. It follows the pending Visual Pinpoint migration and has not been applied to production. See [Core Rounds architecture and local verification](docs/core-rounds.md) and [portable format v7](docs/katwed-quiz-format-v7.md).

The integration branch combines Pinpoint, Slider and Core Rounds with the existing animated leaderboard, commentary and Final Awards. Both client-memory history hooks survive `round-intro`, where there is no current question: the next leaderboard compares with the last revealed board, while Biggest Climber still compares with the legitimate Question 1 leaderboard. Intros show neither stale standings nor awards. Refreshing at a later intro cannot establish either baseline. Presentation, compact controller preview and Player share this behaviour without extra requests or persistence. The pending Phase 2 schema chain is Visual Pinpoint, Core Rounds, then Core Team Mode; development does not apply it to production or deploy the frontend.

### Core Team Mode (implemented locally, pending release)

Standard quizzes can launch as **Individuals** (the default) or **Teams**, with 2–8 named teams and Player choice, Balanced random or Host assigns membership. Teams belong to the game session; saved quizzes, Head-to-Head and portable format v7 are unchanged. The host can move players or balance teams in the lobby, and every player must be assigned before starting.

Players still answer and score individually. Team standings sum only the authoritative individual leaderboard rows visible at Leaderboard or Final Results, with no stored team totals or extra score writes. Team names and stable team IDs reuse the existing animation/commentary history through Round Intro. Final Results crown a team; Most Correct and Quickest Thinker may appear as Individual honours, with no individual Biggest Climber.

Forward migration `20260904100005_core_team_mode.sql` follows Core Rounds and preserves legacy Individual launch/join calls for a deliberate database-first release. Membership RPCs add no room broadcasts, subscriptions or faster polling. Existing Player focus/reconnect recovery and the 45-second healthy sanity refresh pick up host assignment changes. See [Team Mode architecture and verification](docs/team-mode.md).

### Typed Answer and deterministic tile reveal

Typed Answer uses one primary answer plus up to 19 optional alternatives. Matching applies Unicode NFKC normalisation, lower-casing and removal of every non-letter/non-number character, then requires an exact match. It is intentionally not fuzzy. The player submits a trimmed answer of at most 120 characters; PostgreSQL repeats validation and authoritative scoring for Standard and Head-to-Head games. Only the primary answer is revealed, while alternatives remain secret answer-key data.

The existing 24-tile image reveal now uses a deterministic seeded shuffle derived from the media path and authoritative question-open timestamp. Controller, presentation and player screens therefore reveal the same random-looking order across rerenders and reconnects without using render-time randomness. Timing, reduced-motion behaviour and the existing `tiles` effect ID are unchanged.

Typed Answer and deterministic 24-tile ordering are deployed. Focused authenticated production UAT confirmed saving a Typed Answer, normalised positive matching for `RED-DWARF` against `Red Dwarf`, and rejection of the deliberately wrong `RED-DWARFF` spelling.

The private host controller derives named current-question response status from the authenticated owner session bundle. Waiting players remain visible regardless of the live-answer preference or room size; submitted answer text is shown only when the session setting is on and the room has at most 15 players. Standard Typed Answer results retain the automatic judgement separately from an optional session-only host acceptance. Accept and undo are owner-only, current-question operations available after Lock, and atomically adjust points, correct count and response-time tiebreak totals using the original response time and the normal Double Score and Speed Scoring formula. Player-safe state remains free of raw responses and exposes only the existing reveal-gated primary answer and authoritative player outcome.

### Standard scoring, Double Score and tile grids

New Standard questions default to speed scoring on, while existing questions and all imported v1/v2 questions remain fixed-score unless explicitly changed. Positive scores use a linear 100%-to-50% multiplier across the authoritative question window. Double Score multiplies the existing base score first, followed by speed scaling and integer flooring. Multiple Select partial-wipeout continues to determine its proportional or zero base before either modifier.

Double Score questions use the launched session's selected sound-pack variant duration on player, presentation and compact controller-preview screens. The server persists a shuffled variant-index bag, chooses the authoritative sting before opening the question and exposes only its index to Presentation. The question opens after that prepared sting duration, so the full configured timer remains available, Speed Scoring starts at the actual opening, reconnect does not choose another variant, and early answers or host Lock/Finish attempts are rejected. Katwed Core and the silent option retain their established five-second visual fallback; imported production durations are validated between 500 ms and 30 seconds.

Mixed-format quizzes also receive a 1.75-second question-type prelude before each ordinary question. Single-format quizzes have none. A Double Score prelude replaces, rather than follows, the type prelude and carries the type label as secondary copy. Standard and Head-to-Head progression both use the authoritative opening timestamp; Head-to-Head questions remain untimed.

New tile authoring supports 6-by-6, 8-by-8, 12-by-12 and 16-by-16 grids, defaulting to 8-by-8. Existing tile media without a size retains the deployed 24-tile 6-by-4 layout. All grids keep deterministic per-opening reveal order, total reveal duration, reduced-motion behaviour and image enlargement.

These features are implemented and tested. `202608090002_standard_scoring_and_tile_options.sql` is applied production history. No Netlify deployment was performed during this answer-palette development package.

### Quiz settings, Standard auto-lock and answer palettes

Quiz-wide configuration now opens from **Quiz settings** in an accessible modal, covering quiz type, competitors, theme, background, cover and answer colours. Changes remain part of the editor draft and persist only through the ordinary **Save quiz** action. The permanent right sidebar is question-specific and grouped into Question, Answers, Scoring, and Media & presentation sections.

Standard rooms default to closing answers automatically once every joined player has submitted, using the same authoritative lock transition as the timer and the host's **Close answers now** action. This may be disabled for an individual game during preflight, in which case the deadline or host closes the answers. Joined-player count deliberately includes disconnected players, so a missing device cannot cause a premature close. Empty rooms never auto-lock and Head-to-Head behaviour is unchanged.

Each quiz selects one of 17 preset eight-colour palettes or an eight-colour Custom palette. Colours are assigned by final displayed answer position after the shared deterministic option ordering; True uses position 1 and False position 2. Player, presentation, controller preview, reveal and suitable result surfaces share that mapping. Text uses the WCAG relative-luminance contrast ratio to choose controlled near-black or white, with pure black reserved for the narrow colour range where neither preferred foreground reaches AA. Duplicate, Demo/Supabase save and load, safe live state, and portable format v5 preserve the configuration.

### Game preflight and shared game audio

Clicking **Launch game** now opens `/host/quizzes/:quizId/setup` without creating a room. The host chooses the session music theme, optional session-only question shuffle, optional forced answer-choice shuffle, Standard auto-close behaviour and whether the private controller may show individual answers in rooms of up to 15 players, then **Start lobby** creates the room atomically. An existing active room resumes instead of creating a duplicate. The stable question order, deterministic answer seed and controller-answer preference are persisted on the session and never rewrite the saved quiz.

Music selection is no longer editable in permanent Quiz settings. The portable-v5 `soundPackId` remains as a backwards-compatible preflight default, while every live phase reads the persisted session pack. The full Presentation route is the only shared-audio owner: it maps authoritative Lobby, Question, Urgent, Double Score, Locked, Reveal, Leaderboard and Final phases through one central engine and sound-pack registry. Controller music/effects volume and master mute are local device preferences; the compact preview and contestant phones never create duplicate playback.

Lobby and Question use prepared loop seams, phase changes crossfade briefly, one-shot stings use authoritative event keys, and blocked playback exposes a non-blocking **Enable sound** action in the Presentation window. Presentation-visible YouTube questions conservatively silence the question bed because the current privacy-enhanced iframe has no reliable player-state API. Gameplay remains fully visual and continues through blocked, missing, muted or disabled audio. See [`docs/audio-language.md`](docs/audio-language.md) for the asset inventory, phase language, preparation and future-pack contract.

The production MP3 pack is 2.72 MiB under `public/audio/packs/katwed/`; raw WAV masters remain ignored local source assets. The audio, game-preflight and host-intelligence migration chain through `202608270010_bound_host_response_serialisation.sql` is applied, while no matching Netlify deployment has been performed.

### Visual design system, pass 1

The first visual redesign pass establishes reusable foundations without redesigning complete screens. Visual Theme v2 retains locally bundled Bricolage Grotesque as the default and adds a restrained approved registry of licensed Latin WOFF2 display/utility faces for future themes; there are no runtime font requests to third-party services and decorative faces are not preloaded. Semantic CSS is split into tokens, typography, primitives and visual-lab layout under `src/styles/`, while the existing `global.css` remains the screen-layout layer until later redesign passes.

Shared game primitives now cover positional answer tiles, eight non-colour SVG markers, selected/disabled/locked/correct/incorrect states, image answers, status badges, circular timers, button hierarchy, focus treatment, form controls, surfaces and reduced-motion behaviour. The player and presentation choice/timer paths use the shared primitives while retaining the established safe-state, scoring, deadline, theme, background and answer-palette contracts.

Authenticated hosts can review the system at `/host/design-system` (also linked as **Visual lab** from the host dashboard). The lab changes local specimen state only: it does not save quiz data, call scoring operations or expose answer keys. It demonstrates every theme, positional marker and core state at desktop and mobile widths. This pass adds no database migration and does not change deployment settings.

### Host/backstage visual language, pass 3

Authenticated host routes use a compact neutral application shell and a dedicated `backstage.css` layer. The quiz library presents saved quizzes as creative projects, the editor uses a dense authoring workspace with modal question creation and honest Presentation/Player previews, Quiz Settings uses section navigation and visual pickers, and the Controller uses phase-led production-console hierarchy. Login, Storage and the Design System lab share the same host surfaces. Live Presentation and Player behaviour remains governed by Pass 2. See [`docs/backstage-visual-language.md`](docs/backstage-visual-language.md).

### Live-game visual language, pass 2

The Presentation is composed as a long-distance **stage**, while the Player is a compact **contestant control pad** designed for quick phone input. Lobby join information, semantic question layouts, submission status, Locked, reveal, scoreboard and final-results compositions now have distinct hierarchy without changing the safe-state, option-ordering, scoring, deadline or host-gated reveal contracts. Shared live primitives are documented in the protected visual lab.

See [`docs/live-game-visual-language.md`](docs/live-game-visual-language.md) for phase composition, answer and reveal language, responsive behaviour, motion, accessibility and theme guidance.

### Public experience and whole-product cohesion, pass 4

The final visual polish pass connects Katwed's public entry, loading and recovery states to the established live stage and neutral backstage environments. It preserves the Hotfix 3.1 Presentation, compact-preview and responsive Player geometry while aligning public navigation, form validation, authentication transitions, status feedback, mobile first actions and designed edge states.

See [`docs/visual-language.md`](docs/visual-language.md) for the concise four-pass relationship between the shared design system, live stage, backstage tools and public experience.

### Live-question UX and host-loading hotfix

Live Presentation, compact controller preview, Player and editor previews share deterministic content-density tiers for question prompts. Short prompts retain the established display scale, while medium, long and extra-long prompts step down through responsive `clamp()` values. A visible image or video moves the prompt into a compact tier sooner so question media keeps the larger share of the composition. Live prompts are centred on Presentation and Player screens.

Question media now uses contained intrinsic sizing throughout its shared rendering path. Landscape, portrait, square and unusual aspect ratios remain complete; unused letterbox space is preferred to cropping. The editor Presentation preview no longer limits question media to the previous shallow fixed-height strip. Cover images, backgrounds and other intentionally framed artwork retain their existing crop behaviour.

Standard answer cards use shared answer-density metadata. Longer labels step down in size and ordinary words wrap only at word boundaries. Player labels also measure their rendered width: if an unbroken word cannot fit above the readable type and tracking floors, that question switches to full-width answer cards and refits without splitting, truncating or overflowing the word. Two-column grids otherwise use four internal tracks: each answer occupies two tracks and a final odd answer occupies the centred middle two, so three- and five-answer layouts keep every card the same width.

The authenticated controller derives a human-readable current-answer summary from the full owner-only quiz definition during Question, Locked and Reveal, then hides it for Leaderboard and Final results. This does not add answer fields to `SafeGameState`; the existing parser continues to reject answer keys before Reveal.

Production auth startup uses Supabase's `INITIAL_SESSION` event as the single readiness boundary. Protected host routes remain on their loading state until persisted-session recovery and any token refresh have completed, then authenticated repository work may mount. The previous parallel `getSession()` startup path has been removed, avoiding competing restoration reads under React Strict Mode; invalid sessions still resolve to the protected login route and genuine repository failures remain visible.

### Next work

Remaining product work includes the deliberately separate audio pass, further question formats, library/storage extensions and formal multi-player load testing. These items are described in [Roadmap](#roadmap); Pass 4 does not add audio controls or placeholders.

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
| `/host/quizzes/:quizId/setup` | Host preflight for one game session; no room exists until Start lobby | Creates session |
| `/host/game/:sessionId/control` | Private host controller, normally kept on a second monitor | Yes |
| `/host/game/:sessionId/present` | Read-only shared presentation window | No |
| `/play/:roomCode` | Responsive phone, tablet and desktop player interface | Answer submission only |

The legacy `/host/game/:sessionId` route redirects to `/control`.

Both host routes require host authentication in production. The presentation uses the same authenticated Supabase session as the controller and never exposes host controls. It is intended to be shared as an ordinary browser window through Teams or another meeting tool; no meeting-platform integration is involved.

## Recommended Teams workflow

1. Select **Launch game**, review Game setup and choose **Start lobby**.
2. Select **Open presentation window** from the controller.
3. Move the presentation to the main monitor.
4. Share only that browser window in Microsoft Teams.
5. Keep the controller on the second monitor.
6. Ask players to join using the room code or QR code.

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

Configurable minimum, maximum, step, answer, tolerance, prefix, suffix and unit. The player control starts at a snapped midpoint labelled as unchosen; Lock in stays disabled until an interaction selects a value. `PlayerSliderAnswer` retains a native keyboard-accessible range with a 40px thumb and 56px touch area, immediate pointer dragging and track taps, a travelling formatted value bubble, and decimal-safe single-step −/+ buttons. Pointer capture keeps dragging on the control and only the range suppresses touch scrolling. The player payload, scoring, authoring and presentation range context are unchanged; this player UI update requires no database migration.

### Pinpoint

The player selects normalised `x` and `y` coordinates on a contained image. Keyboard range controls provide an alternative. Visual Pinpoint Authoring (implemented on the feature branch, pending release) lets the host draw a Circle, Rectangle or Freehand correct area directly on the image, clear or redraw it, and use Advanced settings for keyboard creation and precise numeric editing. The configured area is highlighted in authoring, editor preview and the existing player/presentation reveal, alongside response markers.

Targets use one discriminated `target` object. Rectangles start at their top-left corner; polygons have 3–64 distinct vertices, a simple closed outline and a normalised area of at least 0.0001. Freehand strokes are sampled and simplified deterministically before saving; tiny or intersecting outlines are rejected. Pointer capture, touch scroll suppression and contained-image bounds keep drawing independent of letterboxing and container size. Existing normalised circles retain their exact distance/radius semantics, including their oval appearance on non-square images. Database scoring uses inclusive circle/rectangle boundaries and deterministic polygon ray casting. Player submissions remain ordinary points and correct targets remain withheld until the existing reveal phases.

Forward migration `20260903203203_visual_pinpoint_targets.sql` upgrades legacy circles and the authoritative save/validation/scoring path without replacing phase or submission wrappers. Release it deliberately with the matching frontend; the old database cannot persist the new shape representation. This task does not apply the migration or deploy the frontend. See [portable v6 and geometry rules](docs/katwed-quiz-format-v6.md).

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

### Revealed leaderboard movement and commentary

The presentation and Player page retain their own last revealed leaderboard in component memory through the next question, lock and answer reveal. `useRevealedLeaderboard` reads only the existing leaderboard-phase safe payload, freezes a comparison for that reveal and promotes the current board after settling (or immediately if the host advances early). Refresh, a different session, lobby/restart or finished phase clears the baseline. Identical polling updates do not replay animations; corrections within the same revealed question display immediately without a second announcement. No history is persisted and no extra fetch, polling, subscription, broadcast or database write is involved.

`AnimatedLeaderboard` uses one shared score count-up clock followed by FLIP row movement with stable player IDs. Layout is measured only before and after reordering; browser transforms perform the movement. Scores count for 750ms, rows move for 900ms and temporary movement badges clear within 2.6 seconds. Phase changes cancel pending frames, timers and row animations. The full presentation still renders every supplied row; the compact preview retains its six-row limit. Final results use their separate podium renderer.

Pure snapshot comparisons select at most one presentation commentary event: a known player taking first place, entering the top three, climbing at least three places, or a proven direct overtake within the top five, in that order. New players and first/refresh baselines never receive invented movement. Authoritative ranks and tie ordering are preserved. Phones show final standings with only their own up/down movement and new ordinal rank, without global commentary. Reduced motion skips score counting and row travel while preserving true movement indicators and commentary; animated score frames are excluded from live announcements.

### Lightweight final awards

Standard Final Results add up to three small cards beneath the existing podium. The pure `calculateFinalAwards` helper selects Most Correct from the highest positive correct-answer count, Quickest Thinker from the lowest average correct-answer response time among players with at least three correct answers, and Biggest Climber from the largest positive improvement between known first and final ranks. Exact averages are compared before rounding seconds for display. All genuine ties share the award; two names are shown together, longer lists are abbreviated visually with every winner and tied climb still available to assistive technology. No qualifying result means no card. Head-to-Head final results remain unchanged.

`useFinalAwardsHistory` is separate from `useRevealedLeaderboard`. It records only active Standard Question 1 leaderboard ranks when the current question ID, valid opening timestamp and non-final question count prove that this is the first leaderboard. Corrections while that first board is visible update its ranks; later leaderboards never establish or replace the baseline. It keeps only player IDs and ranks in component memory, exposes them only at finished, and clears on session change, lobby/restart, closed room, missing state, backward question progress or a changed Question 1 opening. Refreshing after the first leaderboard therefore omits Biggest Climber; a refresh while the provable first board is still visible can establish it from that board. No history is persisted or recovered from scores.

Presentation cards sit in a restrained row, Player cards wrap or stack at narrow widths, and compact controller previews show award labels and winners without secondary metrics. Current-player award cards receive a subtle theme highlight. There is no extra animation or delay, and the podium, standings order and host-controlled final reveal remain intact. This feature adds no database changes, RPCs, fetches, polling, subscriptions, broadcasts or dependencies. Focused checks cover calculation, memory lifecycle, Final Results, affected Presentation/Player rendering and the dedicated `tests/e2e/final-awards.spec.ts` flow; production release remains deliberate.

See [`docs/architecture.md`](docs/architecture.md) for the data flow, safe payloads and extension points.

### Live-room realtime and polling model

Before the realtime scaling pass, every answer and routine Player-row update could emit a room-wide `game_changed` broadcast. Every subscribed Player then fetched the full safe state, while every Player also polled every five seconds. The answer RPCs retained an exclusive lock on the shared GameSession row, so a simultaneous answer burst could queue behind that row. The controller also fetched and serialised the complete quiz definition on every refresh.

After forward migration `20260901094653_realtime_scaling_free_tier.sql` is deliberately released:

- public room broadcasts represent shared GameSession transitions such as question open, lock, reveal, leaderboard, finish, restart and close;
- Standard joins, answer rows, score/last-seen updates and presence heartbeats do not generate room-wide broadcasts;
- Head-to-Head retains a narrow two-competitor Player-change broadcast because readiness and connectivity are part of its live control flow;
- the controller polls owner-only dynamic session data every second in the lobby, every 750 ms during an open question and every five seconds in other phases;
- the presentation polls safe live state every second in the lobby and during an open question, and every five seconds in other phases;
- both host views still refresh immediately on GameSession broadcasts, while a shared single-flight scheduler coalesces bursts and permits at most one trailing fetch;
- each Player uses Realtime plus a 45-second sanity refresh while subscribed, temporarily polls every three seconds after a timeout/channel error/closure, and refreshes immediately after online, focus or visible recovery events;
- Standard answer validation takes a shared GameSession row lock, allowing concurrent submissions while remaining ordered against the host's conflicting phase update; Head-to-Head alone takes an exclusive lock before its resolution path because that path can advance the session itself;
- the controller loads the complete quiz once, then calls the authenticated, owner-only `host_get_live_session` reader for changing roster/response data; its existing current-question and raw-response bounds remain intact.

The Standard Player lobby intentionally shows confirmation and waits for the host without an exact live room count. Controller and presentation lobby counts remain live. Player presence remains database-backed with a 30-second heartbeat, page-hide disconnect attempt and reconnect restoration, but routine presence writes no longer fan out.

This is designed for efficient larger-room operation; formal measured capacity depends on the load-test results.

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

The live Katwed! deployment uses Supabase Auth, PostgreSQL, Storage and Realtime. Host authentication, quiz persistence, image upload, multiplayer updates, anonymous joining, reconnect, scoring and reveal behaviour have all been verified against the real project. A read-only check on 1 September 2026 confirmed that production has every committed migration through `202608300003_visual_theme_batch_3.sql` applied. The realtime-scaling migration in this branch has not been applied, and this development change does not perform a Netlify deployment.

Audio Pass 2 added applied migration `20260828074030_multi_variant_sound_packs.sql`. It generalises persisted quiz and session pack IDs to safe slugs, keeps the stale-client-compatible quiz-save wrapper, validates and persists Double Score duration arrays, and adds an authoritative server shuffle bag without removing either deployed `host_launch_game` overload. The matching Netlify release remains deliberate.

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
202608270001_quiz_sound_pack.sql
202608270002_double_score_intro_five_seconds.sql
202608270003_game_preflight_session_settings.sql
202608270004_fix_wrapped_submit_answer_search_path.sql
202608270005_fix_public_submit_answer_search_path.sql
202608270006_qualify_legacy_submit_answer_digest.sql
202608270007_qualify_all_submit_answer_overloads.sql
202608270008_refresh_session_and_quiz_readers.sql
202608270009_host_intelligence_and_typed_overrides.sql
202608270010_bound_host_response_serialisation.sql
20260828074030_multi_variant_sound_packs.sql
202608300001_visual_theme_batch_1.sql
202608300002_visual_theme_batch_2.sql
202608300003_visual_theme_batch_3.sql
```

Pending, deliberately unapplied migrations:

```text
20260901094653_realtime_scaling_free_tier.sql
20260903203203_visual_pinpoint_targets.sql
20260903221013_core_rounds.sql
20260904100005_core_team_mode.sql
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

Applied migration `202608270001_quiz_sound_pack.sql` adds a constrained `katwed`/`none` quiz field with a Katwed default, stale-client-compatible owner save/read wrappers, and only harmless sound-pack metadata in player-safe state.

Applied migration `202608270002_double_score_intro_five_seconds.sql` updates the existing server-authoritative Double Score window from the earlier 1.5-second behaviour to the current five-second baseline.

Applied migration `202608270003_game_preflight_session_settings.sql` adds validated session-level sound, prelude, shuffle and auto-close configuration; persists one question order and answer-order seed per room; extends atomic launch; and keeps opening, deadline, submission and Head-to-Head progression authoritative. It wraps existing public functions rather than editing applied migrations. Applied follow-ups `202608270004` through `202608270007` preserve compatibility across the live function history by explicitly resolving the wrapped submission validator's pgcrypto dependency. `202608270008_refresh_session_and_quiz_readers.sql` rebinds owner readers to the current serialisers and removes the previous `host_get_game` lint warning. Post-apply schema lint reports no errors or warnings.

Applied migration `202608270009_host_intelligence_and_typed_overrides.sql` adds the default-on session controller-answer preference, preserves automatic and host Typed Answer judgement separately, includes submitted answers only in the authenticated owner session serialiser, and adds an authenticated Standard-only current-question accept/undo RPC with row locking and delta-based score, count and response-time updates. Existing one- and two-argument launch signatures remain available, anonymous submission and player-safe state are unchanged, and post-apply schema lint reports no errors or warnings.

Applied migration `202608270010_bound_host_response_serialisation.sql` bounds authenticated controller refresh payloads to the current question. It always returns payload-free current-question response markers for named waiting status, while raw answer detail is returned only when the session preference is enabled and the room has at most 15 players. The player-safe state and anonymous RPC boundary are unchanged.

Applied migration `20260828074030_multi_variant_sound_packs.sql` expands both permanent quiz and session pack IDs to the same bounded safe-slug rule, updates the existing stale-client-compatible save wrapper, adds bounded duration and shuffle-bag state for session-level audio variants, preserves old one- and two-argument launch calls with a five-second fallback, accepts no client asset URLs, and exposes the selected Double Score index without changing the player answer-key boundary.

Applied migrations `202608300001_visual_theme_batch_1.sql`, `202608300002_visual_theme_batch_2.sql` and `202608300003_visual_theme_batch_3.sql` expand the exact theme/background matrix in order to 51 themes and 153 backgrounds while preserving stale-client saves.

Pending migration `20260901094653_realtime_scaling_free_tier.sql` removes broad Standard Player/answer broadcast triggers, narrows GameSession transition broadcasts, retains a Head-to-Head-only Player exception, adds the owner-only live-session reader and changes retained submit implementations to shared session locking with an exclusive Head-to-Head wrapper. It must be reviewed and applied before deploying its matching frontend.

### Disposable Codespaces Supabase lab

The repository includes a local-only load lab in `.devcontainer/devcontainer.json`. It uses the maintained Microsoft Node 22 dev-container image and the maintained Docker-in-Docker feature, so Supabase's child containers run inside the Codespace rather than requiring Docker on the Windows host. The configuration does not select a Codespaces machine size. Before creating a Codespace, check the GitHub account's current Codespaces entitlement and usage and choose only a machine covered by the available allowance; repository configuration is not evidence that a Codespace will be free.

Create the Codespace manually from this branch after that billing check. Supabase API, database, Studio, Mailpit and Analytics forwarded ports are explicitly private. The Vite port is private too. The post-create step runs `npm ci`; it does not start Docker workloads or Supabase automatically.

In the Codespace terminal:

```bash
export KATWED_LOCAL_SUPABASE=YES
npm run supabase:local:start
npm run supabase:local:reset
npm run test:supabase:local
npm run test:supabase:concurrency
npm run loadtest:supabase:local
npm run supabase:local:stop
```

The start wrapper first checks `docker version` and `docker compose version`, creates or validates a dedicated Docker network whose published ports bind to `127.0.0.1`, then starts the pinned Supabase CLI stack. The reset command recreates the disposable local database from every committed migration with seeding disabled. The integration command runs the resulting-schema pgTAP assertions, migration listing, local database lint, owner/non-owner/anonymous security checks and real Standard and Head-to-Head RPC flows. The concurrency command installs a temporary local trigger outside the migration chain to hold actual answer transactions for one second, proves concurrent Standard answers overlap, checks that a host phase update waits behind answer shared locks, and verifies a host-first lock rejects the late answer without writing a row. It removes the helper in `finally`.

The default load command runs the priority matrix: 25/50/75/100 Players at 0 ms, then 100 Players at 500 ms and 10,000 ms. Set `KATWED_LOCAL_LOAD_FULL_MATRIX=YES` to add 25/50/75 at 500 ms and 10,000 ms. Set `KATWED_LOCAL_MAX_PLAYERS=75` if the included Codespace cannot safely run 100 clients. The orchestrator refuses non-loopback endpoints, requires the local confirmation above, creates a fresh synthetic host/quiz/session per run, gives Player clients only the local anonymous key, keeps auto-lock disabled, checks database row/duplicate counts and phase, separately verifies the desired host-lock broadcast, samples PostgreSQL/container resources, and writes ignored reports under `artifacts/local-supabase/`.

For optional browser inspection, create an ignored `.env.local` containing only the loopback `VITE_SUPABASE_URL` and the local anonymous key reported by `npm run supabase:local:status`; never put the local service-role key in a `VITE_` variable. Generated local credentials, `.env.local`, Supabase temporary state and load reports must not be committed.

These commands have no path for `supabase link`, remote database operations or hosted project URLs. The local CLI database lint is available, but the managed Supabase Security Advisor is not a local-stack service. Local success demonstrates Katwed's migrations, security boundary, locking, Realtime and application architecture on that Codespaces VM; it does **not** certify managed Supabase Free-plan quotas or cloud capacity. Production Supabase, the separate Car HQ project and Netlify must remain untouched throughout this workflow.

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

Local audio contributors additionally use `npm run import:audio-sources` and `npm run prepare:audio`, with reviewed pack-selection environment variables for batch imports, then verify every committed production MP3 with FFprobe. Raw ZIPs and clean source folders remain ignored under `audio-source/`; only prepared `public/audio/packs/**` output and generated manifest/report data are committed. See [`docs/audio-language.md`](docs/audio-language.md).

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

The safe-by-default public-client harness joins simulated Players, subscribes each one to the same room topic, waits for the host to open a disposable Standard True/False or Single Choice question, submits over a configurable spread and reports joins, failures, timeouts, Realtime errors, answer-burst room event deliveries and latency percentiles. It rejects service-role JWTs and refuses the known production project or `katwed.co.uk` without an exact dangerous opt-in. Use a separate disposable Supabase project where possible.

```powershell
$env:KATWED_LOADTEST_SUPABASE_URL='https://YOUR-DISPOSABLE-PROJECT.supabase.co'
$env:KATWED_LOADTEST_SUPABASE_KEY='YOUR_ANON_OR_PUBLISHABLE_KEY'
$env:KATWED_LOADTEST_ROOM_CODE='123456'
$env:KATWED_LOADTEST_DISPOSABLE_ROOM='YES'
$env:KATWED_LOADTEST_PLAYERS='25'
$env:KATWED_LOADTEST_SPREAD_MS='500'
$env:KATWED_LOADTEST_BROADCAST_DRAIN_MS='750'
$env:KATWED_LOADTEST_BROADCAST_SETTLE_MS='750'
npm run loadtest:live
```

Run separate 25, 50, 75 and 100 Player tests and try answer spreads of 0, 500, 2,000 and 10,000 ms. Start the disposable Standard lobby with **Auto-close answers when everyone has locked in** disabled, then use its host controller to open the supported question after all joins complete. The harness reads `sessionSettings.autoLockWhenAllAnswered` from the public safe state and refuses to submit if the value is enabled, absent or invalid; it never changes host settings or needs owner credentials.

The default broadcast-measurement window drains the question-open event for 750 ms, records during the answer burst, waits a further 750 ms for answer-associated deliveries, then stops recording and fetches public safe state to verify the authoritative Answered count and that the session remains in Question. Do not manually close, reveal or advance the game during that window. Realtime payloads do not identify the database row or trigger that caused a room event, so the harness reports deliveries observed during this carefully bounded window rather than claiming their source. With no host phase transition in the window, a Standard answer-only burst should report zero `roomGameChangedDeliveriesDuringAnswerBurst`; any non-zero result needs investigation.

During a real run, also inspect the Supabase Realtime dashboard's concurrent connections, messages/events per second, channel joins and errors, together with API/database latency. The harness does not create, advance or close rooms and does not install a scheduled service.

## Roadmap

### Quiz library and storage management

Archive, restore, safer permanent deletion, duplicate quiz, Search, Last edited, sorting, Quiz Covers, Storage Manager, Head-to-Head, Typed Answer and portable quiz formats v1/v2 are implemented and deployed. Portable format v5, Quiz settings, answer palettes, Audio Pass 1 and game preflight are implemented and tested locally; their database migrations are applied and the matching frontend awaits deliberate release. The lifecycle removes relational game history on permanent deletion, safely preserves shared media references and provides explicit review and cleanup of eligible unused Katwed images.

- tags;
- optional media reuse;
- old game-session cleanup;
- further image and storage optimisation controls.

### Themes and visual identity

The six original per-quiz themes and 18 optional built-in backgrounds are deployed and manually production-UAT verified. Visual Theme Batches 1, 2 and 3 add 45 reviewed themes and 135 production backgrounds locally, with one reusable provenance-checked ingestion pipeline and lightweight browser previews; their three ordered migrations are applied in production. Theme default supplies the themed surface without a static image, while each theme owns exactly three compatible built-in backgrounds.

Planned work:

- Katwed! typography;
- custom themes.
- deliberate review and release verification for the expanded theme frontend.

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
