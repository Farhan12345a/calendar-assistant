import { Router } from "express";
import {
  calculateMeetingAnalytics,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  optimizeWeekSchedule,
  suggestMeetingOpenings,
  updateCalendarEvent,
} from "../calendarService";
import { getOAuth2ClientForSession } from "../oauthClient";

//Calendar API — read, analyze, recommend, optimize, CRUD
//Routes: /api/calendar/events, /api/calendar/analytics, /api/calendar/recommendations, /api/calendar/optimize, /api/calendar/events/:eventId, /api/calendar/events


export const calendarRouter = Router();

function isInsufficientScopesError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("insufficient authentication scopes") || msg.includes("insufficientpermissions");
}

function isValidIsoDateString(value: string): boolean {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

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
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "calendar_fetch_failed" });
  }
});

calendarRouter.get("/analytics", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const now = new Date();
  const timeMin = req.query.timeMin ? new Date(String(req.query.timeMin)) : now;
  const timeMax = req.query.timeMax
    ? new Date(String(req.query.timeMax))
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime()) || timeMax <= timeMin) {
    res.status(400).json({ error: "invalid_date_range" });
    return;
  }

  try {
    const items = await fetchCalendarEvents(oauth, { timeMin, timeMax });
    const analytics = calculateMeetingAnalytics(items);
    res.json({
      ...analytics,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });
  } catch (e) {
    console.error(e);
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "analytics_fetch_failed" });
  }
});

calendarRouter.get("/recommendations", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const now = new Date();
  const timeMin = req.query.timeMin ? new Date(String(req.query.timeMin)) : now;
  const days = Math.min(21, Math.max(1, Number(req.query.days) || 7));
  const durationMinutes = Math.min(180, Math.max(15, Number(req.query.durationMinutes) || 30));
  const maxSlots = Math.min(10, Math.max(1, Number(req.query.maxSlots) || 5));
  const timeMax = new Date(timeMin.getTime() + days * 24 * 60 * 60 * 1000);

  if (Number.isNaN(timeMin.getTime())) {
    res.status(400).json({ error: "invalid_time_min" });
    return;
  }

  try {
    const items = await fetchCalendarEvents(oauth, { timeMin, timeMax });
    const slots = suggestMeetingOpenings(items, {
      timeMin,
      timeMax,
      durationMinutes,
      maxSlots,
    });
    res.json({
      durationMinutes,
      suggestions: slots,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });
  } catch (e) {
    console.error(e);
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "recommendations_fetch_failed" });
  }
});

calendarRouter.get("/optimize", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  const now = new Date();
  const timeMin = req.query.timeMin ? new Date(String(req.query.timeMin)) : now;
  const timeMax = req.query.timeMax
    ? new Date(String(req.query.timeMax))
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime()) || timeMax <= timeMin) {
    res.status(400).json({ error: "invalid_date_range" });
    return;
  }
  try {
    const items = await fetchCalendarEvents(oauth, { timeMin, timeMax });
    const result = optimizeWeekSchedule(items, { timeMin, timeMax });
    res.json(result);
  } catch (e) {
    console.error(e);
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "optimization_fetch_failed" });
  }
});

calendarRouter.post("/events", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const summary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
  const start = typeof req.body?.start === "string" ? req.body.start : "";
  const end = typeof req.body?.end === "string" ? req.body.end : "";
  const description = typeof req.body?.description === "string" ? req.body.description : undefined;
  const location = typeof req.body?.location === "string" ? req.body.location : undefined;
  const timeZone = typeof req.body?.timeZone === "string" ? req.body.timeZone : undefined;
  const attendees = Array.isArray(req.body?.attendees)
    ? req.body.attendees.filter((item: unknown) => typeof item === "string")
    : undefined;

  if (!summary || !start || !end) {
    res.status(400).json({ error: "summary_start_end_required" });
    return;
  }

  if (!isValidIsoDateString(start) || !isValidIsoDateString(end)) {
    res.status(400).json({ error: "invalid_datetime" });
    return;
  }

  if (Date.parse(end) <= Date.parse(start)) {
    res.status(400).json({ error: "end_must_be_after_start" });
    return;
  }

  try {
    const created = await createCalendarEvent(oauth, {
      summary,
      start,
      end,
      attendees,
      description,
      location,
      timeZone,
    });
    res.status(201).json({
      id: created.id ?? "",
      summary: created.summary ?? summary,
      htmlLink: created.htmlLink ?? undefined,
      start: created.start?.dateTime ?? start,
      end: created.end?.dateTime ?? end,
      attendees: created.attendees?.map((a) => a.email).filter(Boolean) ?? [],
    });
  } catch (e) {
    console.error(e);
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "calendar_create_failed" });
  }
});

calendarRouter.patch("/events/:eventId", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  const eventId = String(req.params.eventId ?? "").trim();
  if (!eventId) {
    res.status(400).json({ error: "event_id_required" });
    return;
  }

  const summary = typeof req.body?.summary === "string" ? req.body.summary.trim() : undefined;
  const start = typeof req.body?.start === "string" ? req.body.start : undefined;
  const end = typeof req.body?.end === "string" ? req.body.end : undefined;
  const description = typeof req.body?.description === "string" ? req.body.description : undefined;
  const location = typeof req.body?.location === "string" ? req.body.location : undefined;
  const timeZone = typeof req.body?.timeZone === "string" ? req.body.timeZone : undefined;
  const attendees = Array.isArray(req.body?.attendees)
    ? req.body.attendees.filter((item: unknown): item is string => typeof item === "string")
    : undefined;

  if (!summary && !start && !end && !description && !location && !attendees) {
    res.status(400).json({ error: "no_update_fields" });
    return;
  }
  if (start && !isValidIsoDateString(start)) {
    res.status(400).json({ error: "invalid_start" });
    return;
  }
  if (end && !isValidIsoDateString(end)) {
    res.status(400).json({ error: "invalid_end" });
    return;
  }
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    res.status(400).json({ error: "end_must_be_after_start" });
    return;
  }

  try {
    const updated = await updateCalendarEvent(oauth, {
      eventId,
      summary,
      start,
      end,
      attendees,
      description,
      location,
      timeZone,
    });
    res.json({
      id: updated.id ?? eventId,
      summary: updated.summary ?? "(no title)",
      htmlLink: updated.htmlLink ?? undefined,
      start: updated.start?.dateTime ?? updated.start?.date ?? "",
      end: updated.end?.dateTime ?? updated.end?.date ?? "",
      attendees:
        updated.attendees
          ?.map((a: { email?: string | null }) => a.email)
          .filter((email): email is string => typeof email === "string" && email.length > 0) ?? [],
    });
  } catch (e) {
    console.error(e);
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "calendar_update_failed" });
  }
});

calendarRouter.delete("/events/:eventId", async (req, res) => {
  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  const eventId = String(req.params.eventId ?? "").trim();
  if (!eventId) {
    res.status(400).json({ error: "event_id_required" });
    return;
  }
  try {
    await deleteCalendarEvent(oauth, eventId);
    res.json({ ok: true as const, eventId });
  } catch (e) {
    console.error(e);
    if (isInsufficientScopesError(e)) {
      res.status(403).json({ error: "insufficient_scopes", action: "reauth_required" });
      return;
    }
    res.status(502).json({ error: "calendar_delete_failed" });
  }
});
