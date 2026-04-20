import { Router } from "express";
import { fetchCalendarEvents } from "../calendarService.js";
import { getOAuth2ClientForSession } from "../oauthClient.js";

export const calendarRouter = Router();

calendarRouter.get("/events", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const now = new Date();
  let timeMin = req.query.timeMin
    ? new Date(String(req.query.timeMin))
    : now;
  let timeMax = req.query.timeMax
    ? new Date(String(req.query.timeMax))
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime())) {
    res.status(400).json({ error: "invalid_date_range" });
    return;
  }

  if (timeMax <= timeMin) {
    timeMax = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000);
  }

  try {
    const items = await fetchCalendarEvents(oauth, { timeMin, timeMax });
    const events = items.map((ev) => ({
      id: ev.id ?? "",
      summary: ev.summary ?? "(no title)",
      start: ev.start?.dateTime ?? ev.start?.date ?? "",
      end: ev.end?.dateTime ?? ev.end?.date ?? "",
      htmlLink: ev.htmlLink ?? undefined,
    }));
    res.json({ events, timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "calendar_fetch_failed" });
  }
});
