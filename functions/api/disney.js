export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (!q) return json({ results: [] });
  const results = [];
  // Best-effort: resolve title -> Disney+ play/<uuid> via DDG site: scrape.
  // Often blocked from datacenters; failure is fine, TVMaze results follow.
  try {
    const ddg = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent("site:disneyplus.com/browse " + q);
    const res = await fetch(ddg, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const re = /disneyplus\.com\/(?:browse\/entity-|play\/)([a-f0-9-]{36})/gi;
      const seen = new Set();
      let m;
      while ((m = re.exec(html)) && results.length < 4) {
        const id = m[1].toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({
          title: q + " (Disney+)",
          year: "",
          type: "Disney+",
          thumbnail: "",
          browseUrl: "https://www.disneyplus.com/browse/entity-" + id,
          playUrl: "https://www.disneyplus.com/play/" + id,
        });
      }
    }
  } catch { /* fall through to TVMaze */ }
  // Reliable keyless metadata: TVMaze show search (title/year/poster).
  // Watch goes to the Disney+ search page for that exact title.
  try {
    const res = await fetch("https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(q), {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const hit of data || []) {
        const s = hit?.show;
        if (!s?.name) continue;
        const link = "https://www.disneyplus.com/search?q=" + encodeURIComponent(s.name);
        results.push({
          title: s.name,
          year: (s.premiered || "").slice(0, 4),
          type: s.type || "TV",
          thumbnail: s.image?.medium || s.image?.original || "",
          browseUrl: link,
          playUrl: link,
        });
        if (results.length >= 12) break;
      }
    }
  } catch { /* ignore */ }
  if (!results.length) {
    const link = "https://www.disneyplus.com/search?q=" + encodeURIComponent(q);
    results.push({ title: q, year: "", type: "Search", thumbnail: "", browseUrl: link, playUrl: link });
  }
  return json({ results }, 200, true);
}
function json(obj, status = 200, cache = false) {
  const headers = { "content-type": "application/json" };
  if (cache) headers["Cache-Control"] = "public, max-age=3600";
  return new Response(JSON.stringify(obj), { status, headers });
}
