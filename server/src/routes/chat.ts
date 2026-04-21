import { Router } from "express";
import OpenAI from "openai";
import {
  calculateMeetingAnalytics,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  formatEventsForPrompt,
  updateCalendarEvent,
} from "../calendarService";
import { getOAuth2ClientForSession } from "../oauthClient";
//flagship for “LLM + tools + safety.”
//Routes: /api/chat, /api/calendar/events, /api/calendar/analytics, /api/calendar/recommendations, /api/calendar/optimize, /api/calendar/events/:eventId, /api/calendar/events
const router = Router();

const MAX_USER_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12000;

type ChatMessage = { role: "user" | "assistant"; content: string };
//CreateCalendarEventArgs: Input type for creating a new event
type CreateCalendarEventArgs = {
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
  timeZone?: string;
};

//UpdateCalendarEventArgs: Input type for updating an existing event
type UpdateCalendarEventArgs = {
  eventId?: string;
  currentSummary?: string;
  date?: string;
  time?: string;
  summary?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  description?: string;
  location?: string;
  timeZone?: string;
};

//DeleteCalendarEventArgs: Input type for deleting an existing event
type DeleteCalendarEventArgs = {
  eventId?: string;
  summary?: string;
  date?: string;
};

//parseCreateEventArgs: Parse create event arguments from raw string
function parseCreateEventArgs(raw: string): CreateCalendarEventArgs | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CreateCalendarEventArgs>;
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.start !== "string" ||
      typeof parsed.end !== "string"
    ) {
      return null;
    }
    const result: CreateCalendarEventArgs = {
      summary: parsed.summary,
      start: parsed.start,
      end: parsed.end,
    };
    if (Array.isArray(parsed.attendees)) {
      result.attendees = parsed.attendees.filter(
        (email): email is string => typeof email === "string",
      );
    }
    if (typeof parsed.description === "string") result.description = parsed.description;
    if (typeof parsed.location === "string") result.location = parsed.location;
    if (typeof parsed.timeZone === "string") result.timeZone = parsed.timeZone;
    return result;
  } catch {
    return null;
  }
}

//hasExplicitCreateConfirmation: Check if the user has explicitly confirmed the create event
function hasExplicitCreateConfirmation(messages: ChatMessage[]): boolean {
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser) return false;
  return latestUser.content.toLowerCase().includes("confirm create meeting");
}

//hasExplicitUpdateConfirmation: Check if the user has explicitly confirmed the update event
function hasExplicitUpdateConfirmation(messages: ChatMessage[]): boolean {
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser) return false;
  return latestUser.content.toLowerCase().includes("confirm update meeting");
}

//hasExplicitDeleteConfirmation: Check if the user has explicitly confirmed the delete event
function hasExplicitDeleteConfirmation(messages: ChatMessage[]): boolean {
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser) return false;
  return latestUser.content.toLowerCase().includes("confirm delete meeting");
}

//isValidDateRange: Check if the date range is valid
function isValidDateRange(start: string, end: string): boolean {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return endMs > startMs;
}

//parseUpdateEventArgs: Parse update event arguments from raw string
function parseUpdateEventArgs(raw: string): UpdateCalendarEventArgs | null {
  try {
    const parsed = JSON.parse(raw) as Partial<UpdateCalendarEventArgs>;
    const eventId = typeof parsed.eventId === "string" ? parsed.eventId.trim() : undefined;
    const currentSummary =
      typeof parsed.currentSummary === "string" ? parsed.currentSummary.trim() : undefined;
    const date = typeof parsed.date === "string" ? parsed.date.trim() : undefined;
    const time = typeof parsed.time === "string" ? parsed.time.trim() : undefined;
    if (!eventId && !currentSummary) return null;
    const result: UpdateCalendarEventArgs = {
      ...(eventId ? { eventId } : {}),
      ...(currentSummary ? { currentSummary } : {}),
      ...(date ? { date } : {}),
      ...(time ? { time } : {}),
    };
    if (typeof parsed.summary === "string") result.summary = parsed.summary;
    if (typeof parsed.start === "string") result.start = parsed.start;
    if (typeof parsed.end === "string") result.end = parsed.end;
    if (Array.isArray(parsed.attendees)) {
      result.attendees = parsed.attendees.filter(
        (email): email is string => typeof email === "string",
      );
    }
    if (typeof parsed.description === "string") result.description = parsed.description;
    if (typeof parsed.location === "string") result.location = parsed.location;
    if (typeof parsed.timeZone === "string") result.timeZone = parsed.timeZone;
    return result;
  } catch {
    return null;
  }
}

//parseDeleteEventArgs: Parse delete event arguments from raw string
function parseDeleteEventArgs(raw: string): DeleteCalendarEventArgs | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DeleteCalendarEventArgs>;
    const eventId = typeof parsed.eventId === "string" ? parsed.eventId.trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : undefined;
    const date = typeof parsed.date === "string" ? parsed.date.trim() : undefined;
    if (!eventId && !summary) return null;
    return {
      ...(eventId ? { eventId } : {}),
      ...(summary ? { summary } : {}),
      ...(date ? { date } : {}),
    };
  } catch {
    return null;
  }
}

//normalizeErrorMessage: Normalize error message
function normalizeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "unknown_error";
  const msg = err.message || "unknown_error";
  if (msg.includes("<!DOCTYPE html>")) {
    return "Google Calendar request failed (likely invalid event target).";
  }
  return msg;
}

//parseTimeToMinutes: Parse time to minutes
function parseTimeToMinutes(value: string): number | null {
  const v = value.trim().toLowerCase();
  const match = v.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = Number(match[2]);
  if (mins < 0 || mins > 59 || hours < 0 || hours > 23) return null;
  const meridiem = match[3];
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }
  return hours * 60 + mins;
}

//resolveEventIdForDelete: Resolve event id for delete
async function resolveEventIdForDelete(
  oauth: any,
  args: DeleteCalendarEventArgs,
  timeZone: string,
): Promise<{ eventId: string; summary?: string } | null> {
  if (args.eventId) {
    return {
      eventId: args.eventId,
      ...(args.summary ? { summary: args.summary } : {}),
    };
  }
  if (!args.summary) return null;

  const now = new Date();
  let timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  if (args.date) {
    const day = new Date(args.date);
    if (!Number.isNaN(day.getTime())) {
      // Widen range to avoid timezone boundary misses.
      day.setHours(0, 0, 0, 0);
      timeMin = new Date(day);
      timeMin.setDate(timeMin.getDate() - 2);
      timeMax = new Date(day);
      timeMax.setDate(timeMax.getDate() + 3);
    }
  }

  const events = await fetchCalendarEvents(oauth, { timeMin, timeMax });
  const normalizedSummary = args.summary.toLowerCase().replace(/\s+/g, " ").trim();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const formatDateInTz = (value: string): string | null => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = formatter.formatToParts(d);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  };

  const candidates = events.filter((ev) => {
    const s = (ev.summary ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!s) return false;
    const summaryMatches =
      s === normalizedSummary ||
      s.includes(normalizedSummary) ||
      normalizedSummary.includes(s);
    if (!summaryMatches) return false;
    if (!args.date) return true;

    // All-day events expose yyyy-mm-dd directly.
    if (ev.start?.date && ev.start.date === args.date) return true;

    const startDateTime = ev.start?.dateTime ?? "";
    if (!startDateTime) return false;
    const localDate = formatDateInTz(startDateTime);
    return localDate === args.date;
  });

  const match = candidates[0];
  if (!match?.id) return null;
  return { eventId: match.id, summary: match.summary ?? args.summary };
}

//resolveEventIdForUpdate: Resolve event id for update
async function resolveEventIdForUpdate(
  oauth: any,
  args: UpdateCalendarEventArgs,
  timeZone: string,
): Promise<{ eventId: string; summary?: string } | null> {
  if (args.eventId) {
    return {
      eventId: args.eventId,
      ...(args.currentSummary ? { summary: args.currentSummary } : {}),
    };
  }
  if (!args.currentSummary) return null;

  const now = new Date();
  let timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  if (args.date) {
    const day = new Date(args.date);
    if (!Number.isNaN(day.getTime())) {
      day.setHours(0, 0, 0, 0);
      timeMin = new Date(day);
      timeMin.setDate(timeMin.getDate() - 2);
      timeMax = new Date(day);
      timeMax.setDate(timeMax.getDate() + 3);
    }
  }

  const events = await fetchCalendarEvents(oauth, { timeMin, timeMax });
  const normalizedSummary = args.currentSummary.toLowerCase().replace(/\s+/g, " ").trim();
  const targetMinutes = args.time ? parseTimeToMinutes(args.time) : null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const formatLocalDate = (value: string): string | null => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = formatter.formatToParts(d);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  };
  const formatLocalMinutes = (value: string): number | null => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = formatter.formatToParts(d);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };

  const candidates = events.filter((ev) => {
    const s = (ev.summary ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!s) return false;
    const summaryMatches =
      s === normalizedSummary ||
      s.includes(normalizedSummary) ||
      normalizedSummary.includes(s);
    if (!summaryMatches) return false;

    if (args.date) {
      if (ev.start?.date && ev.start.date !== args.date) return false;
      if (ev.start?.dateTime) {
        const localDate = formatLocalDate(ev.start.dateTime);
        if (localDate !== args.date) return false;
      }
    }

    if (targetMinutes !== null && ev.start?.dateTime) {
      const localMinutes = formatLocalMinutes(ev.start.dateTime);
      if (localMinutes === null) return false;
      if (Math.abs(localMinutes - targetMinutes) > 90) return false;
    }
    return true;
  });

  const match = candidates[0];
  if (!match?.id) return null;
  return { eventId: match.id, summary: match.summary ?? args.currentSummary };
}

//ToolExecutionResult: Result type for tool execution
type ToolExecutionResult =
  | {
      ok: true;
      action: "create" | "update" | "delete";
      eventId?: string;
      summary: string;
      start?: string;
      end?: string;
      htmlLink?: string | null;
    }
  | {
      ok: false;
      action: "create" | "update" | "delete";
      error: string;
      message?: string;
    };

router.post("/chat", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "openai_not_configured" });
    return;
  }

  const oauth = getOAuth2ClientForSession(req.session?.refreshToken);
  if (!oauth) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const rawMessages = req.body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    res.status(400).json({ error: "messages_required" });
    return;
  }

  const messages: ChatMessage[] = [];
  for (const m of rawMessages) {
    if (messages.length >= MAX_USER_MESSAGES) break;
    if (
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
    ) {
      const text = m.content.slice(0, MAX_MESSAGE_CHARS);
      messages.push({ role: m.role, content: text });
    }
  }

  if (messages.length === 0) {
    res.status(400).json({ error: "no_valid_messages" });
    return;
  }

  const timeZone =
    typeof req.body?.timeZone === "string" && req.body.timeZone.length < 80
      ? req.body.timeZone
      : process.env.DEFAULT_TIME_ZONE ?? "UTC";

  const rangeDays = Number(req.body?.contextDays) || 14;
  const safeDays = Math.min(31, Math.max(1, rangeDays));
  const now = new Date();
  const timeMax = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);

  let calendarBlock = "";
  let analyticsBlock = "";
  try {
    const items = await fetchCalendarEvents(oauth, { timeMin: now, timeMax });
    calendarBlock = formatEventsForPrompt(items, timeZone);
    const analytics = calculateMeetingAnalytics(items);
    analyticsBlock = [
      `- Total timed meetings: ${analytics.totalMeetings}`,
      `- Total timed meeting hours: ${analytics.totalMeetingHours}`,
      `- Busiest days: ${
        analytics.meetingHeavyDays.length === 0
          ? "(none)"
          : analytics.meetingHeavyDays
              .slice(0, 3)
              .map((d) => `${d.day} (${d.hours}h, ${d.count} meetings)`)
              .join(", ")
      }`,
    ].join("\n");
  } catch (e) {
    console.error(e);
    calendarBlock = "(Could not load calendar events for this answer.)";
    analyticsBlock = "(Could not load meeting analytics for this answer.)";
  }

  const systemPrompt = [
    "You are a helpful calendar assistant. The user connected their Google Calendar.",
    `Their timezone for interpretation is: ${timeZone}.`,
    `Below is their calendar for roughly the next ${safeDays} days (from now).`,
    "If you suggest times or drafts, be concrete. If data is missing, say so and ask a clarifying question.",
    "Do not invent meetings that are not listed unless the user explicitly asks for hypothetical scheduling.",
    "",
    "Calendar context:",
    calendarBlock,
    "",
    "Computed analytics context:",
    analyticsBlock,
  ].join("\n");

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "create_calendar_event",
          description:
            "Create a Google Calendar event on the user's primary calendar. Use only when the user explicitly confirms with phrase 'confirm create meeting'.",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string" },
              start: {
                type: "string",
                description: "Start datetime in ISO 8601 format, e.g. 2026-04-22T17:30:00-04:00",
              },
              end: {
                type: "string",
                description: "End datetime in ISO 8601 format, e.g. 2026-04-22T18:30:00-04:00",
              },
              attendees: {
                type: "array",
                items: { type: "string" },
                description: "Email addresses",
              },
              description: { type: "string" },
              location: { type: "string" },
              timeZone: { type: "string" },
            },
            required: ["summary", "start", "end"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_calendar_event",
          description:
            "Update an existing Google Calendar event. Use only when the user explicitly confirms with phrase 'confirm update meeting'.",
          parameters: {
            type: "object",
            properties: {
              eventId: { type: "string" },
              currentSummary: {
                type: "string",
                description: "Existing event title to locate when eventId is unknown",
              },
              date: {
                type: "string",
                description: "Existing event date in YYYY-MM-DD when locating by title/date",
              },
              time: {
                type: "string",
                description: "Approx existing start time like 3:30pm when locating by title/date",
              },
              summary: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              attendees: {
                type: "array",
                items: { type: "string" },
              },
              description: { type: "string" },
              location: { type: "string" },
              timeZone: { type: "string" },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "delete_calendar_event",
          description:
            "Delete an existing Google Calendar event. Prefer eventId when available. If eventId is unknown, provide summary and date (YYYY-MM-DD). Use only when the user explicitly confirms with phrase 'confirm delete meeting'.",
          parameters: {
            type: "object",
            properties: {
              eventId: { type: "string" },
              summary: { type: "string" },
              date: {
                type: "string",
                description: "Event date in YYYY-MM-DD format when deleting by title/date",
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
      },
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      tools,
      max_tokens: 2048,
    });
    const assistantMessage = completion.choices[0]?.message;
    const toolCalls = assistantMessage?.tool_calls ?? [];

    if (assistantMessage && toolCalls.length > 0) {
      const executionResults: ToolExecutionResult[] = [];
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        if (call.function.name === "create_calendar_event") {
          if (!hasExplicitCreateConfirmation(messages)) {
            executionResults.push({
              ok: false,
              action: "create",
              error: "confirmation_required",
              message:
                "Creation blocked. Ask user to reply with exact phrase: 'confirm create meeting'.",
            });
            continue;
          }
          const args = parseCreateEventArgs(call.function.arguments);
          if (!args) {
            executionResults.push({ ok: false, action: "create", error: "invalid_tool_arguments" });
            continue;
          }
          if (!isValidDateRange(args.start, args.end)) {
            executionResults.push({
              ok: false,
              action: "create",
              error: "invalid_date_range",
              message: "End must be after start and both must be valid datetimes.",
            });
            continue;
          }
          try {
            const created = await createCalendarEvent(oauth, args);
            const createdResult: ToolExecutionResult = {
              ok: true,
              action: "create",
              summary: created.summary ?? args.summary,
              start: created.start?.dateTime ?? args.start,
              end: created.end?.dateTime ?? args.end,
              htmlLink: created.htmlLink ?? null,
              ...(created.id ? { eventId: created.id } : {}),
            };
            executionResults.push(createdResult);
          } catch (toolErr) {
            console.error(toolErr);
            const msg = normalizeErrorMessage(toolErr);
            executionResults.push({
              ok: false,
              action: "create",
              error: "calendar_create_failed",
              message: msg,
            });
          }
          continue;
        }

        if (call.function.name === "update_calendar_event") {
          if (!hasExplicitUpdateConfirmation(messages)) {
            executionResults.push({
              ok: false,
              action: "update",
              error: "confirmation_required",
              message:
                "Update blocked. Ask user to reply with exact phrase: 'confirm update meeting'.",
            });
            continue;
          }
          const args = parseUpdateEventArgs(call.function.arguments);
          if (!args) {
            executionResults.push({ ok: false, action: "update", error: "invalid_tool_arguments" });
            continue;
          }
          const resolved = await resolveEventIdForUpdate(oauth, args, timeZone);
          if (!resolved?.eventId) {
            executionResults.push({
              ok: false,
              action: "update",
              error: "event_not_found",
              message:
                "Could not find matching event to update. Provide exact eventId or exact current title with date (YYYY-MM-DD).",
            });
            continue;
          }
          if (args.start && args.end && !isValidDateRange(args.start, args.end)) {
            executionResults.push({
              ok: false,
              action: "update",
              error: "invalid_date_range",
              message: "End must be after start and both must be valid datetimes.",
            });
            continue;
          }
          try {
            const updated = await updateCalendarEvent(oauth, {
              ...args,
              eventId: resolved.eventId,
            });
            const updatedStart =
              updated.start?.dateTime ?? updated.start?.date ?? undefined;
            const updatedEnd =
              updated.end?.dateTime ?? updated.end?.date ?? undefined;
            const updatedResult: ToolExecutionResult = {
              ok: true,
              action: "update",
              summary: updated.summary ?? "(no title)",
              ...(updated.id || args.eventId ? { eventId: updated.id ?? args.eventId } : {}),
              ...(updatedStart ? { start: updatedStart } : {}),
              ...(updatedEnd ? { end: updatedEnd } : {}),
              htmlLink: updated.htmlLink ?? null,
            };
            executionResults.push(updatedResult);
          } catch (toolErr) {
            console.error(toolErr);
            const msg = normalizeErrorMessage(toolErr);
            executionResults.push({
              ok: false,
              action: "update",
              error: "calendar_update_failed",
              message: msg,
            });
          }
          continue;
        }

        if (call.function.name === "delete_calendar_event") {
          if (!hasExplicitDeleteConfirmation(messages)) {
            executionResults.push({
              ok: false,
              action: "delete",
              error: "confirmation_required",
              message:
                "Deletion blocked. Ask user to reply with exact phrase: 'confirm delete meeting'.",
            });
            continue;
          }
          const args = parseDeleteEventArgs(call.function.arguments);
          if (!args) {
            executionResults.push({ ok: false, action: "delete", error: "invalid_tool_arguments" });
            continue;
          }
          try {
            const resolved = await resolveEventIdForDelete(oauth, args, timeZone);
            if (!resolved?.eventId) {
              executionResults.push({
                ok: false,
                action: "delete",
                error: "event_not_found",
                message:
                  "Could not find a matching event to delete. Provide exact eventId or exact title with date (YYYY-MM-DD).",
              });
              continue;
            }
            await deleteCalendarEvent(oauth, resolved.eventId);
            executionResults.push({
              ok: true,
              action: "delete",
              eventId: resolved.eventId,
              summary: `Deleted event${resolved.summary ? `: ${resolved.summary}` : ""}`,
            });
          } catch (toolErr) {
            console.error(toolErr);
            const msg = normalizeErrorMessage(toolErr);
            executionResults.push({
              ok: false,
              action: "delete",
              error: "calendar_delete_failed",
              message: msg,
            });
          }
        }
      }

      const successful = executionResults.filter((r) => r.ok);
      if (successful.length > 0) {
        const lines: string[] = ["Calendar action result(s):"];
        for (const result of successful) {
          if (result.action === "delete") {
            lines.push(`- Deleted event id: ${result.eventId ?? "(unknown)"}`);
          } else {
            lines.push(
              `- ${result.action === "create" ? "Created" : "Updated"}: ${result.summary}${result.start && result.end ? ` (${result.start} to ${result.end})` : ""}`,
            );
            if (result.eventId) {
              lines.push(`  Event ID: ${result.eventId}`);
            }
            if (result.htmlLink) {
              lines.push(`  Link: ${result.htmlLink}`);
            }
          }
        }
        const failed = executionResults.filter((r) => !r.ok);
        if (failed.length > 0) {
          lines.push(
            `Note: ${failed.length} event request(s) failed.`,
          );
        }
        res.json({ reply: lines.join("\n") });
        return;
      }

      const confirmationBlocked = executionResults.find(
        (r) => !r.ok && r.error === "confirmation_required",
      );
      if (confirmationBlocked) {
        const actionHint =
          confirmationBlocked.action === "create"
            ? "confirm create meeting"
            : confirmationBlocked.action === "update"
              ? "confirm update meeting"
              : "confirm delete meeting";
        res.json({
          reply: `I can proceed, but I need explicit confirmation first. Reply exactly: ${actionHint}`,
        });
        return;
      }

      const firstError = executionResults.find((r) => !r.ok);
      if (firstError) {
        const actionLabel =
          firstError.action === "create"
            ? "create"
            : firstError.action === "update"
              ? "update"
              : "delete";
        res.json({
          reply: `I could not ${actionLabel} the event: ${firstError.message ?? firstError.error}`,
        });
        return;
      }

      res.json({
        reply:
          "I prepared the scheduling action but couldn't execute it. Please restate the request with concrete title, start, and end time.",
      });
      return;
    }

    const text = assistantMessage?.content ?? "";
    res.json({ reply: text });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "openai_failed" });
  }
});

export const chatRouter = router;
