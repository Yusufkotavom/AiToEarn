# Google Flow Playwright Worker

Relay worker for Google Flow browser automation (image/video generation).

## Run

```bash
cd project/aitoearn-backend/apps/google-flow-playwright-worker
pnpm install
pnpm start
```

## Environment variables

- `PORT` default `4310`
- `GOOGLE_FLOW_WORKER_API_KEY` bearer key for backend relay auth
- `GOOGLE_FLOW_URL` default `https://labs.google/fx/tools/flow`
- `GOOGLE_FLOW_PROFILES_ROOT_DIR` default `/tmp/google-flow-profiles`
- `GOOGLE_FLOW_HEADLESS` default `true`
- `GOOGLE_FLOW_ACTION_TIMEOUT_MS` default `120000`
- `GOOGLE_FLOW_TASK_TTL_MS` default `86400000`
- `GOOGLE_FLOW_DEFAULT_PROFILE_ID` default `legacy-default`
- `GOOGLE_FLOW_LOGIN_SNAPSHOT_ENABLED` default `true`

Optional selector overrides:

- `GOOGLE_FLOW_SELECTOR_PROMPT`
- `GOOGLE_FLOW_SELECTOR_SUBMIT`
- `GOOGLE_FLOW_SELECTOR_IMAGE_OUTPUT`
- `GOOGLE_FLOW_SELECTOR_VIDEO_OUTPUT`
- `GOOGLE_FLOW_SELECTOR_LOGIN_MARKER`

## API

- `GET /health`
- `GET /v1/auth/login-url`
- `GET /v1/auth/session-status`
- `POST /v1/auth/relogin`
- `POST /v1/profiles`
- `GET /v1/profiles`
- `GET /v1/profiles/:id`
- `POST /v1/profiles/:id/login/start`
- `GET /v1/profiles/:id/login/status`
- `POST /v1/profiles/:id/login/resume`
- `POST /v1/profiles/:id/login/reset`
- `GET /v1/profiles/:id/debug`
- `POST /v1/image/generate`
- `POST /v1/video/generate`
- `GET /v1/tasks/:taskId`

`/v1/auth/*` is kept as a legacy compatibility shim (single default profile).

All endpoints accept `Authorization: Bearer <GOOGLE_FLOW_WORKER_API_KEY>` when key is configured.
