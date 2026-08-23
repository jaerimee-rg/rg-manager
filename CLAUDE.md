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
   - Roles: `admin` or `user`

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

**Mobile Responsiveness Pattern**:
Components use `isMobile` state (window.innerWidth <= 768) to toggle between:
- Desktop: Table layouts
- Mobile: Card-based layouts with full-width buttons

When modifying forms/lists, ensure mobile view uses:
- `whiteSpace: 'nowrap'` for labels to prevent vertical text
- `flexWrap: 'wrap'` for button groups
- Card layout instead of tables on mobile

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
- Models are overridable per provider: `OPENAI_FAQ_MODEL`, `FAQ_CHAT_MODEL`

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

### Student-Class Relationship

**Many-to-Many** relationship stored as JSON array in `students.classIds`:
- Students can be enrolled in multiple classes
- When a class is deleted, it's removed from all student `classIds` arrays
- Class enrollment managed via PUT requests to `/api/students/:id`

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

`APP_URL` and `KAKAO_REDIRECT_URI` must both match the live domain. They are resolved in
`server/utils/appUrl.js`, which derives `KAKAO_REDIRECT_URI` from `APP_URL` when it is not
set explicitly. `KAKAO_REDIRECT_URI` must also be registered in the Kakao developer console.

**Notes**:
- `server/server.js` skips `app.listen` when `process.env.VERCEL` is set and exports the app
- `initDatabase()` runs on module load, so schema migrations apply on the first cold start
- There is no migration tool — add `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
  statements to `server/database.js` so they are safe to re-run

## Key Patterns & Conventions

### Age Calculation
Always use this pattern for displaying age:
```javascript
const calculateAge = (birthdate) => {
  if (!birthdate) return '-';
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};
```

### JSON Array Handling
Student `classIds` stored as JSON string:
```javascript
// Save
JSON.stringify([1, 2, 3])

// Load
JSON.parse(student.classIds)
```

### Mobile-First Responsive Design
```javascript
const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

useEffect(() => {
  const handleResize = () => setIsMobile(window.innerWidth <= 768);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

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
