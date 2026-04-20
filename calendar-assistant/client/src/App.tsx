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

type ChatRole = "user" | "assistant";

type ChatMessage = { role: ChatRole; content: string };

function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
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
      } else {
        setEvents([]);
      }
    });
  }, [me, loadEvents]);

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
                onClick={() => void loadEvents()}
                disabled={eventsLoading}
              >
                {eventsLoading ? "Refreshing…" : "Refresh"}
              </button>
            ) : null}
          </div>
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
