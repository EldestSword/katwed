# Contributing to Katwed!

Katwed! is currently a one-person project assisted by Codex. Keep changes small enough to understand, but complete enough to use.

## Before changing code

1. Read `README.md` and `AGENTS.md`.
2. Inspect the current implementation and Git status.
3. Preserve the exact-pair, no-partial-credit rule.

## Local work

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Set `VITE_DEMO_MODE=true` in `.env.local` for credential-free development. Never commit that file.

## Validation

Before committing, run:

```bash
npm run check
npm run test:e2e
```

Add focused tests for game rules, phase validation and player interaction changes. Use British English for visible copy. Update the README and architecture documentation when setup, schema boundaries or architecture change.

## Production migrations

The live Supabase project has applied migrations through `202608070002_quiz_covers.sql`. Never rewrite an applied migration; add a new chronological forward migration, preserve existing grants and security boundaries, and keep pending migrations unapplied until a deliberate production release.

## Deployment

The Netlify site is live, but production builds are deliberately controlled during active development. A GitHub push is not automatically a release decision. Test locally and reactivate or trigger Netlify deployment only when the project owner intends a production release.

## Commits

Use a concise imperative message. Do not include build output, dependency folders, browser reports, local databases or secrets. Stage only files that belong to the change.
