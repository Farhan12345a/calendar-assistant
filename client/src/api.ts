export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as {
        error?: string;
        action?: string;
        message?: string;
      };
      if (parsed.error === "insufficient_scopes") {
        message =
          "Google Calendar permission is missing. Please log out and connect Google Calendar again.";
      } else if (parsed.message) {
        message = parsed.message;
      } else if (parsed.error) {
        message = parsed.error;
      }
    } catch {
      // keep original text-based message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
