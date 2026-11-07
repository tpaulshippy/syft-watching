# Syft Watching

Kid-friendly search page for YouTube + Disney+. Google login required, no build step, no dependencies.

## Auth (Google login)

`GET /api/search` and `POST /api/notify` require
`Authorization: Bearer <Google ID token>`. The token is verified server-side
(RS256 against `https://www.googleapis.com/oauth2/v3/certs`, issuer
`https://accounts.google.com` / `accounts.google.com`, mandatory-future `exp`,
audience = our client ID). Missing/invalid tokens get
401 `{"error":"login required"}`.

`GET /api/config` → `{"googleClientId": "<client ID>"}` (always 200; public
value used by the login button).

Required Pages env var (dashboard → Settings → Environment variables):

- `GOOGLE_CLIENT_ID` (OAuth client ID; audience check + served by `/api/config`)

## How search → watch → allow works

1. Kid picks a tab (**YouTube** / **Disney+**) and searches.
2. Results show cards with a prominent **▶ Watch** button linking straight to the play URL in a new tab.
3. The home network only allows approved pages — if a page is blocked, the kid clicks **✉️ Ask Dad**, which opens an email to Dad with the title + link.
4. Dad allows that page on the router/filter, and the kid can watch.

## Configure the email address

In `public/index.html`, edit the constant near the top of the `<script>`:

```js
const DAD_EMAIL = "dad@example.com";
```

Change it to Dad's real email address.

## Deploy (GitHub → Cloudflare Pages)

Push to `main` triggers `.github/workflows/deploy.yml` (wrangler-action).

Required GitHub secrets (repo Settings → Secrets → Actions):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Pages project name: `syft-watching` (serves `public/` + `functions/`).

## API

- `GET /api/search?q=` → `{"results":[{"source":"youtube"|"disney","title","year","type","thumbnail","watchUrl"}]}`
  (combined YouTube + Disney results, ranked exact > prefix > substring with a
  Disney+ bump, deduped by watchUrl, capped at 20, cached 1h).
  Requires Google login (401 `{"error":"login required"}` without a valid Bearer token).
- `GET /api/config` → `{"googleClientId": "<client ID>"}` (always 200).
- `POST /api/notify` with JSON `{"title","url","source"}` → sends a
  `<FirstName> watched: <title>` email via Resend, where `<FirstName>` is the
  verified Google token's first name (fallback: part of the verified email
  before `@`, then `"Someone"` — never a client-sent name). Returns
  `{ok:true, id}` on success, 401 without a valid Bearer token,
  or 503 `{"error":"email not configured"}` when no API key is set.

The old `GET /api/youtube` and `GET /api/disney` endpoints are deleted
(superseded by gated `/api/search`; they must not remain as ungated bypasses).

## Email notifications (Resend)

Required Pages secret:

```sh
echo $KEY | npx wrangler pages secret put RESEND_API_KEY --project-name=syft-watching
```

Optional Pages vars (dashboard → Settings → Environment variables):

- `DAD_EMAIL` (required — Dad's address; no default in code)
- `FROM_EMAIL` (default `Syft Watching <onboarding@resend.dev>`)
- `GOOGLE_CLIENT_ID` (required — Google OAuth client ID for login; see Auth above)

Note: JustWatch HTML (`justwatch.com/us/search`) is the Disney play-URL resolver —
Disney+ browse entity UUIDs scraped from it become `disneyplus.com/play/<uuid>` links.
iTunes Search and TVMaze only supply metadata/posters (plus Disney+ search-page links).

## Custom domain

`watch.syftlearning.app` — in the Cloudflare dashboard go to the Pages project → Custom domains → Set up a custom domain → enter `watch.syftlearning.app`, then add the shown record where DNS is managed.

## Local preview

```sh
node server.js   # serves public/ at http://localhost:8080
npm run check    # node --check on functions + server
```

Note: `/api/*` Pages Functions only run on Cloudflare Pages, not the local preview server.
