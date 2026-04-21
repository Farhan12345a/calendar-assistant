import rateLimit from "express-rate-limit";

/** OpenAI calls are the costliest; keep a sane ceiling per IP/session use. */
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 24,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "too_many_requests",
    message: "Too many chat requests from this client. Wait a minute and try again.",
  },
});

/** Calendar mutations hit Google quota; throttle bursts without blocking normal UI use. */
export const calendarWriteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "too_many_requests",
    message: "Too many calendar write requests. Slow down and try again shortly.",
  },
});

/** OAuth start redirects should not be hammered (abuse / accidental loops). */
export const oauthStartRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "too_many_requests",
    message: "Too many sign-in attempts. Try again in a few minutes.",
  },
});
