# Working on Katwed!

Read these before changing code:

1. `README.md`
2. `docs/current-production-state.md`
3. `docs/architecture.md` for architecture-sensitive work

`docs/current-production-state.md` is the authoritative repository statement of the current feature set and production migration state. Historical feature/release documents may preserve pre-release wording and must not be used to infer current deployment status.

## Production baseline

- Treat the linked Supabase project and Netlify site as live production systems.
- Production currently has **48 applied migrations**, through `20260906084106_host_typed_answer_review.sql`.
- There is currently no documented pending migration stack after that migration.
- Never edit an applied migration in place. Add a new chronological forward migration and preserve compatibility with production history.
- Netlify releases remain deliberate. Do not assume every GitHub push should trigger a production release; respect the project owner's current deployment setting and release intent.

## Behaviour and security invariants

- Preserve the Mash-up rule: players select exactly two different people and score only when both are correct.
- Never introduce partial-credit scoring for Mash-up questions. Multiple Select may use only its explicit configured scoring behaviour.
- Do not reveal correct answers or answer-bearing configuration to player-facing queries before the established reveal phase.
- Preserve the player-safe state boundary and withhold leaderboard rows/cumulative totals until their permitted phases. Final results require the established explicit reveal flow.
- Keep host-only response detail and Typed Answer review outside player-safe state.
- Preserve the three-surface model: private Controller at `/host/game/:sessionId/control`, read-only Presentation at `/host/game/:sessionId/present`, and responsive Player at `/play/:roomCode`.
- Keep database validation authoritative for scoring, Typed Answer payloads, deadlines, phase changes, team/session state, Survivor lives, Buzz claims, Wagers, Power-Ups and tie-break resolution.
- Never commit secrets, real `.env` files, service-role credentials or personal team data.
- Never put a service-role credential in a `VITE_` variable.

## Current extension points

- The question registry currently contains ten knowledge-scored formats. Update the registry, domain unions, authoring, safe/reveal contracts, scoring and database validation together when adding a new type.
- Portable export currently targets v12 and imports v1-v12. Older portable schemas are versioned compatibility contracts; do not silently rewrite them to newer semantics.
- The audience catalogue currently contains 51 themes and 153 compatible backgrounds.
- Quiz Settings currently has six quiz-wide sections: Themes, Backgrounds, Answer colours, Cover, Game and People bank. Keep question-specific authoring out of this modal unless the information is genuinely quiz-wide.
- Inspect the existing implementation before replacing a system or abstraction.
- Prefer complete, tested changes over unfinished scaffolding.
- Keep mobile player usability, large touch targets and accessibility central.
- Use British English in code-facing copy and documentation.

## Validation

Before committing application changes, run:

```bash
npm run check
npm run test:e2e
```

`npm run check` covers lint, typecheck, unit/component tests and production build. Run focused Supabase, concurrency, load or media tooling when the affected subsystem requires it.

Do not push broken code.

## Documentation rule

Update `README.md`, `docs/current-production-state.md`, `docs/architecture.md` and any relevant specialist document whenever setup, architecture, migrations, feature status, portable format, catalogue size or safety boundaries change.

Do not leave a merged/released feature described as "pending" in a current-source-of-truth document.
