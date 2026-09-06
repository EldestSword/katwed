# Premium redesign release checklist

- [x] GitHub application checks pass: lint, typecheck, unit/component suite and build.
- [x] Desktop Chromium passes with zero retries.
- [x] Mobile Chromium passes with zero retries.
- [x] Premium homepage smoke passes and brand renders Ka/twed/! correctly.
- [x] Editor keeps a single settings section focused and retains existing draft/save semantics.
- [x] Theme/background browsing remains functional with the full existing catalogue.
- [x] Game Setup music styles remain selectable and launch settings remain unchanged.
- [x] Typed Answer review appears only after answers close, shows only incorrect answers and Accept answer calls the existing authoritative correction path.
- [x] New host review RPC remains authenticated owner-only and absent from player-safe state.
- [x] Apply `20260906084106_host_typed_answer_review.sql` to production before frontend merge/deploy.
- [x] Existing production data counts and RPC privileges verified after the migration; no existing rows changed.
- [ ] Merge combined PR to main and verify Netlify production deploy.
- [ ] Manual UAT: homepage, editor, Quiz Settings, music selection, host controller and Typed Answer correction.
