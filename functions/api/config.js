// GET /api/config -> {"googleClientId": "<public OAuth client ID>"}
// Public value (used by the login button), safe to expose. Always 200.
export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({ googleClientId: env?.GOOGLE_CLIENT_ID || "" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
