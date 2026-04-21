import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "./api";
import "./App.css";

type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      email?: string;
      name?: string;
      picture?: string;
    };

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink?: string;
};

type MeetingDayStat = {
  day: string;
  hours: number;
  count: number;
};

type MeetingAnalytics = {
  totalMeetingHours: number;
  totalMeetings: number;
  meetingHeavyDays: MeetingDayStat[];
};

type MeetingSuggestion = {
  start: string;
  end: string;
  minutes: number;
};

type WeekOptimization = {
  overloadDays: Array<{ day: string; meetingHours: number; meetingCount: number }>;
  noFocusDays: Array<{ day: string; longestFreeMinutes: number }>;
  tightSpacingDays: Array<{ day: string; tightTransitions: number }>;
  suggestions: string[];
};

type CreatedEventResponse = {
  id: string;
  summary: string;
  htmlLink?: string;
  start: string;
  end: string;
};

type ChatRole = "user" | "assistant";

type ChatMessage = { role: ChatRole; content: string };

function localDateTimeInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MeetingSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [optimization, setOptimization] = useState<WeekOptimization | null>(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [optimizationActionLoading, setOptimizationActionLoading] = useState(false);
  const [hasRunOptimization, setHasRunOptimization] = useState(false);
  const [focusStartLocal, setFocusStartLocal] = useState("");
  const [focusDurationMin, setFocusDurationMin] = useState(120);
  const [workoutStartLocal, setWorkoutStartLocal] = useState("");
  const [workoutDurationMin, setWorkoutDurationMin] = useState(60);
  const [customBlockTitle, setCustomBlockTitle] = useState("");
  const [customBlockStartLocal, setCustomBlockStartLocal] = useState("");
  const [customBlockDurationMin, setCustomBlockDurationMin] = useState(60);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const loadMe = useCallback(async () => {
    setMeError(null);
    try {
      const data = await fetchJson<MeResponse>("/api/me");
      setMe(data);
    } catch (e) {
      setMeError(e instanceof Error ? e.message : "Failed to load profile");
      setMe({ authenticated: false });
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    const timeMin = new Date();
    const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      const q = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      });
      const data = await fetchJson<{
        events: CalendarEvent[];
      }>(`/api/calendar/events?${q.toString()}`);
      setEvents(data.events);
    } catch (e) {
      setEventsError(
        e instanceof Error ? e.message : "Could not load calendar",
      );
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const timeMin = new Date();
    const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      const q = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      });
      const data = await fetchJson<MeetingAnalytics>(
        `/api/calendar/analytics?${q.toString()}`,
      );
      setAnalytics(data);
    } catch (e) {
      setAnalyticsError(
        e instanceof Error ? e.message : "Could not load analytics",
      );
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const q = new URLSearchParams({
        durationMinutes: "30",
        days: "7",
        maxSlots: "5",
      });
      const data = await fetchJson<{ suggestions: MeetingSuggestion[] }>(
        `/api/calendar/recommendations?${q.toString()}`,
      );
      setSuggestions(data.suggestions);
    } catch (e) {
      setSuggestionsError(
        e instanceof Error ? e.message : "Could not load recommendations",
      );
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const optimizeWeek = useCallback(async () => {
    setHasRunOptimization(true);
    setOptimizationLoading(true);
    setOptimizationError(null);
    const timeMin = new Date();
    const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      const q = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      });
      const data = await fetchJson<WeekOptimization>(
        `/api/calendar/optimize?${q.toString()}`,
      );
      setOptimization(data);
    } catch (e) {
      setOptimizationError(
        e instanceof Error ? e.message : "Could not optimize week",
      );
      setOptimization(null);
    } finally {
      setOptimizationLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadMe();
    });
  }, [loadMe]);

  useEffect(() => {
    const auth = searchParams.get("auth");
    const reason = searchParams.get("reason");
    if (auth === "success") {
      queueMicrotask(() => {
        setBanner("Google account connected.");
        setSearchParams({});
        void loadMe();
      });
    } else if (auth === "error") {
      queueMicrotask(() => {
        setBanner(
          `Sign-in did not complete${reason ? ` (${reason})` : ""}. See MANUAL_GOOGLE_CLOUD_SETUP.md if OAuth is not configured.`,
        );
        setSearchParams({});
      });
    }
  }, [searchParams, setSearchParams, loadMe]);

  useEffect(() => {
    queueMicrotask(() => {
      if (me?.authenticated) {
        void loadEvents();
        void loadAnalytics();
        void loadSuggestions();
      } else {
        setEvents([]);
        setAnalytics(null);
        setSuggestions([]);
        setOptimization(null);
        setHasRunOptimization(false);
      }
    });
  }, [me, loadEvents, loadAnalytics, loadSuggestions]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = dayjs(ev.start).format("YYYY-MM-DD");
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  function useSuggestedSlot(slot: MeetingSuggestion) {
    const startLabel = dayjs(slot.start).format("dddd, MMM D [at] h:mm A");
    const endLabel = dayjs(slot.end).format("h:mm A");
    const prompt = [
      `Use this suggested slot: ${startLabel} to ${endLabel}.`,
      "Draft a concise scheduling email I can send to Joe, Dan, and Sally.",
      "Constraints: I prefer mornings blocked for workouts, and I can meet in this proposed window.",
      "Return a polished subject line and email body.",
    ].join(" ");
    setInput(prompt);
    setChatError(null);
    const chatInput = document.getElementById("chat-input");
    if (chatInput instanceof HTMLTextAreaElement) {
      chatInput.focus();
    }
  }

  async function sendChat() {
    const trimmed = input.trim();
    if (!trimmed || chatSending) return;
    if (!me?.authenticated) {
      setChatError("Connect Google first.");
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setChatError(null);
    setChatSending(true);
    try {
      const data = await fetchJson<{ reply: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: nextMessages,
          timeZone,
          contextDays: 14,
        }),
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chat failed";
      setChatError(msg);
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    } finally {
      setChatSending(false);
    }
  }

  async function createCalendarHoldWithConfirm(input: {
    summary: string;
    start: string;
    end: string;
    description: string;
    confirmLabel: string;
  }) {
    const startLabel = dayjs(input.start).format("ddd, MMM D h:mm A");
    const endLabel = dayjs(input.end).format("h:mm A");
    const ok = window.confirm(
      `${input.confirmLabel}\n\n${input.summary}\n${startLabel} - ${endLabel}`,
    );
    if (!ok) return;
    setOptimizationActionLoading(true);
    setBanner(null);
    try {
      const created = await fetchJson<CreatedEventResponse>("/api/calendar/events", {
        method: "POST",
        body: JSON.stringify({
          summary: input.summary,
          start: input.start,
          end: input.end,
          description: input.description,
          timeZone,
        }),
      });
      setBanner(
        `${created.summary} created for ${dayjs(created.start).format("ddd, MMM D h:mm A")}.`,
      );
      await Promise.all([loadEvents(), loadAnalytics(), loadSuggestions(), optimizeWeek()]);
    } catch (e) {
      setOptimizationError(
        e instanceof Error ? e.message : "Could not create calendar hold",
      );
    } finally {
      setOptimizationActionLoading(false);
    }
  }

  async function createFocusBlockAction() {
    setOptimizationError(null);
    const startIso = localDateTimeInputToIso(focusStartLocal);
    if (!startIso) {
      setOptimizationError("Choose a start date and time for the focus block.");
      return;
    }
    const mins = Math.max(15, Math.round(focusDurationMin) || 120);
    const endIso = dayjs(startIso).add(mins, "minute").toISOString();
    await createCalendarHoldWithConfirm({
      summary: "Focus Block",
      start: startIso,
      end: endIso,
      description: "Auto-added by AI Executive Assistant Mode to protect deep work.",
      confirmLabel: "Create focus block?",
    });
  }

  async function createWorkoutBlockAction() {
    setOptimizationError(null);
    const startIso = localDateTimeInputToIso(workoutStartLocal);
    if (!startIso) {
      setOptimizationError("Choose a start date and time for the workout block.");
      return;
    }
    const mins = Math.max(15, Math.round(workoutDurationMin) || 60);
    const endIso = dayjs(startIso).add(mins, "minute").toISOString();
    await createCalendarHoldWithConfirm({
      summary: "Workout / Gym Block",
      start: startIso,
      end: endIso,
      description: "Auto-added by AI Executive Assistant Mode to protect personal wellness time.",
      confirmLabel: "Create workout block?",
    });
  }

  async function createCustomBlockAction() {
    setOptimizationError(null);
    const title = customBlockTitle.trim();
    const startIso = localDateTimeInputToIso(customBlockStartLocal);
    if (!title) {
      setOptimizationError("Enter a title for the custom block.");
      return;
    }
    if (!startIso) {
      setOptimizationError("Choose a start date and time for the custom block.");
      return;
    }
    const mins = Math.max(15, Math.round(customBlockDurationMin) || 60);
    const endIso = dayjs(startIso).add(mins, "minute").toISOString();
    await createCalendarHoldWithConfirm({
      summary: title,
      start: startIso,
      end: endIso,
      description: "Added from AI Executive Assistant Mode (custom block).",
      confirmLabel: "Create this calendar block?",
    });
  }

  async function logout() {
    try {
      await fetchJson("/api/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    setMe({ authenticated: false });
    setMessages([]);
    setBanner(null);
    void loadMe();
  }

  const connected = me?.authenticated === true;

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-header-text">
          <h1 className="app-title">Calendar Assistant</h1>
          <p className="app-tagline">
            Your week at a glance, plus a chat that knows your schedule.
          </p>
        </div>
        <div className="app-header-actions">
          {meError ? (
            <span className="pill pill-warn">API: {meError}</span>
          ) : null}
          {connected ? (
            <>
              <span className="user-email" title={me.email ?? ""}>
                {me.email ?? "Signed in"}
              </span>
              <button type="button" className="btn secondary" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <a className="btn primary" href="/auth/google">
              Connect Google Calendar
            </a>
          )}
        </div>
      </header>

      {banner ? (
        <div className="banner" role="status">
          {banner}
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      <main className="app-main">
        <section className="panel calendar-panel" aria-labelledby="cal-heading">
          <div className="panel-head">
            <h2 id="cal-heading">This week</h2>
            {connected ? (
              <button
                type="button"
                className="btn text"
                onClick={() => {
                  void loadEvents();
                  void loadAnalytics();
                  void loadSuggestions();
                }}
                disabled={eventsLoading}
              >
                {eventsLoading ? "Refreshing…" : "Refresh"}
              </button>
            ) : null}
          </div>
          {connected ? (
            <div className="optimize-box">
              <div className="optimize-header">
                <div className="heavy-days-label">AI Executive Assistant Mode</div>
                <button
                  type="button"
                  className="btn secondary optimize-btn"
                  onClick={() => void optimizeWeek()}
                  disabled={optimizationLoading}
                >
                  {optimizationLoading ? "Optimizing..." : "Optimize My Week"}
                </button>
              </div>
              {optimizationError ? (
                <p className="error-text">{optimizationError}</p>
              ) : hasRunOptimization && optimization ? (
                <div className="optimize-content">
                  <p className="muted">
                    Detects overload, missing focus time, and tight meeting spacing.
                  </p>
                  <div className="optimize-actions">
                    <div className="optimize-actions-grid">
                      <div className="optimize-row-fields">
                        <input
                          type="datetime-local"
                          className="optimize-row-input optimize-row-input--datetime"
                          aria-label="Focus block start"
                          value={focusStartLocal}
                          onChange={(e) => setFocusStartLocal(e.target.value)}
                        />
                        <input
                          type="number"
                          className="optimize-row-input optimize-row-input--narrow"
                          min={15}
                          step={15}
                          aria-label="Focus block length in minutes"
                          title="Minutes"
                          value={focusDurationMin}
                          onChange={(e) =>
                            setFocusDurationMin(Number(e.target.value) || 120)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn secondary optimize-action-btn"
                        onClick={() => void createFocusBlockAction()}
                        disabled={optimizationActionLoading || optimizationLoading}
                      >
                        Create Focus Block
                      </button>
                      <div className="optimize-row-fields optimize-row-fields--custom">
                        <input
                          type="datetime-local"
                          className="optimize-row-input optimize-row-input--datetime"
                          aria-label="Workout block start"
                          value={workoutStartLocal}
                          onChange={(e) => setWorkoutStartLocal(e.target.value)}
                        />
                        <input
                          type="number"
                          className="optimize-row-input optimize-row-input--narrow"
                          min={15}
                          step={15}
                          aria-label="Workout block length in minutes"
                          title="Minutes"
                          value={workoutDurationMin}
                          onChange={(e) =>
                            setWorkoutDurationMin(Number(e.target.value) || 60)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn secondary optimize-action-btn"
                        onClick={() => void createWorkoutBlockAction()}
                        disabled={optimizationActionLoading || optimizationLoading}
                      >
                        Create Workout Block
                      </button>
                      <div className="optimize-row-fields optimize-row-fields--custom">
                        <input
                          type="text"
                          className="optimize-row-input optimize-row-input--title"
                          placeholder="Title"
                          aria-label="Custom block title"
                          value={customBlockTitle}
                          onChange={(e) => setCustomBlockTitle(e.target.value)}
                        />
                        <input
                          type="datetime-local"
                          className="optimize-row-input optimize-row-input--datetime"
                          aria-label="Custom block start"
                          value={customBlockStartLocal}
                          onChange={(e) => setCustomBlockStartLocal(e.target.value)}
                        />
                      </div>
                      <div className="optimize-custom-actions">
                        <button
                          type="button"
                          className="btn secondary optimize-action-btn"
                          onClick={() => void createCustomBlockAction()}
                          disabled={optimizationActionLoading || optimizationLoading}
                        >
                          Add Custom Block
                        </button>
                        <input
                          type="number"
                          className="optimize-row-input optimize-custom-minutes-input"
                          min={15}
                          step={15}
                          aria-label="Custom block length in minutes"
                          title="Minutes"
                          value={customBlockDurationMin}
                          onChange={(e) =>
                            setCustomBlockDurationMin(Number(e.target.value) || 60)
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <ul className="suggestion-list">
                    {optimization.suggestions.map((s, idx) => (
                      <li key={`${idx}-${s}`}>
                        <span className="suggestion-text">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="muted">
                  Click "Optimize My Week" to analyze your schedule. No changes are made automatically.
                </p>
              )}
            </div>
          ) : null}
          {connected ? (
            <div className="analytics-grid">
              <div className="analytics-card">
                <div className="analytics-label">Meeting hours (next 7 days)</div>
                <div className="analytics-value">
                  {analyticsLoading
                    ? "…"
                    : analytics
                      ? analytics.totalMeetingHours.toFixed(2)
                      : "--"}
                </div>
              </div>
              <div className="analytics-card">
                <div className="analytics-label">Timed meetings</div>
                <div className="analytics-value">
                  {analyticsLoading ? "…" : analytics?.totalMeetings ?? "--"}
                </div>
              </div>
            </div>
          ) : null}
          {analyticsError ? <p className="error-text">{analyticsError}</p> : null}
          {connected && analytics && analytics.meetingHeavyDays.length > 0 ? (
            <div className="heavy-days">
              <div className="heavy-days-label">Top meeting-heavy days</div>
              <ul className="heavy-days-list">
                {analytics.meetingHeavyDays.slice(0, 3).map((d) => (
                  <li key={d.day}>
                    {dayjs(d.day).format("ddd, MMM D")}: {d.hours.toFixed(2)}h ({d.count} meetings)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {connected ? (
            <div className="recommendations">
              <div className="heavy-days-label">Suggested 30-minute openings</div>
              {suggestionsLoading ? (
                <p className="muted">Loading recommendations…</p>
              ) : suggestionsError ? (
                <p className="error-text">{suggestionsError}</p>
              ) : suggestions.length === 0 ? (
                <p className="muted">No openings found in standard weekday work hours.</p>
              ) : (
                <ul className="suggestion-list">
                  {suggestions.map((slot) => (
                    <li key={`${slot.start}-${slot.end}`}>
                      <span className="suggestion-text">
                        {dayjs(slot.start).format("ddd, MMM D h:mm A")} - {dayjs(slot.end).format("h:mm A")} ({slot.minutes}m)
                      </span>
                      <button
                        type="button"
                        className="btn secondary suggestion-use-btn"
                        onClick={() => useSuggestedSlot(slot)}
                        disabled={!connected || chatSending}
                      >
                        Use this slot
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {!connected ? (
            <p className="muted">
              Connect your Google account to load events from your primary
              calendar.
            </p>
          ) : eventsLoading ? (
            <p className="muted">Loading events…</p>
          ) : eventsError ? (
            <p className="error-text">{eventsError}</p>
          ) : groupedByDay.length === 0 ? (
            <p className="muted">No events in the next 7 days.</p>
          ) : (
            <ul className="day-list">
              {groupedByDay.map(([day, list]) => (
                <li key={day} className="day-block">
                  <div className="day-label">
                    {dayjs(day).format("dddd, MMM D")}
                  </div>
                  <ul className="event-list">
                    {list.map((ev) => (
                      <li key={ev.id} className="event-row">
                        <span className="event-time">
                          {formatEventTime(ev)}
                        </span>
                        <span className="event-title">{ev.summary}</span>
                        {ev.htmlLink ? (
                          <a
                            className="event-link"
                            href={ev.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel chat-panel" aria-labelledby="chat-heading">
          <div className="panel-head">
            <h2 id="chat-heading">Calendar agent</h2>
          </div>
          <p className="muted chat-hint">
            Ask for email drafts, meeting load, or how to protect focus time.
            Uses your calendar for the next ~2 weeks as context.
          </p>
          <div className="chat-thread" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="muted chat-empty">
                {connected
                  ? "Start by asking something about your schedule."
                  : "Connect Google to enable chat with calendar context."}
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={`chat-msg chat-msg-${m.role}`}
                >
                  <span className="chat-role">
                    {m.role === "user" ? "You" : "Assistant"}
                  </span>
                  <div className="chat-bubble">{m.content}</div>
                </div>
              ))
            )}
          </div>
          {chatError ? <p className="error-text">{chatError}</p> : null}
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <label className="sr-only" htmlFor="chat-input">
              Message
            </label>
            <textarea
              id="chat-input"
              className="chat-input"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                connected
                  ? 'e.g. "Draft short emails to schedule 1:1s with Alex and Jordan next week."'
                  : "Connect Google to chat…"
              }
              disabled={!connected || chatSending}
            />
            <button
              type="submit"
              className="btn primary"
              disabled={!connected || chatSending || !input.trim()}
            >
              {chatSending ? "Sending…" : "Send"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function formatEventTime(ev: CalendarEvent): string {
  const start = dayjs(ev.start);
  const end = dayjs(ev.end);
  if (!start.isValid()) return "";
  if (ev.start.length <= 10) {
    return "All day";
  }
  if (!end.isValid()) return start.format("h:mm A");
  return `${start.format("h:mm A")}–${end.format("h:mm A")}`;
}

export default App;
