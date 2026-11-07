export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (!q.trim()) return json({ results: [] });
  try {
    const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(q) + "&hl=en&gl=US";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error("YouTube HTTP " + res.status);
    const html = await res.text();
    let results = parseInitialData(html);
    if (!results.length) results = regexScan(html);
    if (!results.length) results = await pipedFallback(q);
    if (!results.length) throw new Error("No videoIds parsed");
    return json({ results }, 200, true);
  } catch (e) {
    return json({ error: "YouTube search unavailable: " + e.message }, 502);
  }
}
function parseInitialData(html) {
  const out = [];
  try {
    const m = html.match(/var\s+ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s);
    if (!m) return out;
    const data = JSON.parse(m[1]);
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    for (const s of sections) {
      const items = s?.itemSectionRenderer?.contents || [];
      for (const it of items) {
        const v = it?.videoRenderer;
        if (!v?.videoId) continue;
        const thumbs = v?.thumbnail?.thumbnails || [];
        out.push({
          videoId: v.videoId,
          title: (v?.title?.runs || []).map((r) => r.text).join("") || v.videoId,
          channel: v?.ownerText?.runs?.[0]?.text || v?.longBylineText?.runs?.[0]?.text || "",
          thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : "",
          watchUrl: "https://www.youtube.com/watch?v=" + v.videoId,
        });
        if (out.length >= 12) return out;
      }
    }
  } catch { /* fall through to regex fallback */ }
  return out;
}
function regexScan(html) {
  const seen = new Set();
  const results = [];
  const titles = {};
  let m;
  const titleRe = /"videoId":"([a-zA-Z0-9_-]{11})".{0,600}?"text":"((?:[^"\\]|\\.){1,120})"/g;
  while ((m = titleRe.exec(html)) && Object.keys(titles).length < 30) {
    if (!titles[m[1]]) titles[m[1]] = m[2].replace(/\\u0026/g, "&").replace(/\\/g, "");
  }
  const re = /"videoId":"([a-zA-Z0-9_-]{11})","thumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/g;
  while ((m = re.exec(html)) && results.length < 12) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      videoId: m[1],
      title: titles[m[1]] || m[1],
      channel: "",
      thumbnail: m[2].replace(/\\u0026/g, "&"),
      watchUrl: "https://www.youtube.com/watch?v=" + m[1],
    });
  }
  return results;
}
async function pipedFallback(q) {
  const r = await fetch("https://pipedapi.kavin.rocks/search?q=" + encodeURIComponent(q) + "&filter=videos", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!r.ok) return [];
  const data = await r.json();
  const out = [];
  for (const it of data?.items || []) {
    const m = String(it?.url || "").match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (!m) continue;
    out.push({
      videoId: m[1],
      title: it.title || m[1],
      channel: it.uploaderName || "",
      thumbnail: it.thumbnail || "",
      watchUrl: "https://www.youtube.com/watch?v=" + m[1],
    });
    if (out.length >= 12) break;
  }
  return out;
}
function json(obj, status = 200, cache = false) {
  const headers = { "content-type": "application/json" };
  if (cache) headers["Cache-Control"] = "public, max-age=3600";
  return new Response(JSON.stringify(obj), { status, headers });
}
