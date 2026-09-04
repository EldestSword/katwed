# Connections — Phase 2 Pass 5B

Connections is a first-class Standard question type, including Team sessions. It contains 2–6 ordered `{ id, text }` clues, one primary connection and up to 19 accepted alternatives. Clue text is trimmed, 1–200 characters and unique ignoring case; IDs are stable and unique. Answers reuse Typed Answer's exact Unicode normalisation, meaningful-text validation and 120-character limit. There is no fuzzy judging or automatic clue timer.

## Authoritative progression and scoring

Forward migration `20260904122702_connections_questions.sql` follows the pending Ordering/Matching migration. It adds `game_sessions.connection_clue_count`, initially zero. First start, Start round and Next initialise it to one for Connections and zero for other types. Round Intro, restart/lobby and finish/close clear it. Locked retains the last genuine stage; reveal shows all clues. New questions never inherit a previous stage.

The owner-only `host_reveal_connection_clue(uuid)` RPC locks the session with `FOR UPDATE`, then checks ownership, active Standard session, question phase/type, open timer and a valid stage below the final clue. It increments only the count, once. It never changes deadlines, phase, answers or scores. Anonymous execution is revoked; authenticated callers still must own the quiz. The ordinary Close answers and reveal/final-results actions remain separate.

For N clues and R currently visible, the available base is `floor(points × (N − R + 1) / N)`. Correct answers receive that value, then the existing Double Score multiplier. Wrong answers score zero. Connections always bypasses speed scoring, even with a malformed stored flag. TypeScript uses the pure `connectionStagePoints` helper and a repository-supplied scoring context; PostgreSQL reads the locked session count. No player-supplied count is accepted.

The payload is exactly `{ type: 'connections', value: string }`. Existing answer uniqueness enforces one guess per player/question. Submitting early and being wrong does not permit another attempt after a new clue, and the existing answer cache restores submitted UI after refresh. Accepted alternatives contribute to existing correct-answer counts, response times, Team totals and Final Awards.

The hardened Standard answer path keeps its shared session lock. An answer that obtains that lock first scores at the previous stage while the host waits. A host reveal that commits first makes a later answer use the new stage. No additional per-clue answer rows or score mutations are introduced.

## Public state and Realtime

SafeQuestion contains only `visibleClues`, `revealedClueCount`, `totalClues` and `availablePoints`, alongside the existing safe base fields. Both repositories slice the authored sequence before serialisation. Unrevealed records and primary/alternative answers are absent from the public payload. Locked retains that prefix; answer reveal exposes all clues and only the primary answer, plus the existing authoritative correct-player-ID mechanism used for alternative-answer feedback. The lower-level serialiser without session context exposes zero clues.

The existing session broadcast trigger now includes the clue count. Each reveal produces one tiny `game_changed` room signal and its existing private controller-topic copy. A six-clue question therefore adds at most **five room refresh broadcasts plus five existing host-topic copies**. A 75-player answer burst produces zero answer broadcasts. There are no new channels, subscriptions, answer/player broadcasts, fetch paths, polling timers or polling-frequency changes.

## Authoring and screens

The editor supports adding, editing, removing and moving clues, the shared alternatives UX and a live points ladder. Base points and Double Score remain editable; the speed control is replaced by “Connections score by clue stage.” Duplicate questions and quizzes receive fresh clue IDs; quiz duplication also preserves remapped round references.

The private controller shows the next clue, current stage/value and a separate Reveal next clue button. Presentation and Player receive only safe content, with the list growing on the existing session refresh. Typed drafts and focus survive clue updates. Players see full clue text with wrapping and large answer controls at 320px. The 16:9 presentation uses two columns and denser typography for long lists; the compact preview alone truncates long clue text to two lines. There is no new animation framework.

Standard Team games retain individual guesses and their usual sum of player scores. Round Intro remains free of stale question content; leaderboard/commentary/award history is untouched. Head-to-Head Connections is blocked by editor choices and switch guidance, validation, portable import, server save and launch. Existing H2H types retain their paths. Portable exports use [v9](katwed-quiz-format-v9.md); versions 1–8 remain importable.

## Local verification

The focused tests cover authoring, stage arithmetic, exact answers, duplication, strict payloads, future-clue privacy, Demo progression, player draft/focus and refresh, alternative correctness, presentation, Teams/Rounds/H2H and v9/legacy imports. Dedicated browser checks author/save/reload and play early, late and wrong answers in Individual and Team sessions, plus six 200-character clues on 16:9, compact and 320px screens.

`supabase/tests/connections_test.sql` runs only against a disposable fully migrated database with a local `realtime.send` recorder. It checks every 2–6-clue point ladder, 19 malformed definitions/payloads, owner/phase/deadline guards, H2H save/launch rejection, privacy, round reset, one guess, Unicode matching, Double Score, malformed speed flags and a 75-player burst. The local recorder is test infrastructure, not a migration or production table. The entire SQL transaction rolls back.

`supabase/tests/connections_concurrency.mjs` exports a test accepting a fresh PostgreSQL client factory. A disposable PostgreSQL harness calls it after applying the full migration chain. It uses separate real transactions, verifies lock waits in `pg_stat_activity`, and checks answer-first=1000 and reveal-first=500. It uses the authenticated owner role for clue reveal and the anonymous role for answering. No hosted credentials or endpoint are embedded.

Production main, the hosted database and Netlify are untouched. This migration awaits a deliberate database-first release together with its pending predecessors. No prior migration or v1–v8 schema is edited, and no additional roadmap feature is included.

### Pass 5B results

- 481 focused unit/component tests across 38 files passed, including the new Connections tests and affected authoring, player, presentation, scoring, legacy import, Team and H2H coverage. One existing player-history presence assertion failed in the concurrent batch and passed unchanged when rerun alone; no production presence or polling code was changed.
- Six dedicated Playwright checks passed: Individual game, Team game and maximum-length clue layout, each on desktop Chromium and mobile Chromium. The desktop screenshots were inspected for presentation/reveal and 320px usability. No unrelated browser files or full test suites were run.
- The full migration chain passed on disposable PostgreSQL 17.10 with real pgcrypto and local Auth/Storage/Realtime fixtures. New Connections SQL and concurrency checks passed, alongside the existing Pinpoint, Core Rounds, Team and Ordering/Matching SQL fixtures and 12 additional Standard/H2H Pinpoint games.
- The 75-player burst recorded 75 answers at 166 points, zero answer broadcasts and exactly five room signals plus five existing host copies for six clues. Both transaction lock orders produced the expected 1000/500 scores.
- Type checking, lint and the local production build passed. No PR, merge, deployment or hosted migration application was performed.

### Files changed

- `docs/connections.md`
- `docs/katwed-quiz-format-v9.md`
- `docs/schemas/katwed-quiz-v9.schema.json`
- `README.md`
- `src/features/game/ConnectionClues.tsx`
- `src/features/game/Connections.test.tsx`
- `src/features/game/hostAnswerFormatting.ts`
- `src/features/game/HostConnectionsControls.tsx`
- `src/features/game/hostResponses.ts`
- `src/features/game/PlayerAnswerReveal.tsx`
- `src/features/game/PlayerConnectionsAnswer.tsx`
- `src/features/game/PlayerQuestion.tsx`
- `src/features/game/PlayerSubmissionSummary.tsx`
- `src/features/game/PresentationStage.tsx`
- `src/features/questions/connections.test.ts`
- `src/features/questions/connections.ts`
- `src/features/questions/factories.ts`
- `src/features/questions/registry.ts`
- `src/features/quiz-editor/ConnectionsEditor.tsx`
- `src/features/quiz-editor/duplicateQuiz.ts`
- `src/features/quiz-editor/validation.ts`
- `src/features/quiz-transfer/katwedQuizFormat.test.ts`
- `src/features/quiz-transfer/katwedQuizFormat.ts`
- `src/features/quiz-transfer/katwedQuizV7.test.ts`
- `src/features/quiz-transfer/katwedQuizV8.test.ts`
- `src/features/quiz-transfer/katwedQuizV9.test.ts`
- `src/features/scoring/standardScoring.ts`
- `src/features/typed-answer/typedAnswer.ts`
- `src/lib/demo/connections.test.ts`
- `src/lib/demo/DemoGameRepository.test.ts`
- `src/lib/demo/DemoGameRepository.ts`
- `src/lib/supabase/connectionsSafeState.test.ts`
- `src/lib/supabase/safeGameState.ts`
- `src/lib/supabase/SupabaseGameRepository.ts`
- `src/main.tsx`
- `src/routes/HostGamePage.test.tsx`
- `src/routes/HostGamePage.tsx`
- `src/routes/QuizEditorPage.test.tsx`
- `src/routes/QuizEditorPage.tsx`
- `src/services/gameRepository.ts`
- `src/services/playerSession.connections.test.ts`
- `src/services/playerSession.ts`
- `src/services/repository.ts`
- `src/styles/connections.css`
- `src/test/connectionsFixtures.ts`
- `src/types/domain.ts`
- `src/utils/scoring.ts`
- `supabase/migrations/20260904122702_connections_questions.sql`
- `supabase/tests/connections_concurrency.mjs`
- `supabase/tests/connections_test.sql`
- `tests/e2e/connections.spec.ts`
