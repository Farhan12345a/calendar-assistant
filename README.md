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
- Backend: Node.js, Express, TypeScript
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

## Why This Design

- Fast-to-evaluate architecture: split frontend and backend keeps responsibilities clear.
- OAuth + session pattern is simple and practical for a take-home.
- Calendar reads/writes use the generated `@googleapis/calendar` client; OAuth uses `google-auth-library` (with `googleapis` only for the OAuth2 userinfo helper on `/api/me`).
- Analytics are deterministic on backend, reducing hallucination risk in LLM responses.
- Chat remains simple but grounded using structured context injection.

## Trade-offs

- Chosen: explicit confirmation guards for create/update/delete to reduce accidental writes.
- Not yet included: attendee-level constraint solving, Gmail API draft creation.
- Chosen: cookie-session for velocity; more robust production setup would use stronger secret management, observability, and rotating credentials.

## Business Impact

- Reduces scheduling overhead and context switching.
- Gives immediate visibility into meeting load and overload patterns.
- Speeds communication by drafting schedule-aware messages.
- Creates foundation for higher-value automation (auto-scheduling and outbound comms).

## Next Steps

- Add Gmail draft creation endpoint and approval UX.
- Add multi-attendee availability reasoning and ranking.
- Add persistent user memory/preferences (focus blocks, meeting rules).
- Add tests (unit tests for analytics/suggestion logic + API integration tests).

