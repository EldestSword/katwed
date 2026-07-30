# Working on Katwed!

- Read `README.md` fully before making changes.
- Preserve the defining rule: players select exactly two different people and score only when both are correct.
- Never introduce partial-credit scoring.
- Use British English in code-facing copy and documentation.
- Do not reveal correct answers to player-facing queries before the `reveal` phase.
- Never commit secrets, real `.env` files, service-role credentials or personal team data.
- Inspect the existing code before replacing a system or abstraction.
- Prefer complete, tested changes over unfinished scaffolding.
- Keep mobile player usability, large touch targets and accessibility central.
- Keep database validation authoritative for scoring, deadlines and phase changes.
- Run `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` before committing.
- Run the relevant Playwright tests for changes to critical host/player flows.
- Update the README whenever setup, architecture, environment variables or migrations change.
- Do not push broken code.
