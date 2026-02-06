# Syft Watching: Parental-Controlled YouTube Access for Teens

## Overview
Syft Watching is a web application that lets parents grant teens access to YouTube content on a strict allowlist of channels. Teens can browse and watch videos only from channels that a parent has preselected and approved. No other channels or recommendations are accessible through the app.

## Key features
- Per-teen channel allowlists controlled by parents
- YouTube embedded experience limited to approved channels
- Simple parent/teen account model with clear permission boundaries
- Audit logs of viewing activity (who watched what and when)
- Optional time-based access windows and pause/unpause controls

## What it is not
- Syft Watching does not remove YouTube policies or bypass YouTube access controls; it simply restricts what the app can surface to teens within the app.

## Tech stack (example)
- Frontend: React + TypeScript, YouTube IFrame Player API
- Backend: Node.js + Express (or Nest), TypeScript
- Database: PostgreSQL
- Auth: OAuth2 for YouTube account linkage; JSON Web Tokens for sessions
- Hosting: Docker Compose (local) / Kubernetes (production)

## Getting started (local development)
### Prereqs
- Node.js >= 18
- PostgreSQL (or a Dockerized PostgreSQL instance)
- YouTube Data API credentials (OAuth client) for parent account

### Install and run
1) Clone the repo
2) Install dependencies in both frontend and backend if the project is split
3) Create a .env file (example shown below)
4) Start the app (commands depend on your setup, e.g. docker-compose up or npm run dev)

### Environment variables (example)
```bash
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/syft_watching
YOUTUBE_CLIENT_ID=your-youtube-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
APP_BASE_URL=http://localhost:3000
```

### Usage overview
- Parent flow:
  1. Sign up / log in as a parent.
  2. Connect a YouTube account via OAuth (required to read channel data).
  3. Create a teen profile and assign channels to the teen's allowlist.
  4. Share the teen URL with the teen; they sign in and can only view videos from allowed channels.
- Teen flow:
  1. Open the teen URL and sign in.
  2. Browse or search only within the approved channels.
  3. Watch videos via the embedded YouTube player restricted to allowed channels.

## API overview (high level)
- POST /parents: create a parent account
- POST /parents/:parentId/teens: create a new teen profile
- POST /teens/:teenId/channels: set or update the allowlist for a teen
- GET /teens/:teenId/channels: fetch the allowlisted channels for a teen
- GET /health: health check
- POST /auth/youtube: initiate YouTube OAuth flow for the parent
- GET /auth/youtube/callback: YouTube OAuth callback to exchange code for tokens
- GET /teens/:teenId/accessible-videos: fetch videos from allowed channels (via YouTube Data API)

## Data model (simplified)
- Parents(id, email, name, created_at)
- Teens(id, parent_id, name, pin, created_at, last_seen)
- Channels(id, youtube_channel_id, title, url, thumbnail_url)
- Allowlist(teen_id, channel_id, added_at)
- ViewLogs(id, teen_id, video_id, viewed_at, duration)

## Security and privacy notes
- Access is strictly confined to approved channels within Syft Watching.
- Do not ingest or store personal data beyond what is needed for authentication and access control.
- Follow best practices for OAuth token storage and rotation.
- Consider COPPA and local privacy regulations when deploying for families.

## Deployment considerations
- For production, prefer a secure, private database (not localhost) and TLS termination.
- Use a reverse proxy and properly configure CORS for frontend-backend communication.
- Implement rate limiting and monitoring for abuse prevention.

## Project layout (illustrative)
- frontend/
- backend/
- server/
- docs/
- .env.example

## Running tests and checks
- Run unit tests for both frontend and backend
- Run integration tests for the end-to-end parent-teens flow

## Contributing
- Please open issues for feature requests and bug reports.
- Bug reports and feature requests.
- Submit PRs with concise messages focusing on the why and what changed.

## License
- MIT

## For more information
- Contact the project maintainers via the repository's contact details.
