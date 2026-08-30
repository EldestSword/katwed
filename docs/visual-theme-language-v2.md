# Katwed Visual Theme Language v2

Katwed visual themes are curated, build-time identities for the audience screens. They change presentation and player colour, surfaces, atmosphere and display typography without changing gameplay. Sound Packs and Answer Palettes remain independent quiz/session choices.

## Architecture

`quizThemes.ts` is the source of truth for the six deployed theme definitions. A definition contains a stable ID, user-facing metadata, browsing category and keywords, three representative swatches, approved font IDs, preview metadata and only the semantic tokens the live UI consumes. Tokens describe roles such as canvas, surface, text, accent, feature, button, answer, leaderboard, player bar and stage. They do not describe a colour by its hue or create positional answer colours.

`quizThemeSurfaceProps()` normalises an untrusted theme ID, looks up its definition and maps its tokens to CSS custom properties. It also accepts a background only when the registered background belongs to that theme. The helper retains `data-quiz-theme` and, when applicable, `data-quiz-background` for identity and diagnostics. Shared CSS owns structure and consumes the variables; there is no large selector block per theme. Unknown input falls back to Katwed and is never copied into a CSS value or asset URL.

The themed boundary is the full Presentation, compact Controller presentation preview, quiz Editor audience preview and joined Player game. Backstage controls and host chrome remain neutral. `themeId` and nullable `backgroundId` are still the only appearance values persisted. Token objects, font files and manifests never enter quiz data or player-safe state.

## Semantic tokens

The v2 definition covers the roles already required by live Katwed:

- canvas, primary and secondary surfaces;
- primary and muted text, borders, focus, shadows and two accents;
- feature, button, answer and leaderboard surfaces and their foregrounds;
- progress treatment;
- stage background, stage surface, stage text, stage border, room-code and eyebrow accents;
- a separate player-bar background/text pair so a light stage can retain a dark, accessible bar.

Answer tile position colours continue to come only from the Answer Palette registry. A theme must not set or select an Answer Palette. A theme also must not name, select or recommend a Sound Pack at runtime.

## Typography and approved fonts

A theme references `displayFontId` and `uiFontId`, never a raw family or URL. Display typography is for major prompts, headings, room codes and result headlines. UI typography is for buttons, labels, instructions, captions and controls. A decorative display font is not applied to the backstage shell or accessibility-critical utility copy. The registry marks each role a family may safely serve and provides a fallback stack.

The registry contains 12 choices including the platform UI stack and 11 redistributed Latin WOFF2 faces. Bricolage Grotesque remains the default display face and System UI the default utility face for all six deployed themes, preserving their current typography. Each `@font-face` uses `font-display: swap`. The CSS lists all approved faces, but browsers fetch a font file only when rendered text uses that family. No decorative font is preloaded and there are no third-party runtime font requests.

The existing default request remains one 41,344-byte Bricolage Latin variable WOFF2. The ten new files total 286,428 bytes in the build, but are not all requested by an ordinary page. Selecting a future theme with one non-default display face adds only that face (11,800–67,304 bytes in the current registry) when its text is rendered; a file-backed utility face would add its own request. The authenticated Design System deliberately renders every font specimen and therefore exercises the whole registry.

Font source, licence, included weights and exact files are recorded in [font-attributions.md](licenses/fonts/font-attributions.md). Licence texts are stored beside it. Adding an approved font requires verified redistribution terms, a Latin WOFF2 subset where suitable, an explicit fallback stack, role review, attribution, file-existence tests and visual checks with long prompts. Random download sites, remote CSS, uploaded fonts and commercial files are prohibited.

## Categories, discovery and previews

Category IDs are stable browsing slugs, not persisted quiz data. The registry anticipates Katwed Originals, Abstract, Music, Decades, Cinematic, Places & Culture, Seasonal, Entertainment and Wildcards, but the live browser displays only categories represented by current themes.

The reusable theme browser uses real buttons with `aria-pressed`, a labelled search field and simple category filter buttons. Search is case-insensitive and whitespace-tolerant across name, description, category label and keywords. The responsive grid retains explicit Selected/Choose text and keyboard focus. Tests cover the current six and a 48-item non-production fixture.

Current cards use lightweight token/swatches and their registered display font, so opening Quiz Settings does not fetch all 18 full-resolution backgrounds. Preview metadata can later point to a reviewed thumbnail-sized local asset. Background cards remain a separate step and lazy-load only the three images registered to the selected theme.

## Backgrounds

A built-in background belongs to exactly one theme. `backgroundsForTheme()`, runtime normalisation, save validation, portable enum handling and the production database constraint retain the existing six-by-three compatibility matrix. Theme default is still `null` and has no static image. A theme change clears an incompatible background; it never silently chooses or remembers a replacement.

Source artwork is local-only. The established production target is a quality-82 WebP, centre-cropped to 16:9, no larger than 1920×1080 and never upscaled. Future catalogue work may create small preview WebPs, but should not use full Presentation images as browser thumbnails.

## Build-time authoring manifest

The internal schema is [theme-manifest.schema.json](theme-authoring/theme-manifest.schema.json). This is an asset-ingestion contract, not a user-facing quiz import format. It permits stable slugs, registered category/font IDs, bounded metadata, strict hexadecimal colour roles, structured gradients and shadows, and exactly three local PNG/WebP filenames. It rejects extra properties and provides no fields for CSS, JavaScript, HTML, arbitrary URLs or remote fonts. A later importer must additionally check uniqueness, filename existence, background ownership, category/font role suitability, contrast and production ID availability before compiling structured values into a TypeScript registration.

Local source layout:

```text
theme-source/
  batch-01/
    <theme-id>/
      theme.json
      <theme-id>-<composition-a>.png
      <theme-id>-<composition-b>.png
      <theme-id>-<composition-c>.png
```

`theme-source/` is ignored by Git. A later, deliberate import pass validates the manifest, optimises approved images into `public/backgrounds/`, optionally builds thumbnails, updates the typed registries/unions and portable enum, adds a chronological database migration, and runs regression and visual QA. Source masters are not committed.

## Image-generation contract

Each normal theme package contains three coherent but compositionally distinct 16:9, full-bleed landscape images. They contain no text, logos, people, UI, brand marks, copyrighted characters or embedded answers. The central roughly 55–65% stays relatively calm for large prompts and cards; stronger detail belongs near edges and corners. Artwork must remain readable under Katwed surfaces, work across screen resolutions and not rely on one crop or overlay position.

Use generic art-direction references and colour/mood language, never instructions to imitate a protected character, franchise or brand. The ready-to-use generation brief is [chatgpt-work-handoff.md](theme-authoring/chatgpt-work-handoff.md).

## Adding a theme later

1. Produce one schema-valid local package with three distinct source images.
2. Review licence/IP safety, composition, filenames, category and approved font roles.
3. Run the separate ingestion pass to validate contrast, optimise images and register stable IDs.
4. Extend frontend/domain/portable enums and add a new forward-only database migration for the expanded compatibility matrix. Never edit the applied six-theme migrations.
5. Test Presentation, Player, editor preview, compact Controller preview, mobile/zoom, long prompts, Head-to-Head and all reveal/result phases.
6. Review payload and request behaviour, run the complete regression suite, open a PR and release deliberately.

This v2 infrastructure does not add a new live theme, change the portable format or require a database migration.
