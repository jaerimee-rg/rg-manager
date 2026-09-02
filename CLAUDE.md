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
cd client && npm test          # jest — 517 tests / 43 suites
cd server && npm test          # 883 tests / 45 suites
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
- The visual language follows Deel's design-system *structure* (flat 1px-bordered surfaces,
  no shadows except on floating things, 10/16/24 radii, 40px controls, pill badges, 14/24
  body, 400·500 weights). Color and typeface stay rg-manager's own.

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
  through `services/parentScope.js`** — `Event.listUpcomingForParent` / `getPublishedForParent` /
  `listWithAlbumsForParent` take an **array** of teacher ids. A parent sees only linked teachers'
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
  Open to parents: `/api/auth/login|signup|kakao*|verify`, `/api/invite/*`, `/api/parent/*`,
  `/api/chat/public/*`, `GET /api/faq-files/:id/view`. **Add new teacher routers to the guarded
  list in `server.js`.**
- **Invite link**: one per teacher (`parent_invites`), shown at 학부모 (`/parents`). The token
  rides through Kakao as the OAuth `state`; only a callback carrying a valid one creates a parent.
  A teacher's Kakao id hitting an invite link is refused with 409, never converted.
- **Child matching** (`services/parentOnboarding.js`): name (spaces removed) + birthdate
  (format-normalised) must hit exactly one of that teacher's students to auto-link. Zero or
  several leaves the child `pending` — signup still completes, and the teacher links it by hand
  from either the by-parent or by-student view.
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
file ids, metadata, and face vectors. Design docs: `docs/photo-sharing/` (requirements, data
model, implementation plan, mockups).

- **Drive connection** is per teacher (`google_drive_accounts`), OAuth scope **`drive.file` only** —
  the app sees only files it created, so Google requires no verification. `utils/googleDrive.js`
  speaks REST via `fetch` (no `googleapis` SDK); `services/driveAccess.js` is the only place that
  joins stored tokens with refresh. A revoked grant flips the row to `status='error'`, which every
  screen reads to show a banner — **reads keep working, writes stop**.
  `/api/drive/callback` cannot use `verifyToken` (browser redirect, no header), so it trusts a
  **signed 10-minute `state`** carrying the user id.
- **Album folder**: the app creates the folder under `RG Manager` and turns on **link sharing
  (anyone with the link, reader)** — the gallery uses Drive thumbnail URLs directly, so without
  sharing nothing renders. `events.albumStatus` is `none|ready|missing|unshared`. Deleting an
  event never deletes the Drive folder.
- **There is no teacher-facing album screen right now.** The 사진·영상 section used to live at the
  bottom of the event form; it was removed on 2026-09-01 at the owner's request, together with
  `EventAlbumSection.jsx` and `MediaDetailModal.jsx`. Everything else — the API (`/api/events/:id/album`,
  `/media/*`), access rules, the parent gallery and existing albums — is untouched and still tested,
  but **nothing in the UI creates a new album folder**, so events created from now on have no album
  until a teacher-facing entry point comes back. Restore the screen from git history (`git log
  -- client/src/pages/Events/EventAlbumSection.jsx`) rather than rewriting it.
- **Uploads never pass through the server.** `POST .../media/uploads` returns a Drive *resumable
  session URI* (created with an `Origin` header so the browser may PUT to it); the browser uploads
  in 8MB chunks with progress and resume (`utils/driveUpload.js`). `POST .../media/:id/complete`
  re-reads the file from Drive and **verifies it landed in this album's folder** before marking it
  `ready` — a leaked session URI cannot inject files elsewhere.
- **Who can see an album**: the teacher, plus parents whose child is **confirmed** for that event —
  either `event_registrations.status='confirmed'` or already in `competition_students`
  (`utils/albumAccess.js:isConfirmedParent`). Everything parent-facing goes through
  `utils/mediaSerializer.js:toParentMedia`, a **whitelist** — other children's tags, face boxes,
  descriptors, uploader names and Drive filenames never leave the server. A test pins the exact
  field list so a new column cannot leak by accident.
- **Face indexing runs in the browser**, not on Vercel: `utils/faceClient.js` lazy-loads
  `@vladmandic/face-api` plus three models from `client/public/models` (~6.4MB, its own bundle
  chunk) and posts only `{box, score, descriptor}`. The server validates and stores the vector.
  If the browser cannot decode the file (HEIC on Android) or the models fail to load, the upload
  still succeeds with `faceStatus='skipped'` and the teacher can tag by hand.
- **Vectors are `TEXT` (base64 of a 128-float array), not pgvector** — the production Supabase role
  is not a superuser and cannot `CREATE EXTENSION`. Distances are computed in JS
  (`utils/faceVector.js`); at this scale that is tens of milliseconds. Promote to pgvector later by
  changing the column type only.
- **Tag precedence** `manual > parent_confirmed > face > candidate`, and `excluded` is never
  resurrected by re-matching (`utils/faceMatch.js:nextTagSource`, the whole table is unit-tested).
  Distance ≤ `face_match_threshold` (0.50) auto-tags, ≤ `face_candidate_threshold` (0.60) becomes a
  "혹시 우리 아이?" candidate; both are `app_settings` keys.
- **Parents**: 사진 tab (`/parent/photos`), gallery (`/parent/photos/:eventId`) with the
  **우리 아이 사진만 보기** toggle, a full-screen viewer whose 저장 button opens the Drive download
  URL, and child face registration in 내 정보. Parents may delete only what they uploaded.
- **Deletes go to the Drive trash** (`files.update {trashed:true}`), never permanent — 30 days to
  recover. The DB row is removed, cascading faces and tags.

**Google setup required before this works** (see `docs/photo-sharing/03-implementation-plan.md` §12):
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, an authorized redirect URI of
`<APP_URL>/api/drive/callback`, Drive API enabled, and the consent screen published. Without them
`/api/drive/account` returns `configured:false` and every album screen shows connect guidance —
the rest of the app is unaffected.

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
cd ../server && DATABASE_URL=postgresql://<user>@localhost:5432/rg_manager PORT=5055 \
  JWT_SECRET=local-dev-secret API_RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 node server.js &
cd ../client && E2E_BASE_URL=http://localhost:5055 npm run test:e2e:setup   # writes e2e/.sessions.json
cd ../client && E2E_BASE_URL=http://localhost:5055 npm run test:e2e         # 57 tests
```

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

## Deployment (Vercel)

Production runs on Vercel at **https://rg-manager.vercel.app**, deployed automatically
on every push to `main` via the GitHub integration. Render is no longer used.

**How it is wired** (`vercel.json`):
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
  `ALTER TABLE <t> OWNER TO rg_app` so the app can write to them. Re-running `initDatabase()`
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
