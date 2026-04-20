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
- Chat-assisted event creation/update/delete with explicit confirmation phrases:
  - `confirm create meeting`
  - `confirm update meeting`
  - `confirm delete meeting`

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Auth + calendar: Google OAuth2 + Google Calendar API
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
cd calendar-assistant

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
3. Ask chat:
   - "How much of my time am I spending in meetings this week?"
   - "Draft a concise email to schedule a 30-minute meeting next week; I prefer afternoons."
   - "Update the existing meeting titled 'Planning Day' on 2026-05-02 and ask me to confirm."
   - "Delete the event titled 'Planning Day' on 2026-05-02 and ask me to confirm."
4. Verify answers reflect your real calendar context.

## API Endpoints (Backend)

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /api/me`
- `POST /api/logout`
- `GET /api/calendar/events`
- `GET /api/calendar/analytics`
- `GET /api/calendar/recommendations`
- `POST /api/calendar/events`
- `PATCH /api/calendar/events/:eventId`
- `DELETE /api/calendar/events/:eventId`
- `POST /api/chat`

## Demo Script (6-8 Minutes)

### 1) Problem framing (45s)

"This app helps a user understand and act on their schedule quickly: see upcoming commitments, quantify meeting load, and generate context-aware drafts."

### 2) Auth + trust (1 min)

- Show Google connect flow.
- Highlight that only needed scopes are requested and calendar is pulled from the authenticated account.

### 3) Calendar visibility (1 min)

- Show grouped weekly events and refresh behavior.
- Explain this gives immediate schedule awareness.

### 4) Analytics + recommendations (1.5 min)

- Show meeting-hour metric and heavy days.
- Show suggested 30-minute openings and explain the logic (weekday work-hour free slots).

### 5) Agent interaction (2 min)

Use prompts like:

- "I have three meetings to schedule next week and want mornings blocked. Draft a short email I can send."
- "How much of my time is in meetings next week, and how can I reduce it?"

For write action demo:

- Ask: "Schedule Racecar Meeting with Ryan Anderson on April 22, 2026 from 5:30 PM to 6:30 PM, then ask me for confirmation."
- Then reply: "confirm create meeting"
- Assistant should create the event and provide confirmation/link.

For update action demo:

- Ask: "Update the existing meeting titled Planning Day on 2026-05-02 to Planning Day / Doug Sync, then ask me to confirm."
- Then reply: "confirm update meeting"
- Assistant should update the event and return event id/link details.

For delete action demo:

- Ask: "Delete the event titled Planning Day on 2026-05-02, then ask me to confirm."
- Then reply: "confirm delete meeting"
- Assistant should delete the matching event and confirm deletion.

Explain that the model receives both raw upcoming events and computed analytics context.

### 6) Close with trade-offs + next steps (1.5 min)

- Current strength: clear end-to-end product loop (connect -> understand -> act).
- Current trade-off: write actions are guarded by explicit confirmation phrases for safety, which adds one extra step.
- Next: Gmail draft API integration, multi-attendee availability search, and richer analytics.

## Why This Design

- Fast-to-evaluate architecture: split frontend and backend keeps responsibilities clear.
- OAuth + session pattern is simple and practical for a take-home.
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

