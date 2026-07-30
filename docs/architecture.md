# Katwed! architecture

## Live surfaces

```text
Controller (/control) ──host actions──> GameRepository ──> authoritative state
        │                                      │
        └── PresentationStage preview          ├── Presentation (/present)
                                               └── Players (/play/:roomCode)
```

The controller and presentation fetch the same safe game state. `PresentationStage` renders both the full 16:9 view and compact preview. Only the controller calls phase-changing repository methods.

## Question engine

`Question` is a strict discriminated union with six variants. Every variant contains the common prompt, supporting text, timer, points, order, caption, media and visibility settings. Type-specific answer keys exist only on authoring and trusted host/server models.

`PlayerAnswerPayload` is a second discriminated union. `scoreQuestion` rejects a payload whose discriminator does not match the active question before applying type-specific validation.

The registry owns human-facing metadata and coordinates shared scoring. Factories, editor validation and renderers are separate modules so a future type can be added without a single large route component.

## Safe-state boundary

`SafeQuestion` removes the answer-bearing fields for each variant. The demo repository constructs it explicitly rather than deleting keys from an unsafe object. The PostgreSQL safe-state function calls `question_to_json(..., false)` and strips captions and hidden scoring configuration.

Reveal payloads are also discriminated. They contain only the answer and anonymous aggregates appropriate to the current type, and they are created only in `reveal`, `leaderboard` or `finished`.

## Persistence

The production schema has:

- common relational columns for lifecycle and indexing;
- constrained `media`, `type_config`, `answer_key` and `answer_payload` JSONB;
- relational question option rows;
- check constraints plus a type-specific validation trigger;
- owner-scoped RLS;
- security-definer RPCs with explicit grants.

The answer key remains on the protected question row. Anonymous users cannot select game tables directly.

Demo mode stores the same domain models. A browser lock serialises writes, local storage preserves refreshes and `BroadcastChannel`/storage events notify other tabs.

## Adding a future type

1. Add the discriminator and typed question, safe question, answer and reveal variants.
2. Add a factory and registry entry.
3. Add editor and runtime validation.
4. Add player and reveal renderers.
5. Add TypeScript scoring and PostgreSQL scoring.
6. Extend database validation and safe-state construction.
7. Add leakage, unit, component and browser tests.
