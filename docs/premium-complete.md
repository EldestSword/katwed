# Katwed premium redesign

This branch combines the public homepage redesign, the corrected Ka/twed wordmark split, host/editor visual polish, compact music selection and a clearer post-question Typed Answer review.

## Scope

- Public homepage now represents Katwed as the whole live quiz platform rather than the original mash-up game.
- Shared logo colour split is **Ka** + **twed** + **!**.
- Authenticated editor work area gives the editable controls the widest column, moves the audience preview to a supporting rail, and keeps question-setting sections focused one at a time.
- Quiz Settings theme/background browsing uses larger visual tiles and a stronger selected state.
- Game Setup music packs use compact cards; only the selected pack expands its descriptive copy.
- Host controller receives the same restrained synthwave pink/purple backstage palette.
- Typed Answer review opens after answers close when there are incorrect submissions. The popup shows only incorrect answers, with large player/answer rows and one-click **Accept answer** controls. It can be reopened manually.
- A new authenticated owner-only RPC reads current incorrect Typed Answers after the question closes, independently of the 15-player live-answer detail cap. It does not expose those answers to players and is not on the live polling path.

## Database

Forward migration:

`20260906084106_host_typed_answer_review.sql`

The RPC is authenticated-only, checks quiz ownership and only returns the current Typed Answer question during `locked`, `reveal`, `leaderboard` or `finished`. It returns incorrect, not-yet-host-accepted responses only.

## Release order

1. Validate the complete branch in GitHub CI.
2. Apply the forward migration to production before the matching frontend deploy.
3. Verify the existing frontend still operates normally against the migrated database.
4. Merge the combined redesign PR to `main` and allow the normal Netlify deployment.
5. Smoke-test homepage, editor, quiz settings, game setup and a Typed Answer review flow before the broader Phase 2 gameplay UAT.
