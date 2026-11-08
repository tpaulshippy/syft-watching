// Server-side Jev (TypeSafe System One) kid-safety moderation.
// ONE System One call scores the search query AND every result title.
// Fail OPEN throughout: missing key, error, timeout, or malformed -> keep everything.
export const EDGE_THRESHOLD = 0.6;
export const BLOCK_THRESHOLD = 0.85;
// Immodesty terms (swimwear, revealing clothing) score lower than explicit
// language/sexuality but still merit parent review — hence lower cutoffs.
export const IMMODESTY_EDGE_THRESHOLD = 0.3;
export const IMMODESTY_BLOCK_THRESHOLD = 0.7;

const TRUE_FALSE = {
  adult_language: {
    true: "The query contains profanity, slurs, vulgar language, crude sexual terms, or otherwise explicit adult language.",
    false: "The query uses clean, age-appropriate language with no profanity, slurs, or vulgar terms.",
  },
  sexuality: {
    true: "The query seeks sexual content, sexual solicitation, nudity, pornography, or is sexual in nature.",
    false: "The query has no sexual content, solicitation, nudity, or sexual intent; it is age-appropriate.",
  },
  immodesty: {
    true: "The query seeks immodest or revealing dress, swimwear/swimsuits/bikinis, nudity, or sexualized presentation of people.",
    false: "The query does not seek immodest, revealing, or sexualized presentation; it is modest and age-appropriate.",
  },
};

const QUERY_QUESTIONS = {
  adult_language: {
    type: "noul",
    instructions:
      "Decide whether the search query contains adult or inappropriate language that is unsafe for a child. Consider the query text in state.",
    criteria: {
      true: TRUE_FALSE.adult_language.true,
      false: TRUE_FALSE.adult_language.false,
    },
  },
  sexuality: {
    type: "noul",
    instructions:
      "Decide whether the search query seeks sexual content or is sexual in nature. Consider the query text in state.",
    criteria: {
      true: TRUE_FALSE.sexuality.true,
      false: TRUE_FALSE.sexuality.false,
    },
  },
  immodesty: {
    type: "noul",
    instructions:
      "Decide whether the search query seeks immodest or sexualized presentation unsafe for a child. Consider the query text in state.",
    criteria: {
      true: TRUE_FALSE.immodesty.true,
      false: TRUE_FALSE.immodesty.false,
    },
  },
};

function itemQuestions(i, title) {
  const t = String(title || "").slice(0, 200);
  const focus = `Consider ONLY this search result title (result ${i}): "${t}". `;
  return {
    [`item_${i}_adult_language`]: {
      type: "noul",
      instructions:
        focus + "Decide whether the title contains adult or inappropriate language that is unsafe for a child.",
      criteria: {
        true: "The title contains profanity, slurs, vulgar language, crude sexual terms, or otherwise explicit adult language.",
        false: "The title uses clean, age-appropriate language with no profanity, slurs, or vulgar terms.",
      },
    },
    [`item_${i}_sexuality`]: {
      type: "noul",
      instructions:
        focus + "Decide whether the title describes, depicts, or promotes sexual content unsafe for a child.",
      criteria: {
        true: "The title describes, depicts, or promotes sexual content, sexual solicitation, nudity, pornography, or sexualized presentation.",
        false: "The title has no sexual content, solicitation, nudity, or sexualized presentation; it is age-appropriate.",
      },
    },
    [`item_${i}_immodesty`]: {
      type: "noul",
      instructions:
        focus + "Decide whether the title describes or depicts immodest presentation unsafe for a child.",
      criteria: {
        true: "The title describes or depicts immodest or revealing dress, swimwear/swimsuits/bikinis, nudity, or sexualized presentation of people.",
        false: "The title does not describe immodest, revealing, or sexualized presentation; it is modest and age-appropriate.",
      },
    },
  };
}

function cleanVerdict() {
  return {
    scores: { language: 0, sexuality: 0, immodesty: 0 },
    max: 0,
    top: "language",
    blocked: false,
    edge: false,
  };
}

function clamp01(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function judge(scores) {
  let top = "language";
  let max = scores.language;
  for (const c of ["sexuality", "immodesty"]) {
    if (scores[c] > max) {
      max = scores[c];
      top = c;
    }
  }
  const blocked =
    scores.language >= BLOCK_THRESHOLD ||
    scores.sexuality >= BLOCK_THRESHOLD ||
    scores.immodesty >= IMMODESTY_BLOCK_THRESHOLD;
  const edge =
    !blocked &&
    (scores.language >= EDGE_THRESHOLD ||
      scores.sexuality >= EDGE_THRESHOLD ||
      scores.immodesty >= IMMODESTY_EDGE_THRESHOLD);
  return { scores, max, top, blocked, edge };
}

export async function classifySearchAndResults(env, query, titles) {
  const list = (Array.isArray(titles) ? titles : []).map((t) => String(t || "").slice(0, 200));
  const fallback = (why) => {
    // Visible in Functions logs; never includes secrets. Query text is
    // redacted to length only so kid searches stay out of logs.
    try { console.error("jev moderation fallback: " + why + " (qlen " + q0len + ")"); } catch { /* ignore */ }
    return {
      query: cleanVerdict(),
      items: list.map(cleanVerdict),
      provider: "fallback",
    };
  };
  const apiKey = env?.TYPESAFE_API_KEY || "";
  const q = String(query || "");
  const q0len = q.length;
  if (!apiKey) return fallback("missing TYPESAFE_API_KEY");
  if (!q.trim()) return fallback("empty query");
  try {
    const base = (env.TYPESAFE_API_BASE || "https://api.typesafe.ai").replace(/\/+$/, "");
    const model = env.JEV_MODEL || "jev-latest";
    const questions = { ...QUERY_QUESTIONS };
    list.forEach((t, i) => Object.assign(questions, itemQuestions(i, t)));
    const res = await fetch(base + "/v1/systemone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model,
        state: { query: q, results: list },
        questions,
      }),
    });
    if (!res.ok) return fallback("http " + res.status);
    const data = await res.json().catch(() => null);
    const answers = data?.answers;
    if (!answers || typeof answers !== "object") return fallback("malformed answers");
    const qScores = {
      language: clamp01(answers.adult_language?.noul),
      sexuality: clamp01(answers.sexuality?.noul),
      immodesty: clamp01(answers.immodesty?.noul),
    };
    if (qScores.language === null || qScores.sexuality === null || qScores.immodesty === null) {
      return fallback("malformed query scores");
    }
    const items = list.map((_, i) => {
      const s = {
        language: clamp01(answers[`item_${i}_adult_language`]?.noul),
        sexuality: clamp01(answers[`item_${i}_sexuality`]?.noul),
        immodesty: clamp01(answers[`item_${i}_immodesty`]?.noul),
      };
      // Per-item fail-open: a malformed item verdict keeps that result.
      if (s.language === null || s.sexuality === null || s.immodesty === null) return cleanVerdict();
      return judge(s);
    });
    return { query: judge(qScores), items, provider: "jev" };
  } catch (err) {
    return fallback("fetch error: " + (err && err.name ? err.name : "unknown"));
  }
}
