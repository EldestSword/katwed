# Katwed!

A playful, live multiplayer quiz game in which players identify the **two team members combined into a single AI-generated face**.

The project is intended to provide a simple, browser-based alternative to Kahoot for this specific game format. The central rule is strict:

> A player must select both correct people, and no incorrect people, to score.

Selecting only one correct person earns no points.

---

## Project status

Version 1 is implemented as a React, Vite and TypeScript application. It includes the public landing, join and player routes; a protected host dashboard, quiz editor and live-game controller; local multi-tab demo mode; Supabase migrations and RPC functions; automated tests; and Netlify configuration. The current review suite completes all three demo questions with three players on desktop and mobile-sized Chromium.

The local demo is the quickest way to explore the complete flow. Production use still requires a real Supabase project, applying the migrations, and creating a host account. The migration and browser client are implemented, but this repository has not been tested against the project owner’s eventual Supabase instance.

## Screenshots

Screenshots will be added after the first hosted deployment.

- Landing page — _placeholder_
- Mobile answer screen — _placeholder_
- Host live-game screen — _placeholder_
- Quiz editor — _placeholder_

## Architecture summary

Katwed! keeps game rules and domain models separate from the interface. Screens use the `GameRepository` contract; development uses the demo repository while configured deployments use Supabase. Supabase is authoritative in production: player writes use security-definer RPC functions, scoring happens in SQL, and player-safe state omits correct IDs until reveal.

Demo state is synchronised between tabs with `BroadcastChannel` and persisted in browser storage. Reconnect tokens, locked answer choices and player presence survive ordinary refresh/reconnect flows. It is deliberately development-only: `VITE_DEMO_MODE=true` is ignored by production builds.

## Local setup

Requirements are Node.js 20 or newer, npm and Git.

```bash
npm install
copy .env.example .env.local
```

On macOS or Linux, use `cp .env.example .env.local`. For the local demo, set:

```dotenv
VITE_DEMO_MODE=true
```

Then run:

```bash
npm run dev
```

Open the host area, choose **Enter demo host area**, and launch **The Curious Crew**. Open its join link in other tabs to add players. The seven-person roster and three portraits are fictional. Demo state survives refreshes; clear site data for the local origin to reset it. Uploaded demo images are stored in IndexedDB rather than quiz rows.

## Supabase setup

1. Create a Supabase project.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
3. Link this folder and apply the migrations:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. Enable email/password authentication in **Authentication → Providers → Email**.
5. Create or invite a host in **Authentication → Users**.
6. Copy the project URL and public anon key into `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   VITE_DEMO_MODE=false
   ```

7. Restart the development server.

Never put the service-role key in a `VITE_` variable. Every `VITE_` value is bundled into browser code.

### Migrations, storage and host accounts

The SQL files in [`supabase/migrations`](supabase/migrations) create the schema, constraints, indexes, Row Level Security, narrow RPC functions, Realtime publication entries and the `question-images` bucket. Migration `202607300004_room_and_rpc_hardening.sql` makes room codes unambiguous for their full lifetime, prevents closed-room reactivation, constrains restart, adds token-validated presence updates and makes RPC execution grants explicit.

The bucket accepts JPEG, PNG and WebP files up to 8 MB. Uploads are authenticated and owner-prefixed. Reads are public because current portraits must display for account-free players; UUID filenames are unguessable and never contain correct names. The editor scales the longest edge to at most 1,600 pixels and converts images to WebP before upload.

Hosts are Supabase Auth users. A profile row is created automatically. Players do not need accounts: they receive an opaque reconnect token and only its SHA-256 digest is stored.

## Netlify deployment

Connect this GitHub repository in Netlify. The committed [`netlify.toml`](netlify.toml) uses `npm run build`, publishes `dist`, selects Node.js 20 and redirects application routes to `index.html`.

Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_DEMO_MODE=false` in Netlify’s environment-variable settings. Do not deploy a real `.env` file. Without Supabase values, Katwed! shows a configuration message instead of silently enabling demo mode.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Production | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Production | Public browser anon key protected by RLS |
| `VITE_DEMO_MODE` | Local demo only | Must be exactly `true`; ignored in production builds |

## Testing commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check
```

`npm run check` runs lint, type checking, unit/component tests and a production build. Playwright is separate because its first run may download Chromium.

## Project structure

```text
src/
  app/                 routing and unexpected-error boundary
  components/          reusable interface pieces
  features/            authentication, player game and quiz-editor logic
  hooks/               countdown and live-state hooks
  lib/demo/            local multi-tab repository and sample data
  lib/supabase/        Supabase client and repository
  routes/              public, player and host pages
  services/            repository contract, sessions and image handling
  styles/              responsive Katwed! identity
  test/                shared test setup
  types/               central domain models
  utils/               exact-pair scoring and leaderboard ordering
supabase/migrations/   schema, policies, functions and Storage
tests/e2e/             Playwright smoke tests
```

## Security notes

- Correct member IDs are absent from player-safe state before `reveal`.
- The browser never receives a service-role credential.
- Hosts can manage only quizzes they own.
- Anonymous users cannot select directly from game tables.
- The database validates the room, player token, phase, active question, deadline, pair shape, active roster membership and duplicate submissions.
- Database scoring is authoritative and matches the central TypeScript scoring module.
- Demo mode is for local development, not production.

## Troubleshooting

- **“Supabase is not configured”** — add both Supabase variables, or set `VITE_DEMO_MODE=true` locally and restart Vite.
- **Demo login is missing** — confirm the value is exactly `true`; demo access is deliberately disabled by production builds.
- **Image upload fails** — apply the Storage migration, sign in again, and use JPEG, PNG or WebP under 8 MB.
- **A player cannot rejoin** — use the same browser origin so its reconnect token remains available. Closed rooms cannot be restored.
- **Playwright cannot find a browser** — run `npx playwright install chromium`.
- **Updates appear delayed** — clients refetch after Realtime notifications and use a small safety poll; check Realtime configuration. Presence changes are best effort when a browser is terminated abruptly.
- **`npm audit` reports two React Router findings** — npm counts the direct and transitive packages separately for the same [RSC-mode advisory](https://github.com/advisories/GHSA-qwww-vcr4-c8h2). Katwed! is a client-only SPA and does not use React Server Components. The latest published React Router release is installed; do not use `npm audit fix --force`, which currently proposes a downgrade.

---

## 1. Project purpose

The application will allow a host to run a live quiz for colleagues using a laptop or shared screen, while players join from their own phones.

Each question displays a merged image created from two members of the team. Players select exactly two names from the full team roster and submit their answer before the timer expires.

The app should feel quick, clear and enjoyable rather than overloaded with features. It is not intended to reproduce every part of Kahoot.

---

## 2. Core game rule

For every question:

- One image represents a combination of exactly two team members.
- Every team member can appear as an answer option.
- A player must select exactly two names.
- The answer can only be submitted when exactly two names are selected.
- The order in which the names are selected does not matter.
- The player scores only when both selected names match the correct pair.
- One correct name and one incorrect name scores zero.
- One correct name on its own scores zero.
- More than two names cannot be selected.

Example:

Correct answer:

- Ross
- Carol

| Player selection | Result |
|---|---|
| Ross + Carol | Correct |
| Carol + Ross | Correct |
| Ross only | Cannot submit |
| Ross + Roger | Incorrect |
| Carol + Steph | Incorrect |
| Ross + Carol + Roger | Not permitted |

---

## 3. Intended users

### Host

The host runs the quiz from a laptop or desktop computer.

The host should be able to:

- Create and edit a quiz.
- Add the team roster once.
- Upload a merged image for each question.
- Mark the two people represented in each image.
- Set a question timer.
- Start a live game.
- Display a room code and QR code.
- See players joining the lobby.
- Start each question.
- See how many players have answered.
- reveal the correct pair.
- Display the leaderboard.
- Move to the next question.
- End or restart the game.

### Players

Players join from a phone, tablet or computer.

Players should be able to:

- Open the public game URL.
- Enter a room code.
- Enter a nickname.
- Wait in the lobby.
- View the current question.
- Select exactly two team members.
- Change their selections before submitting.
- Submit once exactly two names are selected.
- See whether their answer was correct.
- View the leaderboard between questions.
- Reconnect if the page is accidentally refreshed.

Players should not need to:

- Install an app.
- Create an account.
- Receive an individual invitation.
- Be connected to the same Wi-Fi network.

---

## 4. Suggested game flow

### Host flow

1. Open the host area.
2. Select an existing quiz or create a new one.
3. Click **Start game**.
4. A six-digit room code is generated.
5. The lobby appears on the shared screen.
6. Players join using the room code or QR code.
7. The host starts the quiz.
8. The question image and timer appear.
9. Players submit their chosen pair.
10. The host sees the number of submitted answers.
11. When the timer ends, or when the host chooses, answers are locked.
12. The correct pair is revealed.
13. Scores are calculated.
14. The leaderboard is displayed.
15. The host advances to the next question.
16. The final leaderboard and podium are shown at the end.

### Player flow

1. Open the game website.
2. Enter the room code.
3. Enter a nickname.
4. Wait for the host to begin.
5. View the merged face.
6. Select two names.
7. Press **Lock in**.
8. Wait for the reveal.
9. See whether the answer was correct.
10. Continue automatically when the host advances.

---

## 5. Minimum viable product

The first working version should include only the features required to run a complete live quiz.

### Quiz management

- Create a quiz.
- Edit the quiz title.
- Create and edit a team roster.
- Add, reorder and delete questions.
- Upload one image per question.
- Select the two correct team members.
- Set a time limit.
- Save quiz data.

### Live game

- Generate a unique room code.
- Allow players to join by code.
- Show a live lobby.
- Prevent duplicate nicknames within the same game.
- Start the game from the host screen.
- Synchronise questions across all connected devices.
- Allow exactly two selections.
- Lock answers after submission or when time expires.
- Calculate exact-pair scoring.
- Reveal the correct answer.
- Show a leaderboard.
- Show final results.
- Allow the host to restart or close the room.

### Reliability

- Prevent late answers after a question closes.
- Prevent a player from submitting more than once.
- Restore a player session after an accidental refresh.
- Preload question images where practical.
- Handle temporary connection loss clearly.
- Avoid exposing correct answers to the player browser before the reveal where practical.

---

## 6. Scoring

The initial scoring model should be simple and transparent.

### Recommended default

- Exact correct pair: **1 point**
- Any other answer: **0 points**
- No answer: **0 points**

Response time should not affect the base score.

Where two or more players finish with the same score, total response time across correctly answered questions may be used as a tie-breaker.

This keeps the quiz focused on recognition rather than rewarding frantic tapping.

### Optional future scoring mode

A later version may offer:

- 1,000 base points for a correct pair.
- A configurable speed bonus.
- No partial credit.
- No negative points.

The host should be able to choose the scoring mode before starting a game.

---

## 7. Question structure

Each question should contain:

- A unique ID.
- A merged image.
- Two correct roster member IDs.
- A time limit.
- A display order.
- Optional host notes.
- Optional reveal caption.

Example conceptual structure:

```json
{
  "id": "question-001",
  "imageUrl": "/quiz-images/question-001.webp",
  "correctMemberIds": ["member-ross", "member-carol"],
  "timeLimitSeconds": 30,
  "order": 1,
  "revealCaption": "Ross + Carol"
}
```

Correct answers must be stored as member IDs rather than plain names so that changing a display name does not break existing questions.

---

## 8. Team roster structure

Each roster member should contain:

- A unique ID.
- A display name.
- An optional short name.
- An optional profile image.
- An active or inactive status.

Example:

```json
{
  "id": "member-ross",
  "displayName": "Ross",
  "shortName": "Ross",
  "active": true
}
```

The first version should display all active roster members as answer options.

There should be no hard-coded six-answer limit. The layout must work cleanly with seven team members and remain usable with larger rosters later.

---

## 9. User interface requirements

### General

- Mobile-first for players.
- Desktop-first for the host.
- Large tap targets.
- High contrast.
- Clear selected and unselected states.
- No important instruction communicated by colour alone.
- Minimal text during active questions.
- No horizontal scrolling.
- Responsive across common phone sizes.
- British English throughout.

### Player answer screen

The player screen should show:

- The merged image.
- The question number.
- The timer.
- The complete team roster.
- A visible count such as **Select 2 people**.
- A clear selected state.
- A **Lock in** button.

The **Lock in** button must remain disabled until exactly two names are selected.

After submission:

- The selected pair becomes locked.
- The player cannot alter the answer.
- A waiting state appears until the host reveals the result.

### Host question screen

The shared host screen should prioritise:

- The question image.
- The remaining time.
- The number of submitted answers.
- The number of connected players.
- A control to close answers early.
- A control to reveal the answer.

Individual player answers should not be displayed before the question closes.

---

## 10. Suggested technical approach

### Front end

Recommended:

- React
- Vite
- TypeScript
- Standard CSS or CSS Modules

The project should avoid unnecessary libraries. Every dependency must have a clear purpose.

### Hosting

Recommended:

- GitHub for source control.
- Netlify for deployment.

### Back end and real-time synchronisation

Recommended:

- Supabase database.
- Supabase Realtime.
- Supabase Storage for question images if required.
- Supabase anonymous or guest access for players.
- Protected host access for quiz administration.

### Core real-time events

The application will need to synchronise events such as:

- Player joined.
- Player left.
- Game started.
- Question opened.
- Answer submitted.
- Question closed.
- Answer revealed.
- Leaderboard displayed.
- Next question opened.
- Game ended.

The database should remain the authoritative source of truth. Real-time events should update connected screens, but important game state must survive a refresh.

---

## 11. Suggested data entities

The application will likely require the following entities:

### Quiz

- ID
- Title
- Created date
- Updated date
- Owner
- Status

### Roster member

- ID
- Quiz ID
- Display name
- Active status
- Display order

### Question

- ID
- Quiz ID
- Image URL
- First correct member ID
- Second correct member ID
- Time limit
- Display order
- Reveal caption

### Game session

- ID
- Quiz ID
- Room code
- Status
- Current question ID
- Current phase
- Started date
- Ended date

### Player

- ID
- Game session ID
- Nickname
- Reconnect token
- Connected status
- Total score
- Total correct response time

### Player answer

- ID
- Game session ID
- Question ID
- Player ID
- First selected member ID
- Second selected member ID
- Submitted date
- Response time
- Correct status
- Points awarded

---

## 12. Game phases

The live session should have explicit phases.

Suggested phases:

- `lobby`
- `question`
- `locked`
- `reveal`
- `leaderboard`
- `finished`

Only the host can change the game phase.

Player actions must be checked against the current phase. For example, answers can only be submitted during `question`.

This reduces timing bugs and makes the game easier to reason about.

---

## 13. Security and fairness

The first version does not require enterprise-grade security, but it must avoid obvious shortcuts and abuse.

Requirements:

- Host administration must be protected.
- Players should only access the room they joined.
- Room codes should expire after the game.
- Correct answers should not be returned through normal player-facing requests before the reveal.
- Answer submissions must be validated on the server.
- A player must not be able to submit more than once per question.
- A player must not be able to select the same person twice.
- The two correct members must be different people.
- Uploaded files must be restricted to supported image types and reasonable file sizes.
- Public database permissions must follow least-privilege principles.
- Supabase service-role credentials must never be included in browser code.

The game is intended for friendly internal use, not hostile public competition. Sensible safeguards are still required because browsers are nosy little filing cabinets.

---

## 14. Accessibility

The application should:

- Support keyboard navigation.
- Use semantic buttons and headings.
- Provide visible focus indicators.
- Include alternative text for interface graphics.
- Avoid relying only on red and green to indicate correctness.
- Maintain readable text sizes.
- Respect reduced-motion preferences.
- Provide a mute option for sound effects.
- Avoid rapidly flashing animations.
- Clearly announce game-state changes for screen-reader users where practical.

The merged quiz image itself may not have meaningful alternative text without revealing the answer. During the question, it can use neutral alternative text such as:

> AI-generated merged portrait for the current question.

The names can be announced after the reveal.

---

## 15. Error handling

The application should provide clear messages for:

- Invalid room code.
- Closed or expired game.
- Duplicate nickname.
- Lost connection.
- Failed answer submission.
- Question image failing to load.
- Host disconnecting.
- Player attempting to join after the game has started.
- Player refreshing during a question.
- Supabase or network errors.

Technical errors should be logged without exposing sensitive configuration information to the user.

---

## 16. Out of scope for the first version

The following should not be included in the initial build unless required later:

- Public user registration.
- Social login.
- Payments or subscriptions.
- Public quiz discovery.
- Thousands of simultaneous players.
- Native iOS or Android apps.
- AI face generation inside the quiz app.
- Video questions.
- Open-ended answers.
- Full Kahoot feature parity.
- Complex themes.
- Chat between players.
- Player-created quizzes.
- Moderation tooling.
- Multiple simultaneous hosts.

Keeping these out prevents the first version becoming a purple octopus of unfinished menus.

---

## 17. Future enhancements

Possible later additions include:

- QR-code joining.
- Multiple saved quizzes.
- Duplicate quiz.
- Import and export quiz data.
- Downloadable CSV results.
- Team mode.
- Configurable scoring.
- Speed bonus.
- Question categories.
- Sound effects and background music.
- Host-controlled pause.
- Automatic question progression.
- Custom themes.
- Player avatars.
- Podium animation.
- Question statistics.
- Most commonly confused team members.
- Accuracy by participant.
- Accuracy by source person.
- Large-roster search.
- Image cropping and compression.
- Randomised answer order.
- Private share links.
- Spectator mode.
- Remote co-host.
- PWA installation.
- Offline host preparation.
- A non-live self-paced mode.

---

## 18. Development principles

The project should follow these principles:

1. Build the smallest complete version first.
2. Keep game rules in one central scoring module.
3. Validate important actions on the server.
4. Keep host and player interfaces clearly separated.
5. Prefer readable code over clever code.
6. Use strong TypeScript types.
7. Avoid duplicated business logic.
8. Add comments only where they explain why something exists.
9. Never hard-code real team names into reusable components.
10. Keep configuration in environment variables.
11. Ensure the project can be run locally with straightforward commands.
12. Include useful error messages rather than silent failure.
13. Test the game with several browser windows before live use.
14. Treat mobile usability as a core requirement, not a later polish task.

---

## 19. Testing requirements

At minimum, tests should cover:

### Scoring tests

- Correct pair in original order.
- Correct pair in reverse order.
- One correct and one incorrect.
- Two incorrect selections.
- Duplicate selection.
- Missing selection.
- More than two selections.
- Submission after question closure.
- Duplicate submission.

### Game-state tests

- Joining an open lobby.
- Rejecting an invalid room code.
- Preventing duplicate nicknames.
- Starting a game.
- Opening a question.
- Closing a question.
- Revealing an answer.
- Updating scores.
- Advancing to the next question.
- Finishing the game.
- Restoring a refreshed player.

### Interface tests

- Exactly two names can be selected.
- The submit button is disabled with fewer than two selections.
- Selecting a third name either replaces a prior selection or is blocked.
- Submitted answers cannot be changed.
- Host controls are not visible to players.
- Layout works on common mobile widths.
- Long names do not break answer buttons.

---

## 20. Definition of done for version 1

Version 1 is complete when:

- A host can create a quiz with a seven-person roster.
- A host can add merged images and identify the correct two people.
- A host can launch a live room.
- At least seven players can join from separate devices or browser sessions.
- All players receive each question at approximately the same time.
- Each player can select exactly two names.
- Only the exact correct pair scores.
- Scores remain correct after every round.
- The host can reveal answers and display a leaderboard.
- The game can reach a final results screen without manual database editing.
- Refreshing a player device does not create a second player.
- No secret keys are exposed in the deployed browser code.
- The project can be deployed through GitHub and Netlify.
- Setup instructions are documented.

---

## 21. Instructions for ChatGPT or coding assistants

When assisting with this project:

- Assume the project owner is not an experienced developer.
- Explain setup steps in plain British English.
- Do not provide vague fragments without saying where they belong.
- Prefer complete replacement files rather than isolated patches.
- Preserve existing working features when making changes.
- Inspect the current project structure before proposing edits.
- Do not invent files, routes, environment variables or database tables without documenting them.
- Provide exact commands and clearly state where to run them.
- Include database migrations where schema changes are required.
- Update this README when architecture or requirements materially change.
- Never expose secrets in code, screenshots, logs or documentation.
- Avoid changing the agreed game rule:
  - exactly two selections;
  - both must be correct;
  - no partial credit.
- Test locally before describing a change as complete.
- When a bug is reported, identify the likely cause before rewriting large areas of the application.
- Use the simplest reliable implementation rather than introducing fashionable complexity.

---

## 22. Working project name

Application name:

**Katwed!**

The name does not affect the game logic.

Possible alternatives:

- Merge Match
- Pair Apparent
- Two of Us
- Face Pair
- Fusion Line-up
- Who²
- Double Take

---

## 23. Summary

Katwed! is a private, browser-based multiplayer game for identifying two colleagues combined into one generated portrait.

Its defining features are:

- live host-led play;
- phone-based participation;
- exactly two selectable answers;
- exact-pair scoring;
- no partial credit;
- a reusable team roster;
- simple Netlify deployment;
- real-time synchronisation through Supabase.

The first goal is not to build another Kahoot. It is to build one focused game format properly.
