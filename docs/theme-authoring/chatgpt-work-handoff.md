# ChatGPT Work handoff: one Katwed theme package

Use this brief only after Visual Theme System v2 is merged. Produce source material for one theme; do not edit the Katwed application or invent production registrations.

## Brief to give ChatGPT Work

Create one Katwed visual-theme source package for `<THEME NAME>` with ID `<theme-id>` and category `<approved-category-id>`. The requested mood and palette are: `<COLOUR AND MOOD DIRECTION>`. Use only generic visual references: `<GENERIC ERA, MATERIAL, LIGHTING, SHAPE OR GENRE REFERENCES>`. Do not imitate a named brand, franchise, artist, protected character or existing product identity.

Return a folder named `<theme-id>` containing:

- `theme.json`, conforming to Katwed `theme-manifest.schema.json` version 2;
- `<theme-id>-<composition-a>.png`;
- `<theme-id>-<composition-b>.png`;
- `<theme-id>-<composition-c>.png`.

The manifest must use an approved category and approved display/UI font IDs. Use exact local source filenames and three distinct background IDs. Supply semantic colour roles and structured stage-gradient/shadow values only. Do not include raw CSS, HTML, JavaScript, remote URLs, font files or executable content.

Generate three coherent but clearly distinct background compositions. Every image must be:

- 16:9 landscape and full bleed, ideally at least 1920×1080;
- free of text, logos, people, UI elements, brand marks, copyrighted characters and quiz answers;
- calm across the central roughly 55–65%, with stronger visual interest towards edges/corners;
- suitable behind large question text, answer cards and translucent live-game surfaces;
- resolution-independent and robust to modest centre cropping;
- consistent with the requested colour mood without making the three images near-duplicates.

Before delivery, verify that every filename exactly matches the manifest, all three images open correctly, no prohibited content appears, and the manifest contains only schema fields. Do not optimise or register production assets; Codex will do that in a separate Visual Theme Batch Import pass.

## Deliberate downstream workflow

1. Place the returned folder under `theme-source/<batch-name>/` locally.
2. Ask Codex for a separate Visual Theme Batch Import pass.
3. Codex validates manifests, image dimensions/composition, contrast and approved font IDs.
4. Codex optimises reviewed assets to production WebP and updates registries, enums, tests and a forward migration.
5. Run CI and manual Presentation/Player visual QA through a PR.
6. Merge and release deliberately; never deploy merely because source artwork exists.
