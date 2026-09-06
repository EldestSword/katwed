# Contributing to Katwed!

Katwed! is currently a one-person project assisted by coding agents. Keep changes small enough to understand, but complete enough to use.

## Before changing code

1. Read `README.md`.
2. Read `docs/current-production-state.md`.
3. Read `AGENTS.md`.
4. Read `docs/architecture.md` for architecture-sensitive work.
5. Inspect the current implementation and Git status before replacing or extending a system.

`docs/current-production-state.md` is the source of truth for what is currently merged/released and which production migrations are applied. Older feature documents may preserve their original pre-release verification language.

## Current production baseline

The production Supabase project currently has **48 applied migrations**, ending at:

```text
20260906084106_host_typed_answer_review.sql
```

Never rewrite an applied migration. Add a new chronological forward migration and preserve established grants, RLS, compatibility wrappers and security boundaries.

The portable quiz format currently exports v12 and imports v1-v12. The question registry currently contains ten knowledge-scored question formats.

## Local work

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Set `VITE_DEMO_MODE=true` in `.env.local` for credential-free development. Never commit that file.

For Supabase-backed development, use only the public browser key in frontend environment variables. Never expose or commit a service-role credential.

## Validation

Before committing normal application changes, run:

```bash
npm run check
npm run test:e2e
```

`npm run check` runs lint, typecheck, the Vitest suite and a production build.

Add focused tests for game rules, phase validation, player interaction, safe-state boundaries and any changed persistence behaviour. Use the local Supabase/concurrency/load scripts when the affected subsystem requires database or contention verification.

Use British English for visible copy and documentation.

## Production migrations

Production changes are forward-only.

- Never edit an applied migration in place.
- Keep database validation authoritative.
- Preserve owner checks, RLS and explicit grants.
- Preserve stale-client compatibility where an existing wrapper deliberately supports it.
- Keep service-role credentials out of the browser.
- Update `docs/current-production-state.md` whenever a migration is applied to production.

## Deployment

Katwed is deployed through Netlify from the GitHub repository, with `https://katwed.co.uk` as the public hostname and `https://katwed.netlify.app` as the fallback.

Production deployment remains deliberate during active development. A push to GitHub is not automatically a release decision; follow the project owner's current Netlify setting and release intent.

When a feature actually ships, reconcile its status in the current-source-of-truth documents rather than leaving README/architecture/agent guidance describing it as pending.

## Documentation

Keep these roles distinct:

- `README.md` - current product/repository overview.
- `docs/current-production-state.md` - authoritative release/migration/feature snapshot.
- `docs/architecture.md` - current system architecture and boundaries.
- feature documents - detailed design/security/verification records, which may intentionally preserve historical implementation context.
- `katwed-quiz-format-v*.md` and matching schemas - versioned portable-format contracts.

## Commits

Use concise imperative commit messages. Do not include build output, dependency folders, browser reports, local databases, local Supabase state or secrets. Stage only files that belong to the change.
