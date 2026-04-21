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
  - **`POST` / `PATCH` / `DELETE /api/calendar/events…`** — 45 writes / minute / IP (Google Calendar quota).
  - **`GET /auth/google`** — 40 starts / 15 minutes / IP (OAuth redirect abuse).

### What is intentionally *not* included (and why)

- **Redis (or DB)–backed rate limiting:** In-memory limits reset per process and treat all users behind one NAT as one bucket. For a single-user take-home and localhost demos, that is acceptable; production would use a **shared store** and often **user id** keys, not just IP.
- **ESLint on server TS:** Style rules are nice, but **TypeScript strict + `tsc --noEmit`** already catches most real bugs for this size of API without maintaining a second rule surface. The client keeps ESLint because React/hooks lint is high value there.
- **Full observability stack (OpenTelemetry, log aggregation, dashboards):** High setup cost for a take-home; `console.error` on failures is a minimal compromise.
- **Automatic retries with exponential backoff for every Google/OpenAI call:** Partially redundant with provider SDKs; adding a generic retry layer touches many code paths and is easy to get wrong (non-idempotent writes). Scoped retries could be a follow-up where reads are retried only.
- **Dedicated auth/session store, secret rotation, HSM, compliance packages:** Out of scope for a demo; README **Trade-offs** still calls out cookie-session as a velocity choice.

## AI-assisted development (speed + quality)

This repo was built and iterated with an **AI coding assistant** (e.g. Cursor) as a **force multiplier**—not as a substitute for running the app or reading diffs.

### Where AI sped things up

- **Boilerplate and wiring:** Express routers, env wiring, Vite proxy defaults, TypeScript types, and repetitive UI (forms, loading states) were drafted quickly so time went to **product behavior** (calendar context in chat, optimization heuristics, OAuth edge cases).
- **Refactors across files:** Moves like splitting Calendar API usage into `@googleapis/calendar` + `google-auth-library`, or aligning the Executive Assistant layout, touch many paths; AI helps apply consistent edits with less hunt-and-peck.
- **Docs and checklists:** README sections (setup, production notes, manual test list) were drafted and then **tightened** to match what the code actually does.

### How the output was verified

- **Compiler and builds:** `npm run lint` / `tsc --noEmit` on the server and `npm run build` on both sides before considering a change “done.”
- **Running locally:** Two processes (`server` + `client`), real Google OAuth, and exercise of **Optimize My Week**, quick actions, and chat (including confirmation phrases for writes).
- **Runtime signals:** Browser/network errors (e.g. proxy/port mismatch, `403` insufficient scopes) were used to **fix configuration and error messages**, not to paper over failures.

### How the output was refined

- **Human-in-the-loop:** Feature requests (custom blocks, button alignment, rate limits, README tone) came as **follow-up instructions**; the assistant’s first pass was reviewed and adjusted when it didn’t match intent or repo conventions.
- **Safety-sensitive paths:** Calendar **mutations from chat** stayed behind **explicit user confirmations** in code; AI suggestions were checked so nothing could auto-delete or auto-create without that guardrail.

**Bottom line:** AI shortened the **edit-compile-debug** loop and the **documentation** loop; **correctness** was still anchored in TypeScript, local runs, and manual checks against a real Google account.

## High-leverage extensions (“Wow” factor)

The baseline is “OAuth + show events + chat.” What moves the demo toward a **credible assistant** is a small set of **high-leverage** additions—each one multiplies usefulness without ballooning scope.

### 1) AI Executive Assistant Mode (beyond a chat box)

- **Optimize My Week** runs **deterministic** analysis on real calendar data (overload days, missing focus time, tight meeting spacing) and returns **actionable copy**, not a generic LLM essay.
- **Quick actions** (focus, workout, custom block) let the user **create holds** from that context with **explicit confirmation**—closing the loop from *insight → calendar change* in the same UI.

*Why it’s “wow”:* evaluators see something that feels like a **product surface**, not only an API + transcript.

### 2) Calendar-grounded chat with tools + hard safety rail

- The assistant is fed **structured calendar context** (upcoming events + analytics) so answers stay tied to the user’s actual week.
- **OpenAI tool calls** can propose create/update/delete, but the server only executes writes after **explicit confirmation phrases**—so the “magic” doesn’t come at the cost of **silent calendar corruption**.

*Why it’s high leverage:* one feature demonstrates **agentic UX** and **production-minded safety** together.

### 3) Analytics + openings (numbers the UI and the model agree on)

- Meeting hours, heavy days, and **suggested free slots** are computed **once** in `calendarService.ts` and reused for the dashboard and chat context—so the story stays **internally consistent**.

*Why it matters:* it shows systems thinking (shared domain layer) rather than duplicating logic for each surface.

### What we did *not* add as “wow”

- **Gimmicks** (animations, unrelated integrations) that don’t strengthen the scheduling narrative.
- **Fully autonomous scheduling**—intentionally avoided; the value here is **human-visible control** plus assistant acceleration.

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

