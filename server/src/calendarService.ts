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

export type CreateCalendarEventInput = {
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  timeZone?: string;
  location?: string;
};

export async function createCalendarEvent(
  auth: GoogleOAuth2Client,
  input: CreateCalendarEventInput,
) {
  const calendar = google.calendar({ version: "v3", auth });
  const requestBody: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
  } = {
    summary: input.summary,
    start: {
      dateTime: input.start,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
    end: {
      dateTime: input.end,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
  };

  if (input.description) requestBody.description = input.description;
  if (input.location) requestBody.location = input.location;
  if (input.attendees && input.attendees.length > 0) {
    requestBody.attendees = input.attendees.map((email) => ({ email }));
  }

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody,
    sendUpdates: "all",
  });
  return res.data;
}

export type UpdateCalendarEventInput = {
  eventId: string;
  summary?: string;
  start?: string;
  end?: string;
  attendees?: string[];
  description?: string;
  timeZone?: string;
  location?: string;
};

export async function updateCalendarEvent(
  auth: GoogleOAuth2Client,
  input: UpdateCalendarEventInput,
) {
  const calendar = google.calendar({ version: "v3", auth });
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId: input.eventId,
  });
  const current = existing.data;
  const requestBody: {
    summary: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string; timeZone?: string };
    end?: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: Array<{ email?: string }>;
  } = {
    summary: input.summary ?? current.summary ?? "(no title)",
  };

  const nextDescription = input.description ?? current.description ?? undefined;
  if (nextDescription) requestBody.description = nextDescription;
  const nextLocation = input.location ?? current.location ?? undefined;
  if (nextLocation) requestBody.location = nextLocation;

  const currentStartDateTime = current.start?.dateTime ?? undefined;
  const currentStartDate = current.start?.date ?? undefined;
  const currentStartTimeZone = current.start?.timeZone ?? undefined;
  const nextStartDateTime = input.start ?? currentStartDateTime;
  const nextStartTimeZone = input.timeZone ?? currentStartTimeZone;
  if (nextStartDateTime || currentStartDate) {
    requestBody.start = {
      ...(nextStartDateTime ? { dateTime: nextStartDateTime } : {}),
      ...(currentStartDate && !nextStartDateTime ? { date: currentStartDate } : {}),
      ...(nextStartTimeZone ? { timeZone: nextStartTimeZone } : {}),
    };
  }

  const currentEndDateTime = current.end?.dateTime ?? undefined;
  const currentEndDate = current.end?.date ?? undefined;
  const currentEndTimeZone = current.end?.timeZone ?? undefined;
  const nextEndDateTime = input.end ?? currentEndDateTime;
  const nextEndTimeZone = input.timeZone ?? currentEndTimeZone;
  if (nextEndDateTime || currentEndDate) {
    requestBody.end = {
      ...(nextEndDateTime ? { dateTime: nextEndDateTime } : {}),
      ...(currentEndDate && !nextEndDateTime ? { date: currentEndDate } : {}),
      ...(nextEndTimeZone ? { timeZone: nextEndTimeZone } : {}),
    };
  }

  if (input.attendees) {
    requestBody.attendees = input.attendees.map((email) => ({ email }));
  } else if (current.attendees) {
    requestBody.attendees = current.attendees.map((attendee) => ({
      ...(attendee.email ? { email: attendee.email } : {}),
    }));
  }

  const res = await calendar.events.update({
    calendarId: "primary",
    eventId: input.eventId,
    requestBody,
    sendUpdates: "all",
  });
  return res.data;
}

export async function deleteCalendarEvent(
  auth: GoogleOAuth2Client,
  eventId: string,
) {
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
  });
}

type CalendarItem = Awaited<ReturnType<typeof fetchCalendarEvents>>[number];

export type MeetingDayStat = {
  day: string;
  hours: number;
  count: number;
};

export type MeetingAnalytics = {
  totalMeetingHours: number;
  totalMeetings: number;
  meetingHeavyDays: MeetingDayStat[];
};

export function calculateMeetingAnalytics(
  events: Awaited<ReturnType<typeof fetchCalendarEvents>>,
): MeetingAnalytics {
  let totalMinutes = 0;
  let totalMeetings = 0;
  const perDay = new Map<string, { minutes: number; count: number }>();

  for (const ev of events) {
    const durationMinutes = getTimedEventDurationMinutes(ev);
    if (durationMinutes <= 0) continue;
    totalMeetings += 1;
    totalMinutes += durationMinutes;

    const key = (ev.start?.dateTime ?? "").slice(0, 10);
    if (!key) continue;
    const prev = perDay.get(key) ?? { minutes: 0, count: 0 };
    prev.minutes += durationMinutes;
    prev.count += 1;
    perDay.set(key, prev);
  }

  const meetingHeavyDays: MeetingDayStat[] = [...perDay.entries()]
    .map(([day, value]) => ({
      day,
      hours: roundToTwo(value.minutes / 60),
      count: value.count,
    }))
    .sort((a, b) => b.hours - a.hours || b.count - a.count || a.day.localeCompare(b.day));

  return {
    totalMeetingHours: roundToTwo(totalMinutes / 60),
    totalMeetings,
    meetingHeavyDays,
  };
}

export type FreeSlot = {
  start: string;
  end: string;
  minutes: number;
};

export type WeekOptimizationResult = {
  windowStart: string;
  windowEnd: string;
  overloadDays: Array<{ day: string; meetingHours: number; meetingCount: number }>;
  noFocusDays: Array<{ day: string; longestFreeMinutes: number }>;
  tightSpacingDays: Array<{ day: string; tightTransitions: number }>;
  suggestions: string[];
};

export function suggestMeetingOpenings(
  events: Awaited<ReturnType<typeof fetchCalendarEvents>>,
  options: {
    timeMin: Date;
    timeMax: Date;
    durationMinutes: number;
    maxSlots: number;
    dayStartHour?: number;
    dayEndHour?: number;
  },
): FreeSlot[] {
  const dayStartHour = options.dayStartHour ?? 9;
  const dayEndHour = options.dayEndHour ?? 17;
  const busyRanges = getBusyRanges(events, options.timeMin, options.timeMax);
  const slots: FreeSlot[] = [];

  for (
    let day = startOfDay(options.timeMin);
    day < options.timeMax && slots.length < options.maxSlots;
    day = addDays(day, 1)
  ) {
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const workStart = new Date(day);
    workStart.setHours(dayStartHour, 0, 0, 0);
    const workEnd = new Date(day);
    workEnd.setHours(dayEndHour, 0, 0, 0);
    if (workEnd <= workStart) continue;

    let cursor = workStart;
    const dayBusy = busyRanges.filter((range) => range.end > workStart && range.start < workEnd);

    for (const busy of dayBusy) {
      const blockStart = maxDate(busy.start, workStart);
      const blockEnd = minDate(busy.end, workEnd);
      if (blockStart > cursor) {
        maybePushSlot(slots, cursor, blockStart, options.durationMinutes, options.maxSlots);
      }
      if (blockEnd > cursor) {
        cursor = blockEnd;
      }
      if (slots.length >= options.maxSlots) break;
    }

    if (slots.length < options.maxSlots && workEnd > cursor) {
      maybePushSlot(slots, cursor, workEnd, options.durationMinutes, options.maxSlots);
    }
  }

  return slots;
}

export function optimizeWeekSchedule(
  events: Awaited<ReturnType<typeof fetchCalendarEvents>>,
  options: { timeMin: Date; timeMax: Date },
): WeekOptimizationResult {
  type TimedEvent = { start: Date; end: Date; day: string };
  const timedEvents: TimedEvent[] = [];
  for (const ev of events) {
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (!start || !end) continue;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;
    if (endDate <= startDate) continue;
    timedEvents.push({
      start: startDate,
      end: endDate,
      day: startDate.toISOString().slice(0, 10),
    });
  }

  const dayMap = new Map<string, TimedEvent[]>();
  for (const ev of timedEvents) {
    const list = dayMap.get(ev.day) ?? [];
    list.push(ev);
    dayMap.set(ev.day, list);
  }

  const overloadDays: Array<{ day: string; meetingHours: number; meetingCount: number }> = [];
  const noFocusDays: Array<{ day: string; longestFreeMinutes: number }> = [];
  const tightSpacingDays: Array<{ day: string; tightTransitions: number }> = [];

  for (const [day, dayEvents] of dayMap.entries()) {
    const sorted = [...dayEvents].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
    const first = sorted[0];
    if (!first) continue;
    let totalMinutes = 0;
    for (const ev of sorted) {
      totalMinutes += Math.round((ev.end.getTime() - ev.start.getTime()) / 60000);
    }
    const meetingHours = roundToTwo(totalMinutes / 60);
    if (meetingHours >= 5 || sorted.length >= 6) {
      overloadDays.push({
        day,
        meetingHours,
        meetingCount: sorted.length,
      });
    }

    const workStart = new Date(first.start);
    workStart.setHours(9, 0, 0, 0);
    const workEnd = new Date(first.start);
    workEnd.setHours(17, 0, 0, 0);
    let cursor = workStart;
    let longestGap = 0;
    let tightTransitions = 0;
    for (const ev of sorted) {
      const gap = Math.floor((ev.start.getTime() - cursor.getTime()) / 60000);
      if (gap > longestGap) longestGap = gap;
      if (gap >= 0 && gap <= 10) tightTransitions += 1;
      if (ev.end > cursor) cursor = ev.end;
    }
    const tailGap = Math.floor((workEnd.getTime() - cursor.getTime()) / 60000);
    if (tailGap > longestGap) longestGap = tailGap;

    if (longestGap < 120) {
      noFocusDays.push({ day, longestFreeMinutes: Math.max(0, longestGap) });
    }
    if (tightTransitions >= 2) {
      tightSpacingDays.push({ day, tightTransitions });
    }
  }

  overloadDays.sort((a, b) => b.meetingHours - a.meetingHours);
  noFocusDays.sort((a, b) => a.longestFreeMinutes - b.longestFreeMinutes);
  tightSpacingDays.sort((a, b) => b.tightTransitions - a.tightTransitions);

  const suggestions: string[] = [];
  const topOverload = overloadDays[0];
  if (topOverload) {
    suggestions.push(
      `Reduce load on ${topOverload.day}: convert 1-2 status meetings to async updates or move lower-priority meetings to lighter days.`,
    );
  }
  const topNoFocus = noFocusDays[0];
  if (topNoFocus) {
    suggestions.push(
      `Protect deep work on ${topNoFocus.day}: block a 2-hour focus window (for example 9:00-11:00) before accepting new meetings.`,
    );
  }
  const topTightSpacing = tightSpacingDays[0];
  if (topTightSpacing) {
    suggestions.push(
      `Add 10-15 minute buffers on ${topTightSpacing.day}: ${topTightSpacing.tightTransitions} meetings are tightly back-to-back.`,
    );
  }
  if (suggestions.length === 0) {
    suggestions.push(
      "Calendar is already optimized for this window. No overload days, focus-time gaps, or tight meeting chains were detected.",
    );
  } else {
    suggestions.push(
      "Optional upgrade: block 3 gym/workout sessions next week (45-60 min each) as recurring calendar holds to protect mornings.",
    );
  }

  return {
    windowStart: options.timeMin.toISOString(),
    windowEnd: options.timeMax.toISOString(),
    overloadDays,
    noFocusDays,
    tightSpacingDays,
    suggestions,
  };
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

function getTimedEventDurationMinutes(ev: CalendarItem): number {
  const start = ev.start?.dateTime;
  const end = ev.end?.dateTime;
  if (!start || !end) return 0;
  const startTs = Date.parse(start);
  const endTs = Date.parse(end);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return 0;
  return Math.round((endTs - startTs) / 60000);
}

function getBusyRanges(
  events: Awaited<ReturnType<typeof fetchCalendarEvents>>,
  timeMin: Date,
  timeMax: Date,
): Array<{ start: Date; end: Date }> {
  const ranges: Array<{ start: Date; end: Date }> = [];
  for (const ev of events) {
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (!start || !end) continue;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;
    if (endDate <= timeMin || startDate >= timeMax) continue;
    ranges.push({ start: startDate, end: endDate });
  }
  ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
  return mergeOverlappingRanges(ranges);
}

function mergeOverlappingRanges(
  ranges: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  if (ranges.length <= 1) return ranges;
  const first = ranges[0];
  if (!first) return [];
  const merged: Array<{ start: Date; end: Date }> = [first];
  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const prev = merged[merged.length - 1];
    if (!current || !prev) continue;
    if (current.start <= prev.end) {
      if (current.end > prev.end) {
        prev.end = current.end;
      }
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
}

function maybePushSlot(
  slots: FreeSlot[],
  start: Date,
  end: Date,
  minDurationMinutes: number,
  maxSlots: number,
) {
  if (slots.length >= maxSlots) return;
  const minutes = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (minutes < minDurationMinutes) return;
  slots.push({
    start: start.toISOString(),
    end: end.toISOString(),
    minutes,
  });
}

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfDay(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
