# Premium redesign release checklist

This checklist is retained as release evidence. The premium redesign and subsequent six-section Studio settings completion are merged to `main`.

- [x] GitHub application checks pass: lint, typecheck, unit/component suite and build.
- [x] Desktop Chromium passes with zero retries.
- [x] Mobile Chromium passes with zero retries.
- [x] Premium homepage smoke passes and brand renders Ka/twed/! correctly.
- [x] Editor keeps a single question-settings section focused and retains existing draft/save semantics.
- [x] Theme/background browsing remains functional with the full catalogue.
- [x] Game Setup music styles remain selectable and launch settings remain unchanged.
- [x] Typed Answer review appears only after answers close, shows only incorrect answers and **Accept answer** uses the existing authoritative correction path.
- [x] Host review RPC remains authenticated/owner-only and absent from Player-safe state.
- [x] Apply `20260906084106_host_typed_answer_review.sql` to production before matching frontend release.
- [x] Existing production data counts and RPC privileges verified after the migration; no existing rows changed.
- [x] Premium redesign merged to `main` in `cb39a247dad4267649b664fb2069b1c12b99725c`.
- [x] Six-section Studio Quiz Settings completion merged to `main` in `168c28870bf48b1103ac681b0b968a041936204f`.
- [x] Studio settings browser contracts cover Themes, Backgrounds, Answer colours, Cover, Game and People bank.
- [x] Focused 320x568 mobile regression covers portalled settings scrolling and the Done action.

## Manual UAT note

Manual product UAT remains an operational activity rather than a repository gate. When rechecking the premium surfaces, cover:

- homepage;
- Studio/editor;
- all six Quiz Settings sections;
- sound-pack selection in Game Setup;
- host Controller;
- Typed Answer correction;
- a narrow-phone Studio settings pass.

For the current overall release/migration state, use [`current-production-state.md`](current-production-state.md).
