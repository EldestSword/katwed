# Katwed premium redesign release record

**Status:** merged to `main` and part of the current release baseline.

The premium redesign was merged on 6 September 2026 in commit:

```text
cb39a247dad4267649b664fb2069b1c12b99725c
```

The later Quiz Settings completion/hotfix was merged the same day in:

```text
168c28870bf48b1103ac681b0b968a041936204f
```

For current overall feature/migration status, use [`current-production-state.md`](current-production-state.md). This file records the premium release specifically.

## Shipped scope

- Public homepage represents Katwed as the full live quiz platform rather than only the original Mash-up concept.
- Shared brand treatment uses the **Ka** + **twed** + **!** split.
- Authenticated Studio/editor gives the authoring workspace the strongest hierarchy and keeps Presentation/Player previews as supporting context.
- Question-specific editor sections stay focused rather than presenting one enormous form.
- Quiz Settings is a dedicated quiz-wide modal.
- Theme/background browsing uses visual tiles and clear selected states.
- Game Setup sound packs use compact selection cards.
- Host Controller uses the premium restrained synthwave backstage treatment.
- Typed Answer review surfaces incorrect submitted answers after answers close and provides owner-only one-click **Accept answer** correction using the existing authoritative scoring path.
- The Typed Answer review can be reopened manually and remains outside Player-safe state.

## Final Quiz Settings structure

The follow-up Studio completion separated Quiz Settings into six dedicated sections:

1. Themes
2. Backgrounds
3. Answer colours
4. Cover
5. Game
6. People bank

Quiz Settings opens on Themes. Backgrounds and Cover no longer share one long Appearance panel, and People bank is no longer embedded in the permanent per-question sidebar.

Closing the modal neither saves nor discards. The ordinary **Save quiz** action remains the persistence boundary.

## Database

The premium Typed Answer review shipped with forward migration:

```text
20260906084106_host_typed_answer_review.sql
```

The RPC is authenticated/owner-only, checks quiz ownership and only returns current incorrect Typed Answer responses after answers close in permitted phases. It does not expose those responses to Players and is not part of Player-safe state.

The production Supabase ledger confirms this migration is applied and is currently the 48th/latest production migration.

The later six-section Studio settings hotfix required **no database migration**.

## Verification

The premium branch passed application checks, desktop Chromium and mobile Chromium before merge. The Studio settings follow-up added/updated browser contracts for the sectioned modal and a focused 320x568 mobile reachability regression covering the portalled dialog and sticky Done action.

Historical pre-merge release instructions have been removed from this document so it does not imply that the already-merged work is still awaiting release.
