// Google ID-token verification (RS256, JWKS) — port of bots/worker/src/oauth.ts
// (verifyRs256 + verifyGoogleIdToken). No dependencies; uses WebCrypto.
// GOOGLE_CLIENT_ID comes from env only (aud check). JWKS cached 12h.
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_TTL_MS = 12 * 3600 * 1000;

let jwksCache = null; // { keys, fetchedAt }

function b64urlDecodeToBytes(s) {
  const norm = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlDecodeJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(s)));
}

async function getJwks() {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const resp = await fetch(JWKS_URI);
  if (!resp.ok) throw new Error("JWKS fetch failed: " + resp.status);
  const jwks = await resp.json();
  const keys = jwks?.keys ?? [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyRs256(jwt) {
  const parts = String(jwt).split(".");
  if (parts.length !== 3) return null;
  let header;
  try {
    header = b64urlDecodeJson(parts[0]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  let keys;
  try {
    keys = await getJwks();
  } catch {
    return null;
  }
  const candidates = keys.filter((k) => !header.kid || k.kid === header.kid);
  let sig;
  try {
    sig = b64urlDecodeToBytes(parts[2]);
  } catch {
    return null;
  }
  const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
  for (const key of candidates) {
    try {
      const ck = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", ck, sig, data)) {
        return b64urlDecodeJson(parts[1]);
      }
    } catch {
      // try next key
    }
  }
  return null;
}

function tokenExpiryOk(payload) {
  // exp is mandatory: a token without (numeric, future) expiry is rejected.
  return typeof payload?.exp === "number" && payload.exp * 1000 > Date.now();
}

export async function verifyGoogleIdToken(env, idToken) {
  if (!idToken) return null;
  const payload = await verifyRs256(idToken);
  if (!payload) return null;
  const iss = payload.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") return null;
  if (!tokenExpiryOk(payload)) return null;
  const aud = env?.GOOGLE_CLIENT_ID ?? "";
  const tokenAud = payload.aud;
  const audOk = Array.isArray(tokenAud) ? tokenAud.includes(aud) : tokenAud === aud;
  if (!audOk || typeof payload.sub !== "string") return null;
  if (typeof payload.email !== "string" || !payload.email) return null;
  return { sub: payload.sub, email: payload.email, firstName: String(payload.given_name ?? "") };
}

export function getBearerToken(request) {
  const h = request?.headers?.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
