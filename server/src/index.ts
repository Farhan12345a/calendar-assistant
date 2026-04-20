import "dotenv/config";
import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import { authRouter, sessionRouter } from "./routes/auth";
import { calendarRouter } from "./routes/calendar";
import { chatRouter } from "./routes/chat";

const app = express();
const port = Number(process.env.PORT) || 3000;
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn(
    "[calendar-assistant] SESSION_SECRET is not set. Using a dev-only default; set SESSION_SECRET in production.",
  );
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  }),
);

app.use(
  cookieSession({
    name: "cal_sess",
    keys: [sessionSecret ?? "dev-only-session-key-change-me"],
    maxAge: 60 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  }),
);

app.use(express.json({ limit: "512kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true as const });
});

app.use("/auth", authRouter);
app.use("/api", sessionRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api", chatRouter);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
