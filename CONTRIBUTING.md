# Contributing to Katwed!

Katwed! is currently a one-person project assisted by Codex. Keep changes small enough to understand, but complete enough to use.

## Before changing code

1. Read `README.md` and `AGENTS.md`.
2. Inspect the current implementation and Git status.
3. Preserve the exact-pair, no-partial-credit rule.

## Local work

```bash
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

Add focused tests for game rules, phase validation and player interaction changes. Use British English for visible copy. Update the README when setup or architecture changes.

## Commits

Use a concise imperative message. Do not include build output, dependency folders, browser reports, local databases or secrets.
