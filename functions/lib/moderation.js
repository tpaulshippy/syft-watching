// Server-side Jev (TypeSafe System One) kid-safety moderation for search queries.
// Fail OPEN: any missing key, non-ok, timeout, or malformed response -> fallback verdict.
export const EDGE_THRESHOLD = 0.6;
export const BLOCK_THRESHOLD = 0.85;

const QUESTIONS = {
  adult_language: {
    type: "noul",
    instructions:
      "Decide whether the search query contains adult or inappropriate language that is unsafe for a child. Consider the query text in state.",
    criteria: {
      true: "The query contains profanity, slurs, vulgar language, crude sexual terms, or otherwise explicit adult language.",
      false: "The query uses clean, age-appropriate language with no profanity, slurs, or vulgar terms.",
    },
  },
  sexuality: {
    type: "noul",
    instructions:
      "Decide whether the search query seeks sexual content or is sexual in nature. Consider the query text in state.",
    criteria: {
      true: "The query seeks sexual content, sexual solicitation, nudity, pornography, or is sexual in nature.",
      false: "The query has no sexual content, solicitation, nudity, or sexual intent; it is age-appropriate.",
    },
  },
  immodesty: {
    type: "noul",
    instructions:
      "Decide whether the search query seeks immodest or sexualized presentation unsafe for a child. Consider the query text in state.",
    criteria: {
      true: "The query seeks immodest or revealing dress, nudity, or sexualized presentation of people.",
      false: "The query does not seek immodest, revealing, or sexualized presentation; it is modest and age-appropriate.",
    },
  },
};

const CATEGORIES = ["language", "sexuality", "immodesty"];
const QID_TO_CATEGORY = {
  adult_language: "language",
  sexuality: "sexuality",
  immodesty: "immodesty",
};

function fallback() {
  return {
    scores: { language: 0, sexuality: 0, immodesty: 0 },
    max: 0,
    top: "language",
    blocked: false,
    edge: false,
    provider: "fallback",
  };
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export async function classifySearch(env, query) {
  const apiKey = env?.TYPESAFE_API_KEY || "";
  if (!apiKey) return fallback();
  const q = String(query || "");
  if (!q.trim()) return fallback();
  try {
    const base = (
      env.TYPESAFE_API_BASE || "https://api.typesafe.ai"
    ).replace(/\/+$/, "");
    const model = env.JEV_MODEL || "jev-latest";
    const res = await fetch(base + "/v1/systemone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        model,
        state: { query: q },
        questions: QUESTIONS,
      }),
    });
    if (!res.ok) return fallback();
    const data = await res.json().catch(() => null);
    const answers = data?.answers;
    if (!answers || typeof answers !== "object") return fallback();
    const scores = { language: 0, sexuality: 0, immodesty: 0 };
    for (const [qid, category] of Object.entries(QID_TO_CATEGORY)) {
      const raw = answers?.[qid]?.noul;
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        // Malformed (missing/non-numeric noul) -> fail open.
        return fallback();
      }
      scores[category] = clamp01(raw);
    }
    let top = CATEGORIES[0];
    let max = scores[top];
    for (const c of CATEGORIES) {
      if (scores[c] > max) {
        max = scores[c];
        top = c;
      }
    }
    return {
      scores,
      max,
      top,
      blocked: max >= BLOCK_THRESHOLD,
      edge: max >= EDGE_THRESHOLD && max < BLOCK_THRESHOLD,
      provider: "jev",
    };
  } catch {
    return fallback();
  }
}
