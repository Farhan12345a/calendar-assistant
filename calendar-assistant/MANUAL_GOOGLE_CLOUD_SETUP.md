# Manual setup (not automated in code)

The app implements OAuth and the Calendar API in code, but **you** must complete the following in Google Cloud and in your environment. This cannot be done from the repository alone.

## 1. Google Cloud Console

1. Create or select a **Google Cloud project**.
2. Enable the **Google Calendar API** for that project.
3. Configure the **OAuth consent screen** (app name, scopes, test users if the app is in *Testing*).
4. Create an **OAuth 2.0 Client ID** of type **Web application** with:
   - **Authorized JavaScript origins:** `http://localhost:5173` (your Vite dev URL).
   - **Authorized redirect URIs:** must match **exactly** what the server uses, e.g.  
     `http://localhost:3000/auth/google/callback`  
     (same host/port/path as `OAUTH_REDIRECT_URI` in `server/.env`).

## 2. OpenAI

1. Create an API key in the [OpenAI platform](https://platform.openai.com/).
2. Set `OPENAI_API_KEY` in `server/.env` (see `.env.example`).

## 3. Local environment

Copy `server/.env.example` to `server/.env` and fill in:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`
- `SESSION_SECRET` (long random string)
- `OPENAI_API_KEY`
- Optional: `OPENAI_MODEL`, `DEFAULT_TIME_ZONE`, `PORT`, `CLIENT_ORIGIN`

After that, run `npm run dev` in `server/` and `client/` as usual.
