import { randomBytes } from "crypto";
import { Router } from "express";
import { google } from "googleapis";
import { oauthStartRateLimiter } from "../middleware/rateLimits";
import {
  createOAuth2Client,
  getOAuth2ClientForSession,
} from "../oauthClient";

const clientOrigin = () => process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export const authRouter = Router();

authRouter.get("/google", oauthStartRateLimiter, (req, res) => {
  try {
    const oauth2Client = createOAuth2Client();
    const state = randomBytes(32).toString("hex");
    req.session!.oauthState = state;
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      include_granted_scopes: true,
      state,
    });
    res.redirect(302, url);
  } catch {
    res.redirect(
      302,
      `${clientOrigin()}/?auth=error&reason=config`,
    );
  }
});

authRouter.get("/google/callback", async (req, res) => {
  const origin = clientOrigin();
  const code = req.query.code;
  const state = req.query.state;
  const err = req.query.error;

  if (err) {
    res.redirect(302, `${origin}/?auth=error&reason=${encodeURIComponent(String(err))}`);
    return;
  }

  if (typeof code !== "string" || typeof state !== "string") {
    res.redirect(302, `${origin}/?auth=error&reason=missing_code`);
    return;
  }

  if (!req.session || state !== req.session.oauthState) {
    res.redirect(302, `${origin}/?auth=error&reason=state`);
    return;
  }

  delete req.session.oauthState;

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (tokens.refresh_token && req.session) {
      req.session.refreshToken = tokens.refresh_token;
    } else if (!req.session?.refreshToken) {
      res.redirect(
        302,
        `${origin}/?auth=error&reason=no_refresh_token`,
      );
      return;
    }

    res.redirect(302, `${origin}/?auth=success`);
  } catch {
    res.redirect(302, `${origin}/?auth=error&reason=token_exchange`);
  }
});

export const sessionRouter = Router();

sessionRouter.get("/me", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.json({ authenticated: false as const });
    return;
  }
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const { data } = await oauth2.userinfo.get();
    res.json({
      authenticated: true as const,
      email: data.email ?? undefined,
      name: data.name ?? undefined,
      picture: data.picture ?? undefined,
    });
  } catch {
    res.status(401).json({ authenticated: false as const, error: "session_invalid" });
  }
});

sessionRouter.post("/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true as const });
});
