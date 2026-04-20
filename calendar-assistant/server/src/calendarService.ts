import "dotenv/config";
import { google } from "googleapis";

type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export async function fetchCalendarEvents(
  auth: GoogleOAuth2Client,
  options: { timeMin: Date; timeMax: Date },
) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: options.timeMin.toISOString(),
    timeMax: options.timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });
  return res.data.items ?? [];
}

export function formatEventsForPrompt(
  events: Awaited<ReturnType<typeof fetchCalendarEvents>>,
  timeZone: string,
): string {
  if (events.length === 0) {
    return "(No events in this range.)";
  }
  const lines: string[] = [];
  for (const ev of events) {
    const summary = ev.summary ?? "(no title)";
    const start = ev.start?.dateTime ?? ev.start?.date;
    const end = ev.end?.dateTime ?? ev.end?.date;
    if (!start) continue;
    const startLabel = formatDateLabel(start, timeZone);
    const endLabel = end ? formatDateLabel(end, timeZone) : "";
    lines.push(
      endLabel
        ? `- ${summary}: ${startLabel} → ${endLabel}`
        : `- ${summary}: ${startLabel}`,
    );
  }
  return lines.join("\n");
}

function formatDateLabel(iso: string, timeZone: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(d);
  } catch {
    return iso;
  }
}
