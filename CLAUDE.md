# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rhythmic Gymnastics Attendance Management System - A full-stack web application for managing student attendance at a rhythmic gymnastics academy.

## Development Commands

### Client (React + Vite)
```bash
cd client
npm install              # Install dependencies
npm run dev              # Start dev server on port 3000
npm run build            # Build for production
npm run preview          # Preview production build
```

### Server (Node.js + Express)
```bash
cd server
npm install              # Install dependencies
npm start                # Start production server on port 5001
npm run dev              # Start with nodemon (auto-restart)
```

### Local Database
PostgreSQL is required — `server/database.js` exits if `DATABASE_URL` is unset.

```bash
brew install postgresql   # macOS
createdb rg_manager
```

Then put the connection string in the project-root `.env` (loaded by `server/loadEnv.js`):
```
DATABASE_URL=postgresql://localhost/rg_manager
```

Tables are created automatically on first server start. The default admin account is
`admin` / `admin123` (override with `ADMIN_INITIAL_PASSWORD`) — change it immediately.

### Both (Development Mode)
Run these in separate terminals:
1. `cd client && npm run dev` - Client on http://localhost:3000
2. `cd server && npm start` - Server on http://localhost:5001

### Unit tests (Jest)

Client and server have **separate** Jest setups and are run from their own directory —
there is no root `package.json`, so there is no one command that runs everything.

```bash
cd client && npm test          # jest — 1223 tests / 87 suites
cd server && npm test          # 1296 tests / 60 suites
```

- **The server suite is ESM** (`"type": "module"` + `transform: {}`, i.e. no Babel) and only
  works through its npm script, which supplies `--experimental-vm-modules`. Running plain
  `npx jest` in `server/` makes **44 of 45 suites fail to parse** ("Jest encountered an
  unexpected token") — it exits 1, but the summary line still reads `Tests: 3 passed`, so
  skimming the tail of the output makes a broken run look like a green one. Always use
  `npm test` here. In `client/` (Babel + CommonJS) `npx jest` is fine.
- Run **one file or one test**:
  ```bash
  cd client && npx jest EventForm                    # by filename substring
  cd client && npx jest -t "휴관일"                   # by test name
  cd server && npm test -- eventController           # note the -- before args
  ```
- `npm run test:watch` / `npm run test:coverage` exist on both sides.
- Tests live in `__tests__/` next to the code they cover. Both suites run **without a database
  or a running server** (the whole server suite finishes in under a second), so a failure means
  the code, not the environment. Only the e2e suite below needs real infrastructure.

## Architecture

### Tech Stack
- **Frontend**: React 18, React Router, Vite
- **Backend**: Node.js, Express, `pg` (node-postgres)
- **Database**: PostgreSQL (connection string in `DATABASE_URL`)
- **Authentication**: JWT (30-day), stored in localStorage + cookie (`client/src/utils/tokenStorage.js`)

### Data Flow & API Architecture

**Critical**: The app uses **relative API paths** (`/api/*`) instead of hardcoded URLs. This is essential for mobile and production compatibility.

- **Development**: Vite proxy forwards `/api` → `http://localhost:5001` (see `client/vite.config.js`)
- **Production**: Server serves static React build and handles `/api` routes directly
- **Mobile**: Works on same network using relative paths (e.g., `http://192.168.1.5:3000`)

When adding new API calls, ALWAYS use relative paths:
```javascript
// ✅ Correct
fetch('/api/students')

// ❌ Wrong - breaks mobile/production
fetch('http://localhost:5001/api/students')
```

### Database Schema

PostgreSQL. All tables are defined in `server/database.js`; the core four are:

1. **students**: Student information
   - `birthdate` (TEXT) - stored as date string, age calculated dynamically
   - `classIds` (TEXT) - JSON array of class IDs student is enrolled in

2. **classes**: Class schedules and information
   - `schedule`, `duration`, `instructor`

3. **attendance**: Attendance records
   - Links `studentId` and `classId` with `date` and `checkedAt` timestamp
   - Foreign keys with CASCADE delete

4. **users**: Authentication
   - Default admin account: username `admin`, password `admin123`
   - Roles: `admin` | `user` (teacher) | `parent` — see *Accounts, Roles & Invites*.
     One Kakao account may hold **one row per role**, so `kakaoId` is unique per `(kakaoId, role)`,
     not on its own.

**Important**: Student ages are NEVER stored - only `birthdate`. Age is calculated on-the-fly in components using the `calculateAge()` function.

### Frontend Structure

**Authentication Flow**:
- `AuthContext` provides global auth state via Context API
- `ProtectedRoute` component wraps all authenticated routes
- Unauthenticated users redirected to `/login`
- User info stored in localStorage

**Component Organization**:
- `components/` - Reusable components (Students, Classes, Attendance)
- `pages/` - Route-level pages (Dashboard, Login, Signup, Admin, StudentAttendance)
- `context/` - React Context providers (AuthContext)
- `utils/` - Utility functions and API configuration

**Design System** — see `docs/design-system/README.md`, and `/design-system` in the running app.

Before building a screen, look in `client/src/components/ui` first. Do not re-create a
button/card/badge/modal/table shape inline; import it:

```jsx
import { Button, Card, DataTable, Modal, PageHeader } from '../components/ui';
```

- `client/src/styles/tokens.css` — every constant (color, type, spacing, radius, control
  height, breakpoints). Never write a raw number or hex in a component.
- `client/src/styles/ui.css` — component styles, one block per component.
- `client/src/styles/App.css` — legacy classes (`.btn`, `.card`, …). Its `:root` **aliases**
  the new tokens, and the `DESIGN SYSTEM BRIDGE` block at the bottom restyles the old classes
  so unmigrated screens follow the new look. `--radius-sm/md/lg/xl` are deliberately **not**
  aliased there — redefining them would override the new components. New code must not use
  these legacy classes.
- The visual language is **ink on paper** (from the click mockup in the sibling `mockup/` folder,
  outside the repo): paper background (`--paper` + `--grain`), black-ink strokes instead of shadows
  (`--stroke` 2px on cards/tables/buttons, `--stroke-thin` 1.5px on inputs/badges/chips), hand-drawn
  wobbly radii (`--shape-panel/box/field/btn/tag/blob`), and **one accent, star yellow** (`--star`).
  Red (`--alert`) only for errors and irreversible actions; Kakao yellow only on the Kakao button.
  No blue or green anywhere — `--brand-*` is now the star-yellow ramp and **yellow is never a text
  color** (a unit test enforces both).
- **Fonts**: titles (page/card/modal titles, stat numbers, `Button size="lg"`) use **Black Han Sans**
  (`--font-display`, single weight — never set `font-weight`, `font-synthesis: none` stops faux bold);
  body/UI uses **Pretendard Variable** (`--font-sans`); field hints and empty-state copy use the
  **Gaegu** hand font (`--font-hand`). `client/index.html` loads Pretendard from jsDelivr and the other
  two from Google Fonts.
- Decorations: three stars beside list-page titles (`PageHeader` adds them unless `onBack`; `doodle`
  prop overrides), a zigzag under the active tab (`--zigzag`, `<Divider variant="zig" />`), and a
  highlighter under the current menu item (`--highlight`).
- Legacy aliases in `App.css`: `--color-primary` is **ink** (old screens use it both as text color and
  as the background of white-text buttons, so yellow would be unreadable); only `--color-primary-bg`
  is light yellow. Raw `input[type=text]` etc. selectors out-rank `.ui-input`, so the bridge styles
  every input there.

**Mobile Responsiveness Pattern**:
Responsiveness is **CSS's job**, not JSX's. Breakpoints: mobile `<768`, tablet `768–1279`,
desktop `≥1280` (content uses the **full width** — `--shell-max: 100%`; only reading-flow
screens narrow via `<Container width="reading">`).

Do NOT branch on `useIsMobile()` to render a table for desktop and cards for mobile — that
duplication is what the system removes. `DataTable` takes one column definition and renders
a table on desktop and stacked labelled cards on mobile. `Modal` is a centred dialog on
desktop and a bottom sheet on mobile. Use `useIsMobile()` only when *behaviour* genuinely
differs, not layout.

### Backend Structure

**MVC-like Pattern**:
- `routes/` - Express route definitions (students, classes, attendance, auth)
- `controllers/` - Business logic handlers
- `database.js` - PostgreSQL pool and schema initialization (runs on module load)
- `server.js` - Main entry point, serves static React build in production

**API Endpoints**:
- `/api/students` - CRUD for students
- `/api/classes` - CRUD for classes
- `/api/attendance` - Attendance records (supports bulk operations)
- `/api/auth` - Login, signup, user management

### FAQ Chatbot AI Provider

Which AI answers parent questions is an **admin setting**, not a build-time constant.

- Admin → 설정 (`/admin/settings`) picks between OpenAI and Google Gemini
- Stored in the `app_settings` table under the key `ai_provider`
- `server/utils/aiProvider.js` — provider catalog: env key names, default model, and
  whether a provider is configured. It never exposes key values, only "configured: true/false"
- `server/utils/aiSettings.js` — reads/writes the stored choice (falls back to
  `AI_PROVIDER` env, then `gemini`, and never throws so the chatbot keeps working)
- `server/utils/aiAnswer.js` — knows both APIs but no DB; `generateAnswer()` takes the
  provider as a parameter. `chatController` resolves it per request
- A provider whose API key is missing on the server cannot be selected (400)
- **Model, effort, and timeout are also admin settings** (`ai_model_<provider>`,
  `ai_effort_<provider>`, `ai_timeout_ms`). Precedence is **DB > env var > code default**, so the
  old `OPENAI_FAQ_MODEL` / `FAQ_CHAT_MODEL` / `FAQ_CHAT_TIMEOUT_MS` vars still work as fallbacks
- "Effort" maps to `reasoning_effort` (OpenAI) and `thinkingConfig.thinkingLevel` (Gemini).
  Reasoning models reject `temperature`; non-reasoning models reject `reasoning_effort` — neither
  is knowable in advance, so `aiAnswer.js` retries without the rejected field and remembers the
  verdict **per model name** (changing the model re-tests it)
- The UI offers a fixed per-provider dropdown (OpenAI: `gpt-5.6-luna`, `gpt-5.4-nano`). The API
  still accepts any well-formed model name, and `describeProviders()` prepends the currently
  configured model to the options when it is not in the list — so changing the list never hides
  what is actually in use. To offer a new model, edit `modelOptions` in `server/utils/aiProvider.js`

### LLM Call Log

Every AI call is recorded in `llm_call_logs` and shown at Admin → 로그 → **AI 호출 로그**.

- `generateAnswer()` returns the trace (`promptId`, `provider`, `model`, `systemPrompt`,
  `userPrompt`, `rawResponse`, `errorMessage`); `chatController` writes it. **The write is
  fire-and-forget** — a logging failure must never block a parent's answer
- `PROMPT_ID` in `aiAnswer.js` (`faq_answer_select@vN`) identifies which prompt was used. Bump the
  version when `SYSTEM_RULES` changes so old and new calls can be told apart in the log
- The list endpoint deliberately omits the prompt columns (the system prompt embeds every FAQ and
  is large); `GET /api/logs/llm/:id` returns them for the detail modal
- A `no_faq` row means no AI call was made (the channel had no published FAQ), so model and token
  columns are empty by design

**Local and production share one Supabase database**, so `ai_provider` is a single global
row — a change made from a local dev server takes effect in production immediately. The
write-time "key must exist" check only sees the environment doing the write, so it cannot
prevent a local admin (who has a key) from selecting a provider production lacks. Two
things cover that gap:

- `resolveUsableProvider()` — at answer time, if the selected provider has no key in *this*
  environment, it falls through to one that does and logs a warning. Use
  `getEffectiveProvider()` (not `getSelectedProvider()`) anywhere an answer is generated
- `GET /api/settings/ai` returns `effectiveProvider` alongside `provider`; when they differ
  the admin screen shows a warning naming both

Regardless of provider, the reply sent to a parent is always the registered FAQ answer
verbatim — the model only picks *which* FAQ, it never writes the sentence.

### FAQ Answer Files

Teachers upload files (PDF/HTML/images/docs) under FAQ → 파일 tab (`/faq/files`), then paste
the generated link into an FAQ answer. Parents click it in chat.

- Bytes live in **Supabase Storage** (public bucket `faq-files`); `faq_files` holds metadata
- `server/utils/storage.js` — Supabase Storage REST calls via plain `fetch`, no SDK dependency.
  `SUPABASE_URL` is derived from `DATABASE_URL`'s project ref when not set explicitly
- Upload sends **raw file bytes** (`express.raw`), not base64 — base64 inflates by 33% and
  Vercel caps request bodies at 4.5MB. Limit is 4MB, enforced in the controller and the bucket
- **The file extension decides the MIME type**, never the browser-supplied `Content-Type`
  (`server/utils/faqFileTypes.js`). `.svg` is rejected — it looks like an image but can carry script
- Storage path is `{userId}/{uuid}/{filename}` so re-uploads never overwrite and paths aren't guessable

**Storage keys are ASCII-only.** Supabase rejects Korean (and `%`) in object keys with
`InvalidKey`, so `toStorageSafeName()` strips the key down to ASCII (a Korean-only name becomes
`file.<ext>`). The original name is kept in `faq_files.filename` **and** appended to the URL as
`?name=<encoded>`, which `displayNameForUrl()` reads — so a pasted bare URL still shows the
Korean name.

**HTML must be proxied.** Supabase serves *any* HTML from a public bucket as `text/plain`
(their anti-XSS policy), so it would display as source code. `GET /api/faq-files/:id/view`
(public, unauthenticated — parents aren't logged in) re-serves it with the real Content-Type plus
`Content-Security-Policy: sandbox allow-scripts ...`. Omitting `allow-same-origin` gives the
document an opaque origin, so it cannot reach the app's `localStorage` JWT even though it is
served from the app's own domain. `buildLinkUrl()` returns this proxy path **for HTML only**;
PDFs and images keep the direct Supabase URL (no function cost). The proxy path is **relative**,
so a link copied locally still works in production.

**Link format.** The copy button produces `[파일이름.pdf](linkUrl)`. `client/src/utils/richText.js`
parses that (and bare URLs, including the relative `/api/faq-files/...` form) so the answer renders
the **file name**, not the raw URL. The stored answer text is never rewritten — parsing happens at
render time only, preserving the "answer is used verbatim" rule.

**HTML renders inline in the parent chat** via `RichText embedHtml`. The iframe also carries
`sandbox="allow-scripts allow-popups ..."` without `allow-same-origin` — a second barrier
independent of the CSP header. Teacher-facing list screens render file-name links only (no iframes).

### Accounts, Roles & Invites

Design docs: `docs/accounts-roles/`. Three things changed at once — **who may sign up**, **how many
accounts one person has**, and **which teacher(s) a parent belongs to**.

- **Signup is invite-only.** Kakao login alone no longer creates anything. `kakaoCallback` returns
  **403 `{ outcome: 'needsInvite' }`** when there is no invite and no existing account (it used to
  create a teacher silently — that was the hole). Teachers need an **admin-issued one-time token**
  (`teacher_invites`), parents need a **teacher's reusable link** (`parent_invites`, unchanged).
  Accounts that already exist log in without any invite.
- **One Kakao account = one row per role.** The single UNIQUE on `users."kakaoId"` was replaced by
  `idx_users_kakao_role` on `("kakaoId", role)` (partial, `kakaoId IS NOT NULL`). So a person can be
  admin **and** teacher **and** parent, with separate data. `User.getByKakaoId(kakaoId, role)` now
  **requires** the role and throws without it; `listByKakaoId()` returns all of a person's rows.
  Callback picks one via `pickAccount()` — the browser's last-used role (`prefer` in the OAuth
  `state`), else admin > user > parent.
- **`state` carries three things** now (`utils/oauthState.js`): `prefer` (role hint), `invite`
  (parent), `tinvite` (teacher). A bare non-decodable string is still read as an old parent invite
  token, so links sent before this change keep working. With none of the three, no `state` is sent
  at all and the authorize URL is byte-identical to before.
- **Role switching** — `GET /api/auth/roles`, `POST /api/auth/switch-role`, `POST /api/auth/roles`
  (create the missing role), `POST /api/auth/users/:id/grant-admin` (admin only). The target row is
  always found via **the current token's own `kakaoId`** (read from the DB, never the request body),
  so no input can switch you into someone else's account. `services/roleAccounts.js` holds the
  creation rules; new teacher/admin rows **copy the current row's Kakao tokens** so notifications
  work without re-login. UI: `components/common/RoleSwitcher.jsx` in the teacher header, admin
  sidebar, and parent 내 정보.
- **Parents belong to many teachers** (`parent_teachers`, many-to-many). `parent_accounts.teacherId`
  is kept as the **대표 선생님** for backward compatibility and is not read by new code.
  `parent_children.teacherId` was added because with several teachers a join through
  `parent_accounts` can no longer tell which teacher a child belongs to. **All parent scoping goes
  through `services/parentScope.js`** — `Event.listUpcomingForParent` / `listPastForParent` /
  `getPublishedForParent` / `listWithAlbumsForParent` take an **array** of teacher ids. A parent sees only linked teachers'
  events; an unlinked teacher's event id returns **404**, not 403.
- **A child can only register for its own teacher's event** (`childBelongsToEvent`). Registration
  notifications go to **`event.userId`** (the event's owner), not the parent's teacher — with
  multiple links the old code could notify the wrong teacher.
- **Deleting a teacher** unlinks their parents and deletes only parent accounts left with no links
  (`ParentAccount.deleteByTeacher`). A teacher's own "delete parent" action now only **unlinks**;
  only an admin deletes the account.
- **Teacher display name** (`users."displayName"`, nullable, **not** UNIQUE). `users.username` is a UNIQUE
  identifier: teacher rows created by invite or role-add get a `카카오_<ts>` placeholder, and the same
  person's admin row already owns their real name, so the teacher row could never be called that. Every
  human-facing teacher name goes through `COALESCE(NULLIF(displayName,''), username)`
  (`utils/usernames.js:displayNameSql`) — parent 내 정보 · 일정 · 사진 · invite landing · admin lists.
  설정 → 이름 변경 and `/register-name` (`PUT /api/auth/username`, path kept) now write `displayName`
  and never touch `username`. New teacher rows default it to the Kakao nickname (invite) or the current
  account's name (role-add); boot-time backfill fills placeholder-named teacher/admin rows from a
  sibling row of the same `kakaoId`. Client: `utils/userName.js:userLabel(user)`. The JWT and logs
  still carry `username`.
- **Known limit**: one active role per browser. Switching replaces the token, so other tabs follow
  on their next request.
- **Admin impersonation** (FR-388) — Admin → 사용자 → **[이 계정으로 로그인]** opens that user's
  screens as they see them. `POST /api/auth/users/:id/impersonate` (admin only, re-checked against
  the DB row) issues a **1-hour** token for the target with an `act` claim naming the admin
  (`services/roleAccounts.js:issueImpersonationToken`). Everything downstream sees a normal token;
  `logger.js` writes `관리자 → 대상` as the log username, and `/api/auth/verify` echoes
  `impersonatedBy`. While impersonating, `switch-role`, `POST /roles` and a nested `impersonate`
  return 403 so the `act` trail cannot be dropped. The client keeps the admin session under the
  `impersonator` localStorage key (`utils/tokenStorage.js`), shows `ImpersonationBanner` on all
  three role trees, hides `RoleSwitcher`, and — when the short token expires — `fetchWithAuth`
  restores the admin session and goes to `/admin/users` instead of `/login`. Session swaps use
  `hardNavigate` (full reload) so no state from the other account survives.
- **Production was cleaned on 2026-08-30**: teacher rows other than 이재림 were removed (all three
  were empty — 0 students/classes/attendance/events).

### Parent Portal

Parents get their own accounts and a separate app under `/parent/*`. Design docs live in
`docs/parent-portal/` (requirements, data model, implementation plan, mockups).

- **Roles**: `users.role` is now `admin` | `user`(teacher) | **`parent`**. Parents sign in with
  Kakao only. A parent may be linked to **several teachers** (`parent_teachers`);
  `parent_accounts.teacherId` is only the legacy 대표 선생님 and is not read by new code —
  scope every parent query through `services/parentScope.js`.
- **`middleware/roles.js`** — `rejectParents` reads the role off the JWT *without* deciding
  authentication (`verifyToken` still owns 401), so it is mounted at the router registration in
  `server.js` and every route file stays untouched. `requireRole('parent')` guards `/api/parent/*`.
  Open to parents: `/api/auth/login|signup|kakao*|verify`, `/api/invite/*`, `/api/parent/*`, `/api/maps/*`,
  `/api/chat/public/*`, `GET /api/faq-files/:id/view`. **Add new teacher routers to the guarded
  list in `server.js`.**
- **Invite link**: one per teacher (`parent_invites`), shown at 학부모 (`/parents`). The token
  rides through Kakao as the OAuth `state`; only a callback carrying a valid one creates a parent.
  A teacher's Kakao id hitting an invite link is refused with 409, never converted.
- **Child matching** (`services/parentOnboarding.js`): name (spaces removed) + birthdate
  (format-normalised) must hit exactly one of that teacher's students to auto-link. Zero or
  several leaves the child `pending` — signup still completes, and the teacher links it by hand
  from either the by-parent or by-student view.
- **Deleting a child** (내 정보 › 내 아이 trash button, `DELETE /api/parent/children/:childId`, FR-34a):
  removes **only the parent's own `parent_children` row** — `ParentChild.deleteOwned` keeps the owner in
  the `WHERE`, so another family's id is a 404. The teacher's student and existing
  `event_registrations` **stay** (same rule as a teacher's unlink). Face profiles **this parent**
  registered for that student go first (`ChildFaceProfile.deleteByParentAndStudent`; another guardian's
  stay), then auto tags are cleaned as in a single face delete (incl. `markAlbumsStale`) — that cleanup
  never fails the response.
  Deleting the last child sends the parent back to onboarding (`ParentSettings onChildrenChanged` →
  `ParentApp.loadMe`); the confirm dialog says so beforehand (`deleteChildMessage`). That makes onboarding
  reachable by an **established** account, so `ParentOnboarding` takes `currentName`: it prefills the
  parent's existing name (the "첫 아이 이름 + 엄마" suggestion must not overwrite it) and shows
  `RoleSwitcher` + 로그아웃 under the form — with no children 일정/내 정보 are closed, and `lastRole` survives
  logout, so a teacher+parent account would otherwise be stuck. The first-signup screen (no name yet) is unchanged.
- **내 아이 row = `생년월일 · ○○○ 선생님` only.** The linked student's name is deliberately **not** shown
  (owner's call, 2026-10-08): a hand-linked child can carry a different name than the roster student
  ("이쵸파" ↔ "윤해서"), and the extra name read as a mystery. The teacher name shows even with one teacher.
  `GET /api/parent/me` still returns `studentName` — it is just not rendered there.
- **Parent display name** (`parent_accounts.displayName`, e.g. "예림엄마"): what every screen
  shows for a parent. `users.username` stays the Kakao nickname and is **identity only** — it is
  UNIQUE, so two "지우엄마" would collide into `지우엄마_2`; `displayName` is not. Captured in
  onboarding (`POST /api/parent/children` takes `parentName`), defaulted to **first child's name +
  "엄마"** by `defaultParentName()` on both sides, changed later via `PUT /api/parent/name`.
  Accounts created before this have `null` — every display site falls back to `username`
  (`parentLabel()` in `client/src/pages/Parents/parentLinking.js`).
- **Events** (`events`) are the single source for the schedule: `competition` / `special` /
  `closure`. A competition event owns a `competitions` row 1:1 (`events.competitionId`), so the
  existing 참가 학생 · 종목 · 참가비 screens keep working. Writes go through
  `services/competitionMirror.js` from both sides; mirror failures are swallowed and the
  idempotent boot-time backfill catches up. **`type` cannot change after creation.**
- **Registrations** (`event_registrations`): one row per child per event, unique. Cancel is soft
  (`status='cancelled'`) so re-registering reuses the row. Confirming a competition registration
  calls the existing `Competition.addStudent`; removing that participant reverts it to
  `registered`.
- **Options**: JSON on the event, each with an id that survives label edits so live registrations
  never break. Deleting an option that registrations use warns first and shows "(삭제된 옵션)".
- **Notifications**: `EVENT_REGISTRATION` in `NOTIFICATION_EVENTS`, sent to the *teacher* via the
  existing Kakao "send to me". Parents receive no Kakao messages (decided 2026-08); anything for
  them is in-app only.
- **Client**: `App.jsx` returns `<ParentApp />` right after the logged-out branch when
  `user.role === 'parent'`, so the teacher tree is untouched. `/competitions` redirects to
  `/events`; its sub-routes (`/new`, `/edit`, `/manage`) stay.

**Local development uses a local Postgres**, not the shared Supabase database — creating parent
accounts against production data would let pre-guard code treat them as teachers:
```
createdb rg_manager
DATABASE_URL=postgresql://<user>@localhost:5432/rg_manager npm start
```

### Event Photo Albums (Google Drive)

Competition photos and videos live in the **teacher's own Google Drive**; the app stores only
file ids, metadata, and face vectors. Design docs: `docs/photo-sharing/` (base design: Drive, uploads,
faces, parent gallery) and **`docs/photo-menu/`** (2026-10: the teacher 사진 menu, the publish step,
upload-time event linking, the parent event-detail photos, HTML mockups, Google setup).

- **Drive connection** is per teacher (`google_drive_accounts`), OAuth scope **`drive.file` only** —
  the app sees only files it created, so Google requires no verification. `utils/googleDrive.js`
  speaks REST via `fetch` (no `googleapis` SDK); `services/driveAccess.js` is the only place that
  joins stored tokens with refresh. A revoked grant flips the row to `status='error'`, which every
  screen reads to show a banner — **reads keep working, writes stop**.
  `/api/drive/callback` cannot use `verifyToken` (browser redirect, no header), so it trusts a
  **signed 10-minute `state`** carrying the user id.
- **Album folder**: the app creates the folder under `RG Manager` and turns on **link sharing
  (anyone with the link, reader)** — the gallery uses Drive thumbnail URLs directly, so without
  sharing nothing renders.
  Thumbnails and the viewer's large photo come straight from `lh3.googleusercontent.com/d/<id>=…`
  (`mediaSerializer.thumbnailUrl` = `=w400-h400-c-rw`, a square WebP crop — every thumbnail box is square or
  wider with `object-fit: cover`; `largeImageUrl` = `=w1600`). `drive.google.com/thumbnail` only 302s there:
  80 real thumbnails took 2.4–3.5 s through it vs 0.9–1.1 s direct (2026-10-09, phone Chrome). lh3 answers
  **429 to a `localhost` referer** — strip the referer (Playwright `route.continue`) to see real photos locally.
  Every thumbnail `<img>` is `components/album/RetryImage` — on error it retries after 1 s · 3 s · 8 s with
  `?retry=n` (lh3 ignores the query), then shows an image icon instead of a blank box (`utils/imageRetry.js`).
  `events.albumStatus` is `none|ready|missing|unshared`. Deleting an event never deletes the Drive folder.
- **Teacher UI = the 사진 menu** (`/photos`, `/photos/:eventId`, `client/src/pages/Photos/`), right below
  이벤트 관리. **Photos are uploaded only there** — the event list/form have no photo entry (owner's call,
  2026-09-01 and again 2026-10-08). `GET /api/albums` (`albumListController`, guarded by `rejectParents`)
  returns the album cards plus every competition/special as an upload **target**.
- **Uploading links photos to an event.** [사진 올리기] opens `UploadSheet` with `targets`: step 1 is
  "어느 이벤트 사진인가요?"; the chosen event's `POST /api/events/:id/media/uploads` **creates the album folder
  first if the event has none** (`albumService.ensureAlbum`, closure events refused). The album page's own
  [사진 올리기] skips step 1. **No event at all? Step 1's top row "새 폴더 만들기"** takes a name + date and makes a
  **photo-only folder — not an event.** It is stored as an `events` row with **`type='folder'`** so every album
  feature works unchanged (no new table, no DDL), but it must stay out of event surfaces: `Event.getAll`,
  `listUpcomingForParent`/`listPastForParent` and `getPublishedForParent` (default) exclude it; only the parent
  album screen passes `{ includeFolders: true }`. **Any new query that lists events must exclude `type='folder'`.**
  `updateEvent` refuses folders (400 `photo_folder`); `PATCH /album` refuses `audience:'participants'` on a folder
  (400 `folder_audience`) — a folder has no registrants, so it is always `albumAudience='all'` and shows only in the
  parent 사진 tab. The sheet calls `POST /api/albums` (`createPhotoFolder` → `Event.createForPhotos`) only when
  [N개 올리기] is pressed; same title + date as an existing **folder** reuses it (200 `created:false`), an event
  with the same name is never reused. The folder name always comes from the event — `folderNameFromEvent` =
  `YYYY-MM-DD 제목`, Drive-forbidden characters become spaces (never rejected) — and **follows title/date
  edits** (`eventController.updateEvent` → `syncFolderName`, which never fails the event save).
- **"Who uploaded" shown to the teacher is the parent's own name, not the Kakao identifier.** A parent's
  `users.username` is the Kakao nickname or an auto id like `카카오_1788…`; the name they chose at onboarding
  ("예림엄마") lives in `parent_accounts."displayName"`. `EventMedia.list` picks
  `parentAwareDisplayNameSql('u','pa')` (parent name → `users.displayName` → username) and
  `mediaSerializer.uploaderNameOf` drops placeholder ids (falls back to 학부모/선생님). Parents still never get
  uploader names (`toParentMedia` whitelist).
- **Photo folders are renamed and deleted from the 사진 menu only** (docs/photo-menu FR-519): `PATCH
  /api/albums/:id` (`updatePhotoFolder`) works on `type='folder'` rows only and answers 400 `not_photo_folder` for a
  real event — an event's title/date belong to the event form (competition mirror). Rename also renames the Drive folder
  via `syncFolderName` (a Drive failure never fails the save; `driveRenamed:false`). `DELETE /api/albums/:id`
  (`deletePhotoFolder`) takes both: a photo folder **removes the row** and its media/tags/faces (CASCADE); an **event
  album** (competition/special, 2026-10-09) **keeps the event** — `Event.removeAlbum` deletes its `event_media` rows and
  resets the album columns to "no album yet" (private, `participants`, upload open, no covers/match rules) in one
  transaction, so registrations, participants and the competition row stay (`{eventKept:true}`; an event with no album →
  404 `no_album`). The event itself is still deleted only in 이벤트 관리. On an event album the [⋯ 폴더 관리] menu has only
  [폴더 삭제]. **Neither touches Drive** — same rule as deleting an event; the confirm dialog says so (re-uploading later
  makes a new Drive folder of the same name). `Menu` positions itself in CSS
  (`.ui-menu[data-align]`), never inline, or the mobile bottom-sheet rule loses.
- **Album share link** (docs/photo-menu FR-518) = the parent album URL **plus the album owner's parent-invite
  token**: `/parent/photos/<eventId>?invite=<token>`, built server-side by `services/albumShare.sharePathFor` and
  returned as `sharePath` to the teacher (`GET /api/events/:id/album`) **and to any parent who can view the album**
  (`GET /api/parent/events/:id/media`) — parents re-share it from the icon at the top right of the album screen.
  Access is still decided by publish state + audience, never by the link. The invite in a share link is **soft**
  (OAuth state key `s`, `/api/auth/kakao?invite=…&soft=1`): a brand-new Kakao user signs up as that teacher's
  parent; an existing parent is linked to the teacher; but a dead token **does not block login**, and a Kakao id
  that only has teacher/admin accounts is **not** turned into a parent (a teacher testing their own link). A real
  invite link (`/invite/<token>`) keeps its strict behaviour. A logged-in parent who is not yet linked gets a 404
  on the album; `ParentAlbum` then **asks first** ("○○ 선생님이 공유한 사진이에요 · 연결하고 사진 보기") and only on
  that click links via `POST /api/parent/teachers` — never link on navigation alone, because linking puts the
  parent's name and email in that teacher's parent list.
  Teachers opening `/parent/photos/:id` are redirected to `/photos/:id`.
- **Albums start private** (`events."albumPublished"` default false). The teacher publishes from the album
  page's 공개 panel, choosing `albumAudience` = `participants` (confirmed parents, default) or `all` (every
  linked parent); `albumPublishedAt` keeps the first publish. A published album shows in the parent 사진 tab
  **and** on that event's parent detail page. The upload sheet can publish when done (a follow-up
  `PATCH .../album {published:true}`, only if something uploaded). **Publishing, audience and hide/show stay
  available when Google is disconnected** — only Drive-backed actions (upload, delete) lock, so an album can
  always be taken down.
- **Uploads never pass through the server.** `POST .../media/uploads` returns a Drive *resumable
  session URI* (created with an `Origin` header so the browser may PUT to it); the browser uploads
  in 8MB chunks with progress and resume (`utils/driveUpload.js`). `POST .../media/:id/complete`
  re-reads the file from Drive and **verifies it landed in this album's folder** before marking it
  `ready` — a leaked session URI cannot inject files elsewhere.
- **A file already in the album is skipped, not uploaded again.** "Same file" = same original name (NFC — macOS hands
  Korean names over decomposed) **and** same byte size (`mediaValidation.sameFileKey`; the client copy is
  `imagePrep.sameFileKey`) against the album's `ready` rows, hidden ones included (`EventMedia.listReadyNamesBySize`). No
  content hash — the browser would have to read a 500MB video. `POST .../media/uploads` answers such a file with
  `{ skipped: true, reason: 'duplicate' }` in its slot (items stay index-aligned with `files`) and creates no session or
  row; when nothing needs a session it does not touch Drive at all. `UploadSheet` marks those rows "이미 있어요" from the
  start and lists them on the done screen ("이미 앨범에 있는 파일 N개는 건너뛰었어요", or title "이미 앨범에 있어요" when every
  file was one); "N장 올렸어요" counts only files that really went up. The same file picked twice in one go is rejected
  at pick time (`partitionFiles`).
- **Who can see an album** (`utils/albumAccess.js`, order matters): no album → event private
  (`not_published`) → **album private (`album_private`, checked before any confirmation)** → audience. With
  `participants`, the parent's child must be **confirmed** — `event_registrations.status='confirmed'` or in
  `competition_students` (`isConfirmedParent`); with `all`, being linked to the teacher is enough.
  `albumPublished` defaults to **closed** in `canViewAlbum`/`canUpload` when a caller omits it.
  `GET /api/parent/events/:id` returns `album:null` unless visible (existence isn't revealed) and otherwise the
  6 newest non-hidden photos in `album.items`. Everything parent-facing goes through
  `utils/mediaSerializer.js:toParentMedia`, a **whitelist** — other children's tags, face boxes,
  descriptors, uploader names and Drive filenames never leave the server. A test pins the exact
  field list so a new column cannot leak by accident. **One deliberate exception (owner's call, 2026-10-09):** the
  album face list (below) sends parents **one cover face box per person in the album, other children included** —
  only `{key, photoCount, mine, cover: {url, box}}`, never names, student ids, descriptors or media-id lists
  (`services/albumPeople.js:toPersonView`, keys pinned by a unit test and an e2e).
- **Face indexing runs on Vercel, in a Python function** (`face_engine/`, 2026-10) — InsightFace **buffalo_l**:
  SCRFD `det_10g` at 640 + ArcFace `w600k_r50` (**512-dim**, unit length). It replaced the in-browser face-api
  (TinyFaceDetector + 128-dim), which on the 102 production photos found faces in 51 and mixed different children
  under one tag; buffalo_l found faces in 93 (85 → 256 faces) and separated the children. The browser still drives
  everything (`utils/faceClient.js`): it JPEG-encodes the 1920px preview it already has and POSTs the bytes with its
  login token to **`/api/face-engine/detect`**, then sends the returned `{box, score, descriptor}` to the Node API as
  before. The photo is never stored. Failure (engine down/cold-start timeout, 401, unreadable image) → `detectFaces`
  returns **`null`** and the upload still succeeds with `faceStatus='skipped'`; **`[]` only means "no face"** (stored as
  `none`), so a failure sent as `[]` would look like a faceless photo.
- **The engine is pure numpy + Pillow + onnxruntime** (`face_engine/requirements.txt`, ~135MB installed). The
  `insightface` package itself pulls OpenCV/SciPy/scikit-image and would not fit the 500MB Python function limit, so
  `engine.py`/`imaging.py` re-implement its preprocessing (cv2 INTER_LINEAR resize, warpAffine, skimage Umeyama
  similarity). `tests/test_engine.py` + `tests/test_parity.py` check against the real insightface/cv2 when they are
  installed (same faces, descriptor cosine > 0.98). The JWT is verified in Python with the same `JWT_SECRET`
  (`auth_token.py`; HS256 only, `purpose` tokens such as the Drive state are refused).
- **Models are not in the repo** — they are licensed **non-commercial research only** and this repository is public.
  On a cold start `model_store.py` range-downloads just `det_10g.onnx` + `w600k_r50.onnx` (~176MB of the 289MB
  `buffalo_l.zip`) from InsightFace's GitHub release, checks **size + SHA-256** (a changed file → 503, never a silently
  different model), and keeps a copy in `/tmp` for the instance. A failed download is not retried for 30s. The owner
  chose non-commercial use (2026-10-09); revisit the license before any commercial use.
- **Local dev**: `python face_engine/model_store.py` (once, into gitignored `face_engine/.models`), then
  `JWT_SECRET=<same as server> python face_engine/dev_server.py` (:5090) and start Express with
  `FACE_ENGINE_URL=http://localhost:5090` — `server/utils/faceEngineProxy.js` forwards `/api/face-engine/*` there
  (503 when unset). In production Vercel routes that path to the Python function **before** the Express catch-all, so
  the proxy never runs there. Python tests: `pytest face_engine/tests` (needs pytest; the real-model tests skip unless
  `face_engine/.models` exists and `FACE_TEST_IMAGE` points at a photo with several faces).
- **Reference faces**: `detectSingleFace` accepts one face, or one face at least **3× the area** of the next
  (`pickMainFace`) — the new detector also finds small background faces, so "exactly one" rejected most real photos.
- **`FACE_ANALYZER_VERSION` = 3** (`client/src/utils/faceClient.js`, `server/utils/faceVector.js` **and**
  `face_engine/service.py` — keep equal) rides with every result into `event_media."faceAnalyzerVersion"`. Photos
  analysed by an older version (or none recorded) count as needing analysis even if `none`/`done`
  (`EventMedia.needsFaceAnalysisSql`, used by the re-analysis list, `counts.unanalyzed` and the `unanalyzed` filter).
  Bump all three when detection changes.
- **[얼굴 찾기]** on the teacher album page (`pages/Photos/FaceScanPanel.jsx` → `utils/faceReanalysis.js`) walks
  `GET .../media/unanalyzed?afterId=` and posts to `.../media/:id/faces`. The browser fetches
  `lh3.googleusercontent.com/d/<id>=s1920` (CORS `*`; **not** `drive.google.com/thumbnail`, whose 302 has no CORS
  header) and posts those bytes to the engine. Failed photos stay in the list; the `afterId` cursor stops one run from
  looping on them. **It starts by itself** when the teacher opens an album that has photos to analyse
  (`FaceScanPanel autoStart`, once per page visit — leftovers after that run wait for the button) and stops when the
  page is left (`reanalyzeAlbum shouldStop`); unseen photos stay in the list for the next visit. The device only fetches
  and forwards photos — the engine does the work — so running it unasked is cheap.
- **Upload-time analysis retries itself** (`UploadSheet`): photos whose analysis failed during the upload (engine cold
  start, or a HEIC the browser cannot decode) get one more try after all files are up — from the local preview, or from
  Drive's JPEG rendition (`lh3 …=s1920`, `utils/mediaUrls.analysisImageUrl`) when the browser could not read the file —
  and are saved with `POST …/media/:id/faces`. Parents use `POST /api/parent/events/:id/media/:mediaId/faces`
  (`saveOwnFaces`): **own uploads only, and only while the photo still needs analysis** (`faceVector.needsFaceAnalysis`,
  the JS twin of `needsFaceAnalysisSql`), so an analysed photo is never overwritten (409). What still fails is picked
  up by the teacher's album auto-start.
- **Vectors are `TEXT` (base64 of a 512-float array = 2732 chars), not pgvector** — the production Supabase role
  is not a superuser and cannot `CREATE EXTENSION`. Distances are computed in JS (`utils/faceVector.js`); at this scale
  that is tens of milliseconds. Promote to pgvector later by changing the column type only. Old 128-dim face-api
  values decode to `null` (length check) and drop out of matching; boot deletes old **reference** faces
  (`length(descriptor) = 684`) so they stop counting against the per-child limit — parents re-register in 내 정보.
  Old album faces stay until [얼굴 찾기] replaces them.
- **Tag precedence** `manual > parent_confirmed > face > candidate`, and `excluded` is never
  resurrected by re-matching (`utils/faceMatch.js:nextTagSource`, the whole table is unit-tested).
  The distance is **cosine distance (1 − cosine similarity)**. ≤ `face_match_threshold` (**0.35**, similarity ≥ 0.65)
  auto-tags, ≤ `face_candidate_threshold` (**0.50**) becomes a "혹시 우리 아이?" candidate; both are `app_settings` keys.
  Measured on production photos (2026-10): same child frontal 0.71–0.88 similarity, other children ≤ 0.40, two people
  in one photo ≤ 0.51 — but an eyes-closed or hair-covered reference lets other children reach 0.53–0.61, hence the
  candidate band. (The old face-api Euclidean values overlapped completely: same child 0.35–0.37, others 0.32–0.52.)
  Boot moves rows still holding an old face-api default (match 0.50/0.55 → 0.35, candidate 0.40/0.60/0.65 → 0.50) and
  leaves any other value alone — **this UPDATE sits at the end of `initDatabase` and has not run reliably in
  production; apply it by hand after deploying**. **One face → at most one child** (`faceVector.js:bestPerStudent`
  assigns each face to its nearest student), so one face can no longer tag two children.
- **Auto tags are a cache and re-match themselves.** `events."albumMatchRules"` records the rule signature the
  album's `face`/`candidate` tags were computed with (`faceVector.js:matchRulesSignature` = rules version + both
  thresholds). `albumService.ensureAlbumsMatched` runs in every album read (teacher `getAlbum`/`listMedia`, parent
  album list / gallery / event-detail photos): signature differs or is NULL → `rematchAlbum` → store it. Registering
  or deleting a child face NULLs it for all of that teacher's albums (`albumService.markAlbumsStale`), because one
  face goes to the nearest child only. Before this a threshold change left the old tags in place until a teacher
  pressed [얼굴 찾기] — a parent's "우리 아이만 보기" showed another child (2026-10). Bump
  `FACE_MATCH_RULES_VERSION` when the matching logic itself changes.
- **Matched names are never shown on photos.** `toParentMedia` sends `myTags` as `{studentId, source}` only (no
  name), and `MediaGrid` / `MediaViewer` draw no name badge — matching can be wrong. The "우리 아이 사진만 보기"
  filter and the 맞아요/아니에요 candidate box still use the tags.
- **[얼굴 찾기] shows the faces it found** (teacher only) as small round crops under the progress bar and the
  result line — first 30, then "+N" (`FaceScanPanel` `FoundFaces`). `utils/faceCrops.js` cuts them in the browser
  from the same lh3 photo using only the saved `box` (0–1), so it does not care how the faces were detected. Crops
  are JPEG data URLs that live in React state only — never sent to the server, never stored; reloading clears them.
- **Album face list — 얼굴로 사진 찾기** (teacher album above the filter chips, parent album at the very top):
  every person in the album once, as a round crop; pressing one shows only the photos that person is in, pressing it
  again or [전체] clears it. Both sides share `components/album/FacePeopleStrip.jsx` (crops via `utils/faceCrops.js`,
  one image load per cover photo, cached across list refreshes). **Grouping is computed on every read, never stored**
  (`server/utils/facePeople.js:groupFaces`, pure + unit-tested; loaded by `services/albumPeople.js`): faces with a
  `face`/`manual`/`parent_confirmed` tag seed that student's group, the rest join the group whose mean is within
  cosine distance **0.5** (`PERSON_JOIN_DISTANCE`) or start a new one, then close groups merge. Hard rules: two faces
  in one photo are never one person, a photo the parent marked `excluded` never joins that student, two student groups
  never merge. 0.5 comes from production (2026-10-09, 38 faces): cross-photo pairs split into < 0.4 and > 0.5
  similarity with none between; faces in the same photo never exceeded 0.4. The person `key` is `p<smallest face id>`,
  so `?person=<key>` on `GET /api/events/:id/media` (teacher, hidden photos included) or
  `GET /api/parent/events/:id/media` (parent, hidden photos excluded from grouping and covers) regroups and finds the same
  person; a key that vanished meanwhile answers an empty list + `personMissing:true` (never the whole album) and the
  screen drops the selection and reloads the list. Lists: `GET /api/events/:id/album/people`,
  `GET /api/parent/events/:id/people` (own children first, `mine:true`, labelled "우리 아이"; no other names anywhere —
  grouping can be wrong). The cover image is `lh3 …=s<N>` sized so the face is ≥ 60 px (`mediaSerializer.faceCoverUrl`).
  On the parent page a picked face turns 우리 아이만 off and vice versa.
  **Teachers can remove an unrelated person** (spectators, another team): long-press a face (500 ms, or right-click /
  Delete key) → an X appears on that face only → pressing X calls `DELETE /api/events/:id/album/people/:key`
  (`albumController.deletePerson` → `services/albumPeople.js:removePerson`). The parent strip never gets the X (no
  `onRemove`). **A person grouped with a registered child (any `manual`/`parent_confirmed`/`face` tag → `studentId`) can't
  be removed** — that would silently shrink the child's 우리 아이만 보기: the teacher list carries a teacher-only
  `removable:false` (the parent view shape is unchanged) so the strip shows no X, and the server answers 409
  `student_person`. The client sends the `photoCount` it saw (`?photoCount=N`); the server regroups and answers 409
  `person_changed` (nothing deleted) if it differs or is missing, and the screen reloads the list.
  One transaction: that person's `face`/`candidate` tags **first** (`media_tags."faceId"` is ON DELETE SET NULL),
  then their `media_faces` rows, then each photo's `faceCount` — a photo left with no faces becomes `none` and **keeps its
  `faceAnalyzerVersion`**, so automatic re-analysis doesn't bring the faces back. Photos, `manual`/`parent_confirmed`
  tags and parent "아니에요" answers stay. Bumping `FACE_ANALYZER_VERSION` re-analyses the album and would find those
  faces again. While the X shows, tapping another face, [전체], outside or Esc only closes it (no selection); the
  long-press release click never selects.
- **Parents**: 사진 tab (`/parent/photos`, published albums only — and only those with at least one visible ready photo/video:
  an album whose photos were all deleted or hidden drops out of `GET /api/parent/albums` (owner's call 2026-10-09) but still opens
  from the event detail's [앨범 열기] and share links, so parents can still upload; the teacher list keeps showing it), gallery (`/parent/photos/:eventId`) with the
  **우리 아이 사진만 보기** toggle and `?open=<mediaId>` to open one photo, a full-screen viewer whose 저장 button
  opens the Drive download URL and which **swipes sideways** to the previous/next photo or video
  (`hooks/useSwipeToPage.js`, rules in `utils/viewerSwipe.js`; both neighbours are pre-rendered off-screen so they
  follow the finger). Touches inside the Drive player iframe never reach us, so on touch devices a transparent
  **swipe cover** (`utils/drivePlayer.js:swipeBands`, four bands around a hole) sits over the player and leaves Drive's
  own controls uncovered: a 120 px centre hole (play button, the ready-state tap), the bottom `132 × scale` px
  (seek bar ~102 player-px up + the button row) and the top `64 × scale` px (pop-out button) — `scale` is the
  `drivePlayerFrame` shrink, measured on a real video 2026-10-09 (play, seek and swipe all checked). Mouse devices get no
  cover, child face registration in 내 정보 (`ChildFaceCard`: registered photos are listed
  by date — only the vector is stored, so there is no thumbnail — and a parent can **delete the ones they
  registered**; deleting re-matches that child and `matchStudentAcrossAlbums` now also **removes auto tags that no
  longer match**, while 맞아요/아니에요 answers stay), and a **6-photo grid on the event detail**
  (view only — uploads happen in the album). Parents upload only to published albums with 업로드 받기 on, and
  may delete only what they uploaded. A private album opened by URL shows "선생님이 아직 공개하지 않은 앨범이에요".
- **Photo/video captions** (`event_media.caption`, nullable TEXT, ≤ 500 characters): the teacher taps a photo in
  the 사진 menu album → the viewer shows [설명 추가]/[설명 수정] in its bottom info line → an editor opens **inside
  the viewer** (the app `Modal` sits below the viewer's z-index 240), with the buttons above the textarea and lifted
  over the phone keyboard (`hooks/useKeyboardInset`). `PATCH /api/events/:id/media/:mediaId {caption}`
  (`albumController.updateMedia`, owner only; `''`/`null` clears; rule in `mediaValidation.normalizeCaption`, client
  copy `utils/mediaCaption.js`) works while Google is disconnected — it never touches Drive. `caption` is in both
  serializers (the parent whitelist test lists it); `MediaViewer` shows it above the date line — over the photo, or
  under the Drive player for videos — clamped to 3 lines with [더 보기]. While the editor is open, swipe and arrow
  keys are off and Esc closes only the editor. No toast on save: it would cover the caption that just appeared.
- **Album covers (대표 사진, up to 4)** (`events."albumCoverMediaIds"`, nullable `INTEGER[]` in pick order, no FK; the single
  `albumCoverMediaId` from PR #59 is moved into it at boot and cleared — boot UPDATEs are unreliable in production, so run that
  move by hand after deploying). The teacher opens a photo **or video** in the 사진 menu album → the viewer's info line has
  **[대표 사진으로]** (pressed, yellow **[대표 사진 n]** when it is a cover; pressing again removes it; with 4 already it is locked as
  **[대표 사진 4장 다 골랐어요]**) → `PATCH /api/events/:id/album {addCoverMediaId}` / `{removeCoverMediaId}`
  (`albumController.nextCovers`: appends/removes on the *current* list — `EventMedia.coverableIds`, the stored ids that are still this
  album's `ready`, non-hidden media — so hidden/deleted ones drop out by themselves; 400 `invalid_cover` / `hidden_cover`, 409
  `covers_full`; works while Google is disconnected; no success toast — it would cover the button). **Two more ways, both
  `PATCH …/album {coverMediaIds: [...]}`** (`replaceCovers`: the whole list in order, 0–4 unique ids of this album's ready, non-hidden
  media; `[]` clears; 400 `too_many_covers` / `invalid_cover` / `hidden_cover`; never mixed with add/remove): **고르기** has
  **[대표 사진 만들기]** in its button row (1–4 picked, none hidden — the pick order becomes the cover order and replaces the old
  covers; on phones that row is 2×2, `.ui-photo-select-actions`, or the fourth button falls off screen), and the album page's
  **대표 사진 panel** (`pages/Photos/CoverOrderPanel.jsx`) shows the covers numbered in order plus an `AlbumCovers` preview of the card,
  and **reorders by drag and drop** — pointer events, so mouse and finger (`touch-action: none` on the tiles), landing slot from the
  other tiles' horizontal midpoints (`utils/reorder.js:dropIndex/dropMarker`, same as the shop list), clamped to the filled tiles,
  6 px slop so a tap is not a drag — or ←→ on a focused tile. It shows the new order at once and re-reads the album if the save fails.
  `GET …/album` returns the current `coverMediaIds`, their thumbnails as `covers` (`EventMedia.coverRows`; they may not be on the
  loaded grid page) and `maxCovers`; grid tiles get a ★ 대표 n badge. **Both list cards show only the covers** — teacher 사진 list and parent
  사진 tab share `components/album/AlbumCovers.jsx` (`.ui-album-card__cover[data-covers]`: 1 fills the 16:10 box, 2 side by side,
  3 = first one big on the left, 4 = 2×2). URLs come from `mediaSerializer.coverUrls` (one cover → lh3 `=w800-h500-c-rw`, several →
  the square thumbnails) as `covers` on `GET /api/albums` and `toParentAlbum` (parent whitelist test pins the keys; no ids go out).
  A video shows its Drive frame with **no play mark** (owner's call 2026-10-09). No covers → the old newest-four box / strip.
  The covers are **re-checked on every read** (`EventMedia` `previewRows`, `array_position … NULLS LAST`), and parent previews put them first.
- **View stats & admin photo-view log** (`album_views`: `eventId` · `mediaId` (SET NULL when the photo is deleted) · `userId` · `kind`
  `album`|`media` · `createdAt`; `models/AlbumView.js`). The parent album page records **one album open** when it can view the album and
  **each photo/video shown big** (open or swipe — `MediaViewer onShow`), through `utils/albumViews.createViewTracker` (fire-and-forget,
  `keepalive`, once per item per page visit) → `POST /api/parent/events/:id/views {mediaId?}` (`albumViewController.recordView`: same
  access as the gallery — `loadAlbumContext` — and only this album's ready, non-hidden media; anything else 404). The server also skips a
  repeat from the same person within **30 min (album) / 10 min (photo)** (`VIEW_DEDUPE_MS`, one `INSERT … WHERE NOT EXISTS`). Teachers see
  it as `viewStats` {viewers, albumOpens, mediaViews} + `topViewed` on `GET …/album` (`pages/Photos/ViewStatsPanel.jsx`; tapping a
  most-viewed photo opens it), `viewCount` per photo (viewer info line "N번 봤어요", `MediaViewer showViews`, teacher only) and `viewers`
  on each 사진 list card ("N명이 봤어요"). **Who** viewed is only in Admin → 로그 → **사진 보기 로그** (`GET /api/logs/photo-views?kind&limit&offset`,
  admin only; parent name via `parentAwareDisplayNameSql`, placeholder ids shown as 학부모; `pages/admin/AdminPhotoViewLogs.jsx`). Parents
  never get counts. Likes/comments were built and then dropped on the owner's request (2026-10-09) — none of that is in the code.
- **Deletes go to the Drive trash** (`files.update {trashed:true}`), never permanent — 30 days to
  recover. The DB row is removed, cascading faces and tags.

**Google setup** (`docs/photo-menu/02-google-setup.md`): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
an authorized redirect URI of `<APP_URL>/api/drive/callback` and the Drive API are **in production already**
(2026-10-08). The consent screen is still **Testing**, so only registered test users can connect
(`403 access_denied` otherwise) and their refresh tokens **expire after 7 days** — the row flips to
`status='error'` and the teacher reconnects in 설정. Publishing the app (scopes `drive.file`, `openid`, `email`
are all non-sensitive → no Google review) removes both limits. Without the keys `/api/drive/account` returns
`configured:false` and the photo screens show "관리자에게 문의" — the rest of the app is unaffected.

### Event Share Link (선생님 → 학부모)

이벤트 관리(`/events`, `/admin/events`)의 **[공유]** 버튼과 신청 현황 패널의 링크 아이콘이
`${origin}/parent/events/<id>` 를 클립보드에 복사한다 (`client/src/utils/eventShare.js`).
링크에 토큰은 없다 — 여는 쪽은 로그인한 학부모여야 하고, 서버(`GET /api/parent/events/:id`)가
"연결된 선생님의 공개 이벤트" 인지 확인한다(아니면 404). 비공개 이벤트는 버튼이 잠긴다.

- **학부모 쪽 라우트** `/parent/events/:eventId` 는 **전체 화면 페이지** `pages/parent/ParentEventDetail.jsx`
  다 (2026-09-02, 바텀시트 `EventDetailSheet` 를 대체). 일정 카드를 눌러도 같은 페이지로 간다.
  위에서 아래로 일시·장소 → (아이 선택) → **옵션 + 신청 버튼** → 안내 → 오시는 길(지도) → 사진 → **신청한 학생 명단**.
  상세는 목록과 따로 조회하므로 올해 밖의 일정이어도 열리고, 404 면 "이벤트를 찾을 수 없어요" 화면.
  헤더의 뒤로 가기는 `ParentLayout` 의 `back` prop 이 그린다.
- **신청한 학생 명단은 서버가 만든다.** `GET /api/parent/events/:id` 의 `registrations` 는
  `EventRegistration.listByEvent` 에서 **이름·상태·옵션 라벨·우리 아이 여부**만 남긴 것이다 — 다른 집의
  학부모명·학생 id·생년월일은 내려가지 않고, 취소는 빠지며, 휴관일은 조회 자체를 하지 않는다.
  같은 응답에 `today` (KST) 가 실려 D-day 를 계산한다.
- **일정 카드의 "신청 N명"** 은 `GET /api/parent/events` 의 `registrationCount` — `Event.listUpcomingForParent`
  가 선생님 목록(`getAll`)과 같은 서브쿼리로 세며 **취소는 뺀다**. 휴관일 카드에는 붙지 않는다.
- **지난 일정 보기** — 일정 제목 줄 오른쪽의 링크 모양 글자 버튼(`.ui-link`, `ParentLayout` 의 `action` prop)이
  `/parent/schedule?view=past` 로 바꾼다(보기가 주소에 있어 새로고침·브라우저 뒤로 가기에도 남는다).
  `GET /api/parent/events?view=past` → `Event.listPastForParent`: 끝난 공개 이벤트를 **연도 제한 없이 최근 것부터** —
  종료일 조건이 남은 일정(`COALESCE(endDate, date) >= today`)의 반대라 진행 중인 기간 이벤트는 남은 쪽에만 있다.
  카드는 D-day 대신 "종료"(`dDay`), 배지는 신청했던 것만(`childBadge(…, { past: true })`). 지난 카드에서 연 상세는
  라우터 state `back` 으로 지난 일정에 돌아온다(`utils/parentSchedule.js:scheduleBackPath` — 아는 두 주소만 받는다).
- **로그인 전 딥링크는 `utils/returnTo.js` 가 잇는다.** 카카오 인가는 다른 도메인을 거치므로 라우터
  state 는 살아남지 못한다 — 로그인 안 된 `*` 라우트(`RememberReturnTo`)가 주소를 **localStorage 에
  1시간** 남기고 `/login` 으로 보내며, `KakaoCallback` 이 로그인 뒤 `returnPathFor(role, path)` 로
  **그 역할이 열 수 있는 트리일 때만** 되돌린다(선생님 계정으로 학부모 링크를 열면 그냥 홈).
  아이 등록 전 학부모는 온보딩을 거친 뒤 `ParentOnboarding` 이 같은 값을 consume 한다.
  상대 경로(`/…`)만 받고 `//`, 절대 URL, 로그인·콜백·초대 화면은 거른다(오픈 리다이렉트 방지).
- **이벤트 행 클릭** = 신청 현황(학생 명단) 토글. 행 안의 버튼들은 `stopPropagation` 으로 행 클릭과
  겹치지 않게 한다. 휴관일 행은 열지 않는다.
- 초대(가입)는 이 링크에 실려 있지 않다. 계정이 없는 학부모는 `needsInvite` 안내를 보고, 초대 링크로
  가입한 뒤 (1시간 안이면) 같은 이벤트로 돌아간다.

### Event Location Map (주소 검색 · 지도)

이벤트 폼(`/events/new`, 수정)의 장소 아래 **[주소 검색]** 으로 주소를 고르면 지도가 바로 떠서 맞는 곳인지
확인하고, 학부모 일정 상세(`/parent/events/:id`)의 **오시는 길** 섹션에 같은 지도와 카카오맵 링크가 뜬다.

- **저장**: `events.address`(TEXT) · `latitude` · `longitude`(DOUBLE PRECISION), 셋 다 nullable. `location`(장소 이름)은
  그대로 필수이고 주소는 선택이다 — 주소를 고르지 않은 예전 이벤트는 장소 이름만 보인다. 서버 `parsePlace()`
  (`services/eventService.js`)가 주소 없으면 좌표를 버리고, 좌표가 하나라도 틀리면 주소만 남긴다. 휴관일은 모두 null.
  옛 대회 화면에서 장소 이름을 바꾸면 미러(`competitionMirror.js`)가 예전 주소·좌표를 지운다(`placeAfterLocationChange`).
- **주소 검색 = 다음 우편번호 서비스** (`t1.daumcdn.net/.../postcode.v2.js`, 키 없음). `AddressSearchDialog` 가 모달
  안에 embed 한다(팝업은 휴대폰에서 막힌다). 장소 이름을 먼저 적어 두면 그 말로 바로 검색하고, 비어 있으면 고른
  건물명(없으면 주소)으로 채운다.
- **좌표·지도 = 카카오 지도 SDK** (`dapi.kakao.com/v2/maps/sdk.js?libraries=services&autoload=false`). 키는 빌드에 넣지 않고
  `GET /api/maps/config` 가 서버 환경변수 `KAKAO_JS_KEY` 를 내려준다(로그인만 확인, 학부모 가드 없음) — 키를 바꿀 때
  재빌드가 필요 없다. 주소 → 좌표는 선생님 브라우저가 `Geocoder.addressSearch` 로 찾아 함께 저장하고, 학부모 화면은
  저장된 좌표로 그리기만 한다. 코드는 `utils/kakaoMap.js`(스크립트 로더·좌표·링크) · `components/common/PlaceMap.jsx`.
- **키가 없거나 SDK 가 실패해도 깨지지 않는다**: 주소는 그대로 저장되고(좌표 null), 선생님 폼은 안내 문구, 학부모
  화면은 지도 없이 주소 + "카카오맵에서 보기"(`map.kakao.com/link/search/<주소>`) 링크. 좌표 없이 저장된 주소는
  수정 화면을 열 때 한 번 더 찾아 본다.
- **카카오 콘솔 설정** (로그인과 같은 앱): [제품 설정 › 카카오맵] 사용 설정 ON(2026-07-21부터 필수) · [플랫폼 키 ›
  JavaScript 키]의 JavaScript SDK 도메인에 `https://rg-manager.vercel.app`, `http://localhost:3000`. 와일드카드가 안 되므로
  Vercel PR 미리보기 도메인에서는 지도가 안 뜬다(정상).
- 지도 미리보기는 끌기·휠 확대를 끈다 — 휴대폰에서 페이지를 내리다 지도가 스크롤을 가로채지 않게. 크게 보기·길찾기는
  카카오맵 링크(`map.kakao.com/link/map|to/<이름>,<위도>,<경도>`)가 맡는다.
- **e2e** 는 두 스크립트와 `/api/maps/config` 를 `e2e/kakao-fakes.mjs` 로 바꿔 끼운다(localhost 는 카카오 콘솔에 없는 도메인이고
  우편번호 창은 다른 출처의 iframe 이다). 진짜 SDK·키·도메인은 운영에서 눈으로 확인한다.

### Recommended Shop (추천 상품)

Design docs and mockups: `docs/recommended-shop/`. A teacher lists products they recommend; parents
open **one public link `/shop/<publicId>` without logging in**; the teacher sees which links get clicked.

- **Tables** (`shops` 1 per teacher, `shop_categories`, `shop_products`, `shop_product_images`,
  `shop_events`). `shops.publicId` is `generatePublicId()` (same as the FAQ chat link) and never changes. The shop and the 5 default
  categories (발레복·레오타드·기구·슈즈·용품) are created on the teacher's first `GET /api/shop`
  (`services/shopService.js`, one transaction, `ON CONFLICT ("userId")`). Category names are unique per
  teacher via an expression index (`lower(btrim(name))`) → the API maps pg `23505` to **409**.
- **Only the title is required.** Description (≤1,000 chars, line breaks kept, rendered as plain text), URL,
  photos, category, price are optional. URLs go through
  `normalizeUrl()` — **http/https only**, a bare `coupang.com/…` gets `https://` — on the server
  (`utils/shopValidation.js`) *and* again at render time on the client (`utils/shopFormat.js:safeHref`).
  The two files hold the same rules and are tested with the same table; change both together.
- **Routes**: teacher UI is `/products` (`/reservations`, `/stats`, `/settings` tabs, `pages/Shop/`), the public page is
  `/shop/:publicId` (`pages/PublicShop.jsx`) in `App.jsx`'s **public branch** next to `/chat/` — rendered
  before the auth check, so logged-in teachers/parents see the same standalone page. The two prefixes
  are deliberately different: `/shop/*` would otherwise swallow the teacher's sub-routes.
  A card opens the **product detail** (`components/shop/ProductDetail.jsx`) via `?p=<id>` (alongside `?c=`):
  a card click pushes history with `state.shopDetail`, so closing goes `navigate(-1)` (the back button
  closes it too); a detail opened straight from a link only drops `?p=`. A product with **neither photos
  nor a URL** (and not taking reservations) stays a non-clickable card. The detail is a bottom sheet on mobile (swipe the photos —
  scroll-snap — with dots) and a wide modal on desktop (big photo + thumbnail strip, ‹ › and ←/→);
  same DOM, CSS decides (`ProductGallery.jsx`). `Modal header={false}` lets the photo sit at the top.
  On phones the sheet **closes when dragged down** (`Modal swipeToClose` → `hooks/useSwipeToClose.js`, pure rules in
  `utils/sheetSwipe.js`): only while the body is scrolled to the top, and the first move decides — sideways (photo
  swipe), upward, or a scrolled body stay the browser's. Close past 140 px (or 30% of a short sheet) or on a fast flick;
  otherwise it springs back. If the sheet is still mounted 600 ms after `onClose` (an `onClose` that only steps back), it
  slides back instead of staying hidden. Touch listeners are native `{ passive: false }` because React's `touchmove` is passive.
  Off by default — don't turn it on for forms, where an accidental close loses input (the detail turns it off
  while its reservation form is showing: `swipeToClose={step !== 'reserve'}`).
- **Parent app tab [추천 상품]** (`/parent/shop`, `pages/parent/ParentShop.jsx`) opens that **same** `/shop/<publicId>` page,
  full screen. `GET /api/parent/shops` lists linked teachers' active shops (publicId · title · teacherName); one shop →
  `Navigate replace`, several → a chooser. The tab passes the current parent path as router state `backTo` (never in the
  URL, so the share link is unchanged); `PublicShop` then shows **[돌아가기]** (only for `/parent/…` paths) and carries
  `backTo` through its own chip/detail navigations — anything it navigates with must pass `carry` or the button vanishes.
- **API**: `/api/shop/*` is teacher-only (`rejectParents` in `server.js`, except `/api/shop/public/*`).
  Every teacher query is scoped by the token's user id; another teacher's ids return **404**. Public
  responses go through `utils/shopSerializer.js` (a whitelist — a test pins the exact keys), skip
  hidden products, and list only categories that have visible products. A closed shop and an unknown
  `publicId` return the **same 404**.
- **Click/visit tracking**: **pressing a product card in the list is the click** (2026-10-05 — it used to
  be only the detail's mall button). `PublicShop` passes `onOpen` to `ProductCard`; the detail's
  **[○○에서 보기]** (a plain `<a target="_blank">`) counts only when the detail was opened straight from a
  `?p=` link (no `state.shopDetail`), so one card → mall-button visit is one click, not two. Either way
  `utils/shopTracking.js` fires `navigator.sendBeacon` (fallback `fetch keepalive`) — **values in the
  query string only, no body** — so navigation never waits. The server counts a click only for a visible
  product that the list lets you press — URL **or** photo **or** reservations (`ShopProduct.CLICKABLE_SQL`,
  same rule as the client's `utils/shopFormat.js:isClickableProduct`) — ignores the same `visitorKey` on
  the same product within **10 s**, and counts a
  visit once per `visitorKey` per **30 min** (`models/ShopEvent.js`). No IP/UA is stored. Public routes
  have their own limiters and are skipped by `apiLimiter`; the view/click endpoints must pass **both** a
  per-`visitorKey` limit and a per-IP limit (`PUBLIC_SHOP_TRACK_IP_MAX`), because `visitorKey` is
  client-supplied and could otherwise be rotated to dodge the limit. Middle-click (`auxclick`) counts too.
- **Product order** (teacher list, `pages/Shop/ProductList.jsx`): drag the row's grip handle (pointer events, so
  mouse **and** touch — `touch-action: none` on the handle), ▲▼, or ↑↓ on the focused handle; all go through
  `ShopManager.reorder(from, to)` → `PUT /api/shop/products/order`. The landing slot is computed from the other
  rows' midpoints (`utils/reorder.js:dropIndex/dropMarker`); the dragged row is clamped inside the list and
  edge auto-scroll stops once the list's end is on screen (a transformed row past the end grows the page, and
  auto-scroll used to run away on phones). Disabled while searching/filtering. `DataTable rowProps` puts the
  per-row data/style on `<tr>`.
- **Hidden stays hidden**: `PUT /api/shop/products/:id` without `isVisible` keeps the current value
  (create defaults to visible) — a client that omits the field must not silently re-publish a product.
- **Stats** (`GET /api/shop/stats?days=7|30|90|all`) rank products by clicks (ties share a rank,
  non-pressable cards — no URL, photo or reservations — have no rank; the response carries `clickable`),
  include zero-click and hidden products, and sum by category.
  Deleting a product deletes its clicks (FK cascade); hiding keeps them — the UI says so.
- **Photos** (2차, `docs/recommended-shop/04-images-description.md`): up to **10 per product** in
  `shop_product_images`; the first is the **main photo** (`imageUrl` in teacher responses = list/stats
  thumbnail). They reuse the FAQ upload path: raw bytes, extension decides the MIME (no SVG), 4 MB, stored in
  the existing bucket under `shop/{userId}/{uuid}/…`. API: `POST …/products/:id/images` appends one
  (locks the product row; **409** when full, the uploaded file is removed), `PUT …/images/order` takes all
  ids exactly once, `DELETE …/images/:imageId`. Product delete reads the paths first, then deletes files.
  The legacy single-image columns `shop_products."imagePath"/"imageUrl"` are **moved into the table and
  cleared by one boot-time statement** — 2차 code never reads them.
- **Square photos, crop in the browser**: every photo box is square and the photo is absolutely positioned
  inside it — a tall photo used to stretch its card (247 → 1,318 px) and break price alignment; price/host
  sit at the card bottom. New photos get **[자르기]** (`pages/Shop/ImageCropper.jsx`: drag + 1–3× zoom,
  `{x, y, zoom}`); upload crops to a ≤1,200 px **square JPEG** with the same math the preview CSS uses
  (`utils/imageCrop.js:cropRect` ↔ `cropStyle` — change both together). GIF with an untouched crop is sent
  as-is. Already-uploaded photos are not re-croppable. The form keeps the list in `utils/productImages.js`
  (pure) and saves product → deletes → uploads one by one → order; a failed photo leaves the product
  saved with a toast. The crop view replaces the form inside the same Modal (a nested Modal would close
  both on one Esc). A copied image pasted anywhere in the open form is **appended**
  (`utils/clipboardImage.js`) — except text+image pasted into a text box, where the text wins.
  Without `SUPABASE_SECRET_KEY` the image field shows a notice.
- **Reservations** (3차, `docs/recommended-shop/05-reservations.md`): a product with `isReservable` (form switch
  **[예약 받기]**, default off, omitted on update = unchanged — same rule as `isVisible`) gets **[예약하기]** under its
  detail, and its card becomes clickable even without photo/URL. The form (`components/shop/ReservationForm.jsx`) replaces
  the detail **inside the same Modal**; Esc/scrim there goes back to the detail instead of closing. Name (parent or child,
  ≤30) · phone (normalised to `010-1234-5678`) · date from the inline **`Calendar`** (`components/ui/Calendar.jsx` +
  `utils/calendar.js`, dates are always `YYYY-MM-DD` strings) — **today (KST on the server) to +180 days**. Same rules on
  both sides (`utils/shopReservation.js` server + client, same phone table in both tests). `POST
  /api/shop/public/:publicId/products/:productId/reservations` (no login; own limiter `PUBLIC_SHOP_RESERVE_IP_MAX` = 20 per
  IP per 15 min; 409 when the product stopped taking reservations; same product+phone+date still `requested` → 200
  `duplicate`) answers **date + status only**. `shop_reservations` keeps rows when the product is deleted (`productId` →
  NULL, the stored `productTitle` shows). Teacher tab `/products/reservations`: status chips + a 요청/확정/취소 segmented
  control per row (`PATCH /api/shop/reservations/:id/status`, any direction); `GET /api/shop` carries
  `requestedReservations` for the tab count. Parents are **not** notified — the teacher calls the number. The log line
  omits name/phone. **One reservation per product per date**: `requested`/`confirmed` hold the date, `cancelled` frees
  it. `ShopReservation.create` checks-then-inserts in one CTE (`created` / `duplicate` = same phone / `taken` → **409
  `code: 'dateUnavailable'`**, who holds it is never revealed); the partial unique index
  `idx_shop_reservations_product_date` stops two simultaneous requests (23505 → same 409) and is created in a try/catch so
  existing overlaps can't stop boot. `GET …/products/:productId/unavailable-dates` returns dates only; the form greys and
  strikes them out (`Calendar unavailable` — `aria-disabled`, still keyboard-focusable) and refetches after a 409.
  Un-cancelling a reservation whose date was taken meanwhile → 409, row unchanged.
- **Schema rollout**: 1차 added four tables; 2차 adds `shop_products.description`, `shop_product_images` and
  the legacy-photo move; 3차 adds `shop_products."isReservable"` and `shop_reservations` (names + phone numbers — the
  REVOKE matters) — apply the `server/database.js` DDL to production **before** merging,
  `ALTER TABLE … OWNER TO rg_app`, and REVOKE the public-API grants (see *Deployment*).

### Student-Class Relationship

**Many-to-Many** relationship stored as JSON array in `students.classIds`:
- Students can be enrolled in multiple classes
- When a class is deleted, it's removed from all student `classIds` arrays
- Class enrollment managed via PUT requests to `/api/students/:id`

## PR review & merge — this repo only

A PR-review or merge request made from this project ("새로운 PR 검색하고 리뷰하고 머지해줘",
`/pr-review-merge`, or a recurring triage goal) applies to **`jaerimee-rg/rg-manager` only**.

- Scan with `gh pr list -R jaerimee-rg/rg-manager`. Do **not** scan, review or merge any other
  repository — in particular the `Supercoder-co/supercoder-ai-interviewer-be` / `-fe` repos that
  the shared `pr-review-merge` skill hard-codes are **out of scope here** and must be skipped.
- Base branch is **`main`**, not `dev`. `main` has **no branch protection**, so a plain
  `gh pr merge <PR#> -R jaerimee-rg/rg-manager --squash` works — the skill's
  `enforce_admins` off/merge/on dance belongs to the Supercoder repos and must not be run
  against this repo.
- **Merging is deploying.** `main` auto-deploys to Vercel production, so treat a merge as a
  production release: CI green, `cd client && npm test` and `cd server && npm test` green, and
  if the PR touches `server/database.js`, follow the fire-and-forget migration warning under
  *Deployment* — verify the DDL actually landed in production right after the merge.
- After merging, delete the branch **and** its worktree (this repo's owner wants them gone, which
  overrides the usual "keep the worktree" habit): `git worktree remove`, then `git branch -D`,
  then `git push origin --delete <branch>`. Back up the worktree's `.env` / `.env.local` first —
  they have differed between worktrees. Because merges are squashed, `git branch --merged` and
  `git cherry` will wrongly report a merged branch as unmerged; confirm with
  `git merge-tree --write-tree origin/main <branch>` equalling `git rev-parse origin/main^{tree}`.

## Running the e2e suite (Playwright)

`client/e2e/*.spec.mjs` runs against the **built** app served by Express on a local Postgres —
never the production DB. Three things must line up or almost everything fails in a confusing way:

```bash
cd client && npm run build
cd ../client && node e2e/fake-storage.mjs &                                   # fake Supabase Storage on :5056
cd ../client && node e2e/fake-face-engine.mjs &                               # fake face engine on :5057
cd ../server && DATABASE_URL=postgresql://<user>@localhost:5432/rg_manager PORT=5055 \
  JWT_SECRET=local-dev-secret API_RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 \
  SUPABASE_URL=http://localhost:5056 SUPABASE_SECRET_KEY=e2e-fake \
  FACE_ENGINE_URL=http://localhost:5057 node server.js &
cd ../client && E2E_BASE_URL=http://localhost:5055 npm run test:e2e:setup   # writes e2e/.sessions.json
cd ../client && E2E_BASE_URL=http://localhost:5055 npm run test:e2e         # 103 tests
```

- **`design` project** (`e2e/design.spec.mjs`) checks the redesign in a real browser — computed
  colors/strokes/fonts and the three role shells. Its font-download test needs the jsDelivr/Google Fonts
  CDNs and **skips** when they are unreachable.
- **The fake face engine is optional too** (`client/e2e/fake-face-engine.mjs`): it answers `/api/face-engine/*` like
  `face_engine/` (needs a Bearer token, always "no face") so the browser → Express → engine → save path runs without
  the 190MB models. Without `FACE_ENGINE_URL` the two analysis tests (parent face photo, teacher [얼굴 찾기]) **skip**.
- **The fake storage is optional** — it lets the shop photo tests upload for real (`client/e2e/fake-storage.mjs`
  mimics the three Storage REST calls `server/utils/storage.js` makes and keeps files in memory; `GET /__files`
  lists them). Without `SUPABASE_URL`/`SUPABASE_SECRET_KEY` the server reports `storageReady:false` and the
  three photo tests in `shop.spec.mjs` **skip**. Never point e2e at the real Supabase key.

- **`JWT_SECRET` must be `local-dev-secret`** — that is what `e2e/setup.mjs` defaults to when signing
  the fixture tokens. Any other value makes every request unauthenticated, so every screen redirects
  to `/login` and ~50 tests fail on missing headings. The symptom looks nothing like the cause.
- **Raise the rate limits.** The whole suite runs from one IP and makes far more than the production
  `apiLimiter` allows (200 per 15 min), so without the override the *later* tests get `429` and fail
  while the same tests pass when run alone. `AUTH_RATE_LIMIT_MAX` / `API_RATE_LIMIT_MAX` exist only
  for this — **the defaults are the production values**, so leaving them unset changes nothing.
- **Do not run the suite twice without re-running `test:e2e:setup`.** Some fixtures are one-time
  (teacher invite tokens get consumed), so a second run without fresh setup fails.
- **Never `NODE_ENV=production` locally** — it turns on SSL for Postgres and an HTTPS redirect.

## Branding (서비스명 · 로고 · 링크 미리보기)

- Service name is **JR 리듬체조** — read it from `client/src/utils/brand.js` (`SERVICE_NAME`, `LOGO_SRC`),
  never hard-code it. The logo mark is `client/public/logo-mark.png` (pink JR mark, 512×416, transparent —
  cut out from the white-background original with `scripts/cut-logo.py`; the favicons come from the same script).
- `components/ui/Brand` renders the logo with the name **below** it (`as="h1"` in the teacher header and
  on 로그인, `size="sm" caption="관리자"` in the admin sidebar).
- `components/ui/Spinner` is **the** loading indicator: the logo bouncing up and down plus a label
  (`fullscreen` while the saved token is checked, `inline` inside cards). The only exception is the small
  circle inside buttons (`.ui-btn__spinner`). `index.html` carries an inline copy of the same animation so
  it shows while the JS bundle downloads.
- Link previews (KakaoTalk invite / event share links): the `og:*` tags live in `client/index.html`, the image
  is `client/public/og-image.png` rendered from `client/og/og-image.html` with `cd client && npm run og`
  (Playwright Chromium). Re-run it whenever the copy or logo changes and commit the PNG.
- `vercel.json` has an explicit route for `logo-mark|og-image|icon-192|icon-512.png` — without it the SPA
  catch-all would serve `index.html` for those files and the preview image would break in production.

## Deployment (Vercel)

Production runs on Vercel at **https://rg-manager.vercel.app**, deployed automatically
on every push to `main` via the GitHub integration. Render is no longer used.

**How it is wired** (`vercel.json`):
- `/api/face-engine/*` → `face_engine/index.py` (`@vercel/python`, face analysis — see *Event Photo Albums*). Listed
  **before** the `/api` route. Its `excludeFiles` keeps `client/`, `server/`, docs and the local `.models` out of the
  Python bundle; dependencies come from `face_engine/requirements.txt`, Python from `face_engine/.python-version`.
- `/api/*` → `server/server.js` as a serverless function (`@vercel/node`)
- everything else → the static React build (`client/dist`)

**Environment variables** (Vercel → Project → Settings → Environment Variables, Production):
- `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`
- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`
- `APP_URL` — outward URL used for KakaoTalk message links
- `GEMINI_API_KEY` — FAQ chatbot answers (Gemini provider)
- `OPENAI_API_KEY` — FAQ chatbot answers (OpenAI provider). `OEPNAI_API_KEY` (typo)
  is also read, since that is the name currently registered locally and on Vercel.
- `SUPABASE_SECRET_KEY` — required to upload FAQ answer files (dashboard → API Keys →
  Secret key, `sb_secret_...`). The older `SUPABASE_SERVICE_ROLE_KEY` name is still read.
  Without either, the 파일 tab shows a notice and uploads are refused with 503
  (the rest of the app is unaffected).
- `SUPABASE_URL` — optional; derived from `DATABASE_URL`'s project ref when unset
- `SUPABASE_STORAGE_BUCKET` — optional, defaults to `faq-files`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — event photo albums (Google Drive).
  Without them the album screens show "관리자에게 문의" guidance and nothing else breaks.
- `GOOGLE_OAUTH_REDIRECT_URI` — optional; defaults to `${APP_URL}/api/drive/callback`
- `KAKAO_JS_KEY` — Kakao **JavaScript** key for the event location map (see *Event Location Map*).
  Optional: without it addresses are still searched and saved, only the map picture is missing.
  Not the REST key (`KAKAO_CLIENT_ID`) — the map SDK rejects it.

`APP_URL` and `KAKAO_REDIRECT_URI` must both match the live domain. They are resolved in
`server/utils/appUrl.js`, which derives `KAKAO_REDIRECT_URI` from `APP_URL` when it is not
set explicitly. `KAKAO_REDIRECT_URI` must also be registered in the Kakao developer console.

**Notes**:
- `server/server.js` skips `app.listen` when `process.env.VERCEL` is set and exports the app
- `initDatabase()` runs on module load, so schema migrations apply on the first cold start.
  **It is fire-and-forget** (`initDatabase().catch(console.error)`) — no request awaits it, and
  Vercel may freeze the instance as soon as a response is sent. A small migration usually slips
  through; a large one (the album feature added 5 tables, 7 columns and 8 indexes) does **not**.
  After deploying a sizeable schema change, verify the tables exist in production and, if they
  do not, apply the same DDL directly (Supabase SQL editor / MCP `apply_migration`) and
  `ALTER TABLE <t> OWNER TO rg_app` so the app can write to them. **Also run
  `REVOKE ALL ON TABLE <t> FROM anon, authenticated, service_role`** (and on its `_id_seq`): the editor/MCP
  run as `postgres`, and Supabase's default privileges grant those roles full access to anything
  `postgres` creates in `public` — with RLS off that exposes the table through the public REST API.
  Tables the app creates itself (as `rg_app`) only carry `rg_app` grants; match that. Re-running `initDatabase()`
  afterwards is a no-op because every statement is `IF NOT EXISTS`.
  `client/e2e/smoke-prod.mjs` (`npm run smoke:prod`) checks the deployed app end to end
- There is no migration tool — add `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
  statements to `server/database.js` so they are safe to re-run

## Key Patterns & Conventions

### Age Calculation
Ages are never stored — only `birthdate` — so age is derived at render time. **Import the shared
helper; do not re-implement it inline:**

```javascript
import { calculateAge } from '../utils/dateHelpers';
```

`client/src/utils/dateHelpers.js` also exports `formatDate()`, and is the one covered by
`utils/__tests__/dateHelpers.test.js`. `pages/Dashboard.jsx` still carries an old inline copy —
fold it into the helper if you touch that file.

### Student list ordering
Any list of students is **이름 가나다순 (ascending)** by default — never registration order.
The rule is enforced in SQL so every screen inherits it without its own sort:

- `Student.getAll` / `getByIds` / `getByClassId` end in `NAME_ORDER` (`ORDER BY name ASC, id ASC`),
  so `/api/students` — and with it 학생 관리, 출석 체크, 수업별 학생, 학부모 연결 — comes back sorted.
- `Competition.getStudents(WithEvents)`, `EventRegistration.listByEvent` (**not** `createdAt`),
  `ParentChild.listByParent` and `ParentAccount.listByTeacher/listAll` sort the same way.
  The parent-side ones use `COALESCE(s.name, c."childName")` because a child that is not linked
  to a student row yet only has the name the parent typed.
- **No `COLLATE` is needed.** Hangul syllables (U+AC00–U+D7A3) are laid out by
  초성·중성·종성, so code-point order *is* 가나다 order — and `en_US.UTF-8` (local + Supabase)
  and `C` both agree on it. `id` is only a tiebreak so 동명이인 do not shuffle between requests.
- `StudentList.jsx` starts at `sortConfig = { key: 'name', direction: 'asc' }`; the column
  headers still re-sort by 이름·생년월일·수강 수업. Client-side sorts use `localeCompare(_, 'ko')`.

### JSON Array Handling
Student `classIds` stored as JSON string:
```javascript
// Save
JSON.stringify([1, 2, 3])

// Load
JSON.parse(student.classIds)
```

### Responsive behaviour
Do **not** hand-roll a resize listener in a component — that pattern was removed from the
codebase. Layout is CSS's job (see *Mobile Responsiveness Pattern* above); when genuine
*behaviour* differs, use the shared hook:

```javascript
import { useIsMobile } from '../hooks/useMediaQuery';

const fullScreen = useIsMobile(1023);   // true when innerWidth <= 1023; defaults to 768
```

Pass the breakpoint explicitly when it must agree with a media query, and keep the two in
sync — the hook is `<=` so it pairs with `max-width: <n>px`, not `max-width: <n+1>px`.
`EventRegistrations.jsx` is the worked example: CSS decides side-panel vs full-screen, and the
hook drives only the modal semantics (`role="dialog"`, Escape, body scroll lock).

## Common Modifications

### Adding a New API Endpoint
1. Create controller in `server/controllers/`
2. Create route in `server/routes/`
3. Import and use route in `server/server.js`
4. Frontend: Use relative path `/api/your-endpoint`

### Adding a New Page/Route
1. Create component in `client/src/pages/`
2. Add route to `App.jsx` (wrap with `ProtectedRoute` if auth required)
3. Add navigation link to header in `App.jsx`

### Modifying Database Schema
There is no migration tool. `initDatabase()` in `server/database.js` runs on every boot
(including Vercel cold starts), so every statement must be safe to re-run:

1. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (or `CREATE TABLE IF NOT EXISTS`)
   to `server/database.js` — never edit an existing table definition in place, since
   `CREATE TABLE IF NOT EXISTS` will not alter a table that already exists
2. Treat new columns as nullable / defaulted so existing rows stay valid
3. Update the corresponding model and controller
