# Calendar Assistant

A React + Node/Express calendar assistant that connects a Google account, fetches calendar events, and provides a schedule-aware chat experience.

## Assignment Requirement Coverage

This project satisfies the core requirements:

- Web interface built with React (`client/`).
- Google account authentication via OAuth2 (`/auth/google`, `/auth/google/callback`).
- Calendar data fetched from Google Calendar API (primary calendar).
- Calendar data displayed in a useful UI ("This week", grouped by day).
- Simple chat interface connected to a calendar-aware backend.

In addition, this implementation includes:

- Meeting analytics for the next 7 days (meeting hours, count, meeting-heavy days).
- Suggested 30-minute openings based on free time in standard work hours.
- "AI Executive Assistant Mode" via **Optimize My Week** (detects overload days, no focus time, tight meeting spacing, and proposes improvements).
- Optimization results are shown only after clicking **Optimize My Week** (no automatic optimization run on page load).
- Executive Assistant quick actions (each opens a confirmation before creating a calendar hold):
  - **Create Focus Block** — pick start date/time and duration (minutes).
  - **Create Workout Block** — same pattern.
  - **Add Custom Block** — title, start date/time, duration in minutes (minutes field sits under the button).
- Chat-assisted event creation/update/delete with explicit confirmation phrases:
  - `confirm create meeting`
  - `confirm update meeting`
  - `confirm delete meeting`

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript, `express-rate-limit` (targeted HTTP throttles)
- Auth + calendar: Google OAuth2, `google-auth-library`, and `@googleapis/calendar` (Calendar API v3)
- AI: OpenAI Chat Completions API
- Session: `cookie-session` with server-side refresh token in session cookie

## Project Structure

```text
.
├── client/               # React app
├── server/               # Express API + OAuth + chat/calendar logic
└── MANUAL_GOOGLE_CLOUD_SETUP.md
```

## Local Setup

### 1) Clone and install dependencies

```bash
git clone <your-repo-url>
cd <repository-root>

cd server && npm install
cd ../client && npm install
```

### 2) Configure environment variables

Create `server/.env` from `server/.env.example`:

```bash
cd server
cp .env.example .env
```

Set the required values in `server/.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI` (or `GOOGLE_REDIRECT_URI`)
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `CLIENT_ORIGIN` (or `FRONTEND_URL`)

For this repo's default local setup:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- OAuth callback: `http://localhost:3001/auth/google/callback`

### 3) Run backend

```bash
cd server
npm run dev
```

### 4) Run frontend (new terminal)

```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Test / Validation Commands

### Build checks

```bash
cd server && npm run build
cd ../client && npm run build
```

### Lint / static analysis

```bash
cd server && npm run lint
cd ../client && npm run lint
```

- **Server:** `npm run lint` runs **`tsc --noEmit`** (same strict options as `build`, without emitting `dist/`). That is the primary static check for the API.
- **Client:** ESLint (`eslint.config.js`) for React/TS style and hooks rules.

### Manual functional test checklist

1. Click **Connect Google Calendar** and complete OAuth.
2. Confirm you see:
   - Events under **This week**
   - Meeting analytics cards
   - Suggested 30-minute openings
   - AI Executive Assistant Mode with **Optimize My Week**
3. Ask chat:
   - "How much of my time am I spending in meetings this week?"
   - "Draft a concise email to schedule a 30-minute meeting next week; I prefer afternoons."
   - "Update the existing meeting titled 'Planning Day' on 2026-05-02 and ask me to confirm."
   - "Delete the event titled 'Planning Day' on 2026-05-02 and ask me to confirm."
4. Verify answers reflect your real calendar context.
5. Click **Optimize My Week**:
   - If issues exist, verify recommendation text appears.
   - If no issues exist, verify it explicitly says the calendar is already optimized.
6. After **Optimize My Week**, test the quick actions (each should confirm before creating a hold):
   - **Create Focus Block** (start + minutes)
   - **Create Workout Block** (start + minutes)
   - **Add Custom Block** (title, start, minutes under the button)

## API Endpoints (Backend)

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /api/me`
- `POST /api/logout`
- `GET /api/calendar/events`
- `GET /api/calendar/analytics`
- `GET /api/calendar/recommendations`
- `GET /api/calendar/optimize`
- `POST /api/calendar/events`
- `PATCH /api/calendar/events/:eventId`
- `DELETE /api/calendar/events/:eventId`
- `POST /api/chat`

## Production readiness (take-home scope)

### What is in place

- **Modular layout:** HTTP routes stay thin; calendar math, Google calls, and prompt formatting live in `server/src/calendarService.ts`; OAuth wiring in `oauthClient.ts`.
- **Static analysis:** **Strict TypeScript** on the server (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) plus `npm run lint` → `tsc --noEmit`. The client also runs **ESLint** (`npm run lint` in `client/`).
- **Edge cases & errors:** Calendar routes return **401** when unauthenticated, **403** when Google reports insufficient scopes (with a reauth hint), **400** for bad inputs, and **502** when upstream calls fail. Chat calendar writes require **explicit confirmation phrases** so the model cannot silently mutate the calendar.
- **Rate limits (application layer):** `express-rate-limit` guards the costliest / abuse-prone endpoints (defaults suit local dev; tighten in real production):
  - **`POST /api/chat`** — 24 requests / minute / client IP (OpenAI cost + abuse).
 