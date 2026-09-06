# Premium redesign release checklist

- [ ] GitHub application checks pass: lint, typecheck, unit/component suite and build.
- [ ] Desktop Chromium passes with zero retries.
- [ ] Mobile Chromium passes with zero retries.
- [ ] Premium homepage smoke passes and brand renders Ka/twed/! correctly.
- [ ] Editor keeps a single settings section focused and retains existing draft/save semantics.
- [ ] Theme/background browsing remains functional with the full existing catalogue.
- [ ] Game Setup music styles remain selectable and launch settings remain unchanged.
- [ ] Typed Answer review appears only after answers close, shows only incorrect answers and Accept answer calls the existing authoritative correction path.
- [ ] New host review RPC remains authenticated owner-only and absent from player-safe state.
- [ ] Apply `20260906070000_host_typed_answer_review.sql` to production before frontend merge/deploy.
- [ ] Existing production frontend smoke passes after the migration.
- [ ] Merge combined PR to main and verify Netlify production deploy.
- [ ] Manual UAT: homepage, editor, Quiz Settings, music selection, host controller and Typed Answer correction.
