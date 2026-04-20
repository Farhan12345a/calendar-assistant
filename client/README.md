# Calendar Assistant (Client)

React + Vite frontend for the Calendar Assistant take-home.

## What it does

- Authenticates the user with Google OAuth (via backend redirects).
- Displays the next 7 days of calendar events.
- Shows lightweight meeting analytics:
  - total timed meeting hours in the next 7 days
  - top meeting-heavy days
- Shows suggested 30-minute meeting openings from backend recommendations.
- Provides a chat UI that sends conversation context to the backend calendar-aware assistant.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the frontend:

```bash
npm run dev
```

By default this runs on `http://localhost:5173`.

## Backend dependency

This frontend expects the server to be running and exposing:

- `GET /api/me`
- `GET /api/calendar/events`
- `GET /api/calendar/analytics`
- `GET /api/calendar/recommendations`
- `POST /api/chat`
- `POST /api/logout`
- `GET /auth/google`

## Build

```bash
npm run build
```
