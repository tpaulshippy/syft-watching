// POST /api/notify with JSON {"title","url","source"} -> sends an email via Resend.
export async function onRequestPost({ request, env }) {
  if (!env?.RESEND_API_KEY) return json({ error: "email not configured" }, 503);
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
  const to = env.DAD_EMAIL || "pshippy@gmail.com";
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
        subject: "Judah watched: " + title,
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
