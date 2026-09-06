# Premium public homepage

## Scope

A homepage-only redesign based on `d7a1895439a1e2bf4a152d57ab04c540bda88a19`, on `design/premium-homepage`.

The public page now presents Katwed as a live quiz platform rather than presenting the two-person mash-up rule as a universal rule. Its primary action remains entering a room code. Hosting continues to use `/host` and the existing authentication boundary.

The visual direction uses charcoal, parchment, lilac and gold, existing typography tokens, a responsive editorial layout and small inline vector/CSS illustrations. No font files, images, packages, analytics or external assets are added.

## Implementation

- `LandingPage.tsx`: replacement platform copy, join form, local Connections example, Points/Teams/Survivor overview, Head-to-Head mention, ten question-format labels, optional gameplay extras and a three-screen hosting explanation.
- `landing.css`: page-specific `kw-*` selectors and an `.app-shell--landing` header treatment. Imported with the lazy homepage module.
- `AppShell.tsx`: one additional class, only when `location.pathname === '/'`. Existing navigation, authentication, backstage and gameplay selection are unchanged.
- `LandingPage.test.tsx`: six component tests covering positioning, input validation, normalisation, leading zeroes, spaced paste, local example/draft independence and host links.
- `homepage.spec.ts`: two browser scenarios covering responsive containment, local interactions, validation and removal of the homepage shell when navigating to Join.

No database, migration, repository, scoring, timer, live-game or deployment configuration changes are part of this work. The mash-up scoring rule itself is unchanged.

## Interaction contracts

Room codes retain their existing six-digit format and `/join?room=123456` destination. Invalid submission focuses the labelled input. Pasted codes are sanitised before the six-digit limit is applied, so `123 456` becomes `123456`. Leading zeroes are retained.

The Connections card is explicitly labelled **Example round**. It starts with two of four fictional example clues visible, progresses through 750, 500 and 250 points, reveals Planets, and can be reset. This illustration has no timer or connection to a live quiz. Only a user action advances it; changing it does not reset the room-code draft. It creates no session, answer, RPC or subscription.

The page makes no claims about audience capacity, user counts, pricing, automatic video-call integration or future Power-Ups.

## Verification status

A standalone review HTML was generated from the actual JSX and CSS, with a small static rendering adapter and equivalent preview interactions. Its screenshots use locally available Inter/system fallback fonts; the actual application continues using its existing Bricolage/Inter typography tokens. This review HTML is **not** a production Vite build.

Passed in local Chromium:

- 17 preview-check groups, including functional layout bounds at 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920 pixels;
- invalid-code focus/error handling, leading-zero preservation and spaced paste;
- the complete Connections example and reset, preserving an entered room code;
- host-link destinations, reduced-motion behaviour and no JavaScript runtime errors;
- zero network requests from the local preview interactions.

TypeScript transpilation syntax checks for the four TS/TSX files and CSS parsing also passed. These are **not** full application type checking or execution of the repository suites.

Full application lint, typecheck, build, Vitest and the actual app Playwright scenarios could not be run in this execution environment. They remain required before merge. Do not treat the standalone preview checks as their replacement.

Suggested repository checks:

```text
npm run lint
npm run typecheck
npm run test -- src/routes/LandingPage.test.tsx src/routes/JoinPage.test.tsx src/app/App.security.test.tsx
npm run build
npm run test:e2e -- tests/e2e/homepage.spec.ts --workers=1 --retries=0
```

Use the normal complete CI gate before a deliberate merge. Preview navigation should also be checked with the real bundled fonts, logged-out and signed-in host access, and the existing join page. No production release is implied by creating this branch.
