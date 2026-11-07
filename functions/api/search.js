// GET /api/search?q= -> {"results":[{"source":"youtube"|"disney","title","year","type","thumbnail","watchUrl"}]}
// Self-contained aggregate: keyless YouTube parse + Disney via JustWatch HTML
// (play-URL resolver) + iTunes movie metadata + TVMaze show metadata.
// Ranking: normalize = lowercase alphanumeric-only. exact==q: 100;
// startsWith q: 60; includes q: 30; plus disney +10. Sort desc, dedupe by
// watchUrl, cap 20. One dead source never fails the whole request.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

import { verifyGoogleIdToken, getBearerToken } from "../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await verifyGoogleIdToken(env, getBearerToken(request));
  if (!user) return json({ error: "login required" }, 401);
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (!q) return json({ results: [] });
  const [yt, jw, itunes, tvmaze] = await Promise.allSettled([
    youtubeSearch(q),
    justwatchDisney(q),
    searchItunes(q),
    searchTvmaze(q),
  ]).then((rs) => rs.map((r) => (r.status === "fulfilled" ? r.value : [])));
  // iTunes/TVMaze are metadata-only: skip any whose exact normalized title
  // duplicates a JustWatch UUID hit (JW direct-play link wins).
  const jwTitles = new Set(jw.map((h) => normalize(h.title)));
  const meta = [...itunes, ...tvmaze].filter((h) => !jwTitles.has(normalize(h.title)));
  // Poster backfill: one best-effort lookup per thumbnail-less JW hit.
  await backfillPosters(jw);
  const nq = normalize(q);
  const ranked = [...jw, ...meta, ...yt]
    .map((h) => ({ h, s: score(h, nq) }))
    .sort((a, b) => b.s - a.s);
  const seenUrl = new Set();
  const results = [];
  for (const { h } of ranked) {
    if (seenUrl.has(h.watchUrl)) continue;
    seenUrl.add(h.watchUrl);
    results.push(h);
    if (results.length >= 20) break;
  }
  return json({ results }, 200, true);
}

// --- YouTube: three-stage keyless parse ---
async function youtubeSearch(q) {
  try {
    const url =
      "https://www.youtube.com/results?search_query=" + encodeURIComponent(q) + "&hl=en&gl=US";
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("YouTube HTTP " + res.status);
    const html = await res.text();
    let videos = parseInitialData(html);
    if (!videos.length) videos = regexScan(html);
    if (!videos.length) videos = await pipedFallback(q);
    return videos.map((v) => ({
      source: "youtube",
      title: v.title,
      year: "",
      type: "Video",
      thumbnail: v.thumbnail || "",
      watchUrl: v.watchUrl,
    }));
  } catch {
    return [];
  }
}
function parseInitialData(html) {
  const out = [];
  try {
    const m = html.match(/var\s+ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s);
    if (!m) return out;
    const data = JSON.parse(m[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];
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
  } catch {
    /* fall through to regex fallback */
  }
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
  try {
    const r = await fetch(
      "https://pipedapi.kavin.rocks/search?q=" + encodeURIComponent(q) + "&filter=videos",
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
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
  } catch {
    return [];
  }
}

// --- Disney via JustWatch HTML: the play-URL resolver ---
async function justwatchDisney(q) {
  try {
    const res = await fetch("https://www.justwatch.com/us/search?q=" + encodeURIComponent(q), {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const re = /disneyplus\.com(?:%2F|\/)browse(?:%2F|\/)entity-([a-f0-9-]{36})/g;
    const seen = new Set();
    const out = [];
    let m;
    while ((m = re.exec(html)) && out.length < 6) {
      const uuid = m[1].toLowerCase();
      if (seen.has(uuid)) continue;
      seen.add(uuid);
      const before = html
        .slice(Math.max(0, m.index - 3000), m.index)
        .replace(/<[^>]*>/g, "|");
      let title = q;
      let year = "";
      const tre = /\|\s*([^|<>]{2,120}?)\s*[|\s]*\((19\d\d|20\d\d)\)/g;
      let tm;
      let last = null;
      while ((tm = tre.exec(before))) last = tm;
      if (last) {
        title = last[1].trim();
        year = last[2];
      }
      const after = html.slice(m.index, m.index + 400);
      const tmatch = after.match(/uct_pt=(movie|show)/);
      const type = tmatch ? (tmatch[1] === "show" ? "TV" : "Movie") : "Movie";
      out.push({
        source: "disney",
        title,
        year,
        type,
        thumbnail: "",
        watchUrl: "https://www.disneyplus.com/play/" + uuid,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// --- Disney metadata/posters: iTunes movies + TVMaze shows ---
async function searchItunes(term) {
  try {
    const res = await fetch(
      "https://itunes.apple.com/search?term=" +
        encodeURIComponent(term) +
        "&media=movie&entity=movie&limit=10",
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results || [])
      .filter((r) => r?.trackName)
      .map((r) => ({
        source: "disney",
        title: r.trackName,
        year: String(r.releaseDate || "").slice(0, 4),
        type: "Movie",
        thumbnail: String(r.artworkUrl100 || "").replace(/100x100/, "600x600"),
        watchUrl: "https://www.disneyplus.com/search?q=" + encodeURIComponent(r.trackName),
      }));
  } catch {
    return [];
  }
}
async function searchTvmaze(term) {
  try {
    const res = await fetch("https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(term), {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const hit of data || []) {
      const s = hit?.show;
      if (!s?.name) continue;
      out.push({
        source: "disney",
        title: s.name,
        year: String(s.premiered || "").slice(0, 4),
        type: s.type || "TV",
        thumbnail: s.image?.medium || s.image?.original || "",
        watchUrl: "https://www.disneyplus.com/search?q=" + encodeURIComponent(s.name),
      });
      if (out.length >= 10) break;
    }
    return out;
  } catch {
    return [];
  }
}
async function backfillPosters(hits) {
  await Promise.allSettled(
    hits
      .filter((h) => !h.thumbnail && h.title)
      .map(async (h) => {
        try {
          const norm = normalize(h.title);
          if (h.type === "TV") {
            const hit = (await searchTvmaze(h.title)).find(
              (c) => normalize(c.title) === norm
            );
            if (hit?.thumbnail) h.thumbnail = hit.thumbnail;
          } else {
            const hit = (await searchItunes(h.title)).find(
              (c) => normalize(c.title) === norm
            );
            if (hit?.thumbnail) h.thumbnail = hit.thumbnail;
          }
        } catch {
          /* leave "" */
        }
      })
  );
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function score(item, nq) {
  const t = normalize(item.title);
  let s = 0;
  if (t === nq) s = 100;
  else if (nq && t.startsWith(nq)) s = 60;
  else if (nq && t.includes(nq)) s = 30;
  if (item.source === "disney") s += 10;
  return s;
}
function json(obj, status = 200, cache = false) {
  const headers = { "content-type": "application/json" };
  if (cache) headers["Cache-Control"] = "public, max-age=3600";
  return new Response(JSON.stringify(obj), { status, headers });
}
