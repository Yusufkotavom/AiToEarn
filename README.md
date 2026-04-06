# AiToEarn (no-AI / server-only)

This branch focuses on the **no-AI** experience and backend-only deployment. AI features are disabled in the UI and the AI service is not required.

## Scope

- Backend: `project/aitoearn-backend` (NestJS, Nx)
- Web: `project/aitoearn-web` (Next.js) — optional, can be deployed separately (e.g. Vercel)
- Electron: `project/aitoearn-electron` — out of scope for no-AI deploy

## What Works in no-AI Mode

- Multi-platform publishing workflow
- Accounts and channel management
- Content scheduling
- Drafts and publishing
- Drive Explorer (server-side endpoints)

## Quick Start (Docker, no-AI)

Use the provided compose file:

```
docker compose -f docker-compose.no-ai.yaml build
docker compose -f docker-compose.no-ai.yaml up -d
```

## Deployment (Render + Atlas + Upstash)

This repo includes a `render.yaml` blueprint for backend-only deployment. It assumes:

- MongoDB Atlas (free tier)
- Upstash Redis (free tier)
- External S3-compatible storage (e.g. Cloudflare R2)

### Required Env Vars (Backend)

- `MONGODB_URI` (Atlas connection string)
- `MONGODB_CHANNEL_URI` (optional, separate DB)
- `REDIS_URL` (Upstash `rediss://` URL)
- `SERVER_ASSETS_CONFIG` (S3/R2 JSON config)
- `APP_DOMAIN` (API domain)
- `JWT_SECRET`, `INTERNAL_TOKEN`

### Frontend (Optional, Vercel)

If you deploy the frontend separately, set:

- `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
- `NEXT_PUBLIC_APP_URL=https://api.yourdomain.com`
- `NEXT_PUBLIC_DISABLE_AI=1`

## Files and Docs

- Agent guide: `AGENTS.md`
- Indonesian technical docs: `DOKUMENTASI_PROYEK_ID.md`

## Notes

- Nginx is not required on Render. Use direct backend service routing.
- RustFS local storage is not recommended on free tiers. Use S3/R2.

