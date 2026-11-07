// POST /api/notify with JSON {"title","url","source"} -> sends an email via Resend.
// Requires Authorization: Bearer <Google ID token>; the subject uses the
// verified user's first name (never a client-sent name).
import { verifyGoogleIdToken, getBearerToken } from "../lib/auth.js";

export async function onRequestPost({ request, env }) {
  const user = await verifyGoogleIdToken(env, getBearerToken(request));
  if (!user) return json({ error: "login required" }, 401);
  if (!env?.RESEND_API_KEY || !env?.DAD_EMAIL) return json({ error: "email not configured" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const title = String(body?.title || "").slice(0, 200);
  const url = String(body?.url || "").slice(0, 500);
  const source = String(body?.source || "").slice(0, 50);
  if (!title || !url) return json({ error: "title and url required" }, 400);
  const from = env.FROM_EMAIL || "Syft Watching <onboarding@resend.dev>";
  const to = env.DAD_EMAIL;
  const name =
    (user.firstName || "").trim() || String(user.email || "").split("@")[0] || "Someone";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: name + " wants to watch: " + title,
        text: title + " (" + source + ")\n" + url + "\n" + new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return json({ error: "email send failed" }, 502);
    const data = await res.json().catch(() => ({}));
    return json({ ok: true, id: data?.id || null });
  } catch {
    return json({ error: "email send failed" }, 502);
  }
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
