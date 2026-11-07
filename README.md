# Syft Watching

Kid-friendly search page for YouTube + Disney+. No login, no build step, no dependencies.

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
- `GET /api/youtube?q=` → YouTube-only results (`videoId/title/channel/thumbnail/watchUrl`).
- `GET /api/disney?q=` → Disney+-oriented results (`title/year/type/thumbnail/browseUrl/playUrl`).
- `POST /api/notify` with JSON `{"title","url","source"}` → sends a
  `Judah watched: <title>` email via Resend. Returns `{ok:true, id}` on success,
  or 503 `{"error":"email not configured"}` when no API key is set.

## Email notifications (Resend)

Required Pages secret:

```sh
echo $KEY | npx wrangler pages secret put RESEND_API_KEY --project-name=syft-watching
```

Optional Pages vars (dashboard → Settings → Environment variables):

- `DAD_EMAIL` (default `pshippy@gmail.com`)
- `FROM_EMAIL` (default `Syft Watching <onboarding@resend.dev>`)

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
