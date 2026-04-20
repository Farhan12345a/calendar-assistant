import { Router } from "express";
import OpenAI from "openai";
import {
  fetchCalendarEvents,
  formatEventsForPrompt,
} from "../calendarService.js";
import { getOAuth2ClientForSession } from "../oauthClient.js";

const router = Router();

const MAX_USER_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12000;

type ChatMessage = { role: "user" | "assistant"; content: string };

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
  try {
    const items = await fetchCalendarEvents(oauth, { timeMin: now, timeMax });
    calendarBlock = formatEventsForPrompt(items, timeZone);
  } catch (e) {
    console.error(e);
    calendarBlock = "(Could not load calendar events for this answer.)";
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
  ].join("\n");

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 2048,
    });

    const text = completion.choices[0]?.message?.content ?? "";
    res.json({ reply: text });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "openai_failed" });
  }
});

export const chatRouter = router;
