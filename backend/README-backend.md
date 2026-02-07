Backend skeleton (Sinatra) for Syft Watching

This lightweight backend scaffold is a placeholder to help you start building the APIs described in the README. It mirrors the endpoints but does not implement full business logic.

How to run locally (assuming Ruby is installed):
- cd backend
- bundle install
- ruby app.rb   # or rackup if using config.ru

Endpoints (mock responses):
- POST /parents
- POST /parents/:parentId/teens
- POST /teens/:teenId/channels
- GET /teens/:teenId/channels
- GET /health
- POST /auth/youtube
- GET /auth/youtube/callback
- GET /teens/:teenId/accessible-videos
