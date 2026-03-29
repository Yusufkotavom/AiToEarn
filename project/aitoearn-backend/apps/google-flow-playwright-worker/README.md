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
- `GOOGLE_FLOW_USER_DATA_DIR` default `/tmp/google-flow-user-data`
- `GOOGLE_FLOW_HEADLESS` default `false`
- `GOOGLE_FLOW_ACTION_TIMEOUT_MS` default `120000`
- `GOOGLE_FLOW_TASK_TTL_MS` default `86400000`

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
- `POST /v1/image/generate`
- `POST /v1/video/generate`
- `GET /v1/tasks/:taskId`

All endpoints accept `Authorization: Bearer <GOOGLE_FLOW_WORKER_API_KEY>` when key is configured.
