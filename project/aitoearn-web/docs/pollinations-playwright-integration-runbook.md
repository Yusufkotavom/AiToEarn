# Pollinations + Playwright Integration Runbook

Dokumen ini merangkum implementasi integrasi:
- Pollinations (image + video),
- Google Flow via Playwright relay (image + video),
- perubahan backend/frontend/env/docker-compose,
- dan langkah verifikasi end-to-end.

## 1) Ringkasan Implementasi

### 1.1 Pollinations
- Provider Pollinations sudah disesuaikan ke `gen.pollinations.ai`.
- Mapping model image:
  - `pollinations-flux` -> `flux`
  - `pollinations-gptimage` -> `gptimage`
  - `pollinations-zimage` -> `zimage`
  - alias legacy: `pollinations-imagen` -> `zimage`
- Mapping model video:
  - `pollinations-veo` -> `veo`
  - `pollinations-seedance` -> `seedance`
  - alias legacy: `pollinations-veo-3.1` -> `veo`
- Kontrak endpoint existing tetap dipakai (`/ai/image/*`, `/ai/video/*`).

### 1.2 Playwright (Google Flow Relay)
- Ditambahkan jalur provider terpisah (bukan fallback):
  - image: `google-flow-browser-image`
  - video: `google-flow-browser-video`
- Backend `aitoearn-ai` tidak menjalankan browser langsung.
- Backend memanggil relay worker internal via HTTP (service `google-flow-playwright-worker`).
- Session login Google Flow dikelola worker Playwright dengan persistent profile.

### 1.3 UI Frontend
- Model manual baru muncul di dialog publish AI:
  - `google-flow-browser-image`
  - `google-flow-browser-video`
- Ditambahkan notice bahwa model tersebut memakai Google Flow via Playwright relay.

## 2) Endpoint Baru

Endpoint manajemen sesi Google Flow di backend AI:
- `GET /ai/google-flow/login-url`
- `GET /ai/google-flow/session-status`
- `POST /ai/google-flow/relogin`

Catatan:
- Endpoint ini meneruskan ke relay worker.
- Tujuan: memudahkan login/relogin tanpa mengubah kontrak endpoint generate media yang sudah ada.

## 3) Konfigurasi Environment

## 3.1 Pollinations (backend AI)
- `POLLINATIONS_IMAGE_BASE_URL` (default: `https://gen.pollinations.ai/image`)
- `POLLINATIONS_VIDEO_BASE_URL` (default: `https://gen.pollinations.ai/video`)
- `POLLINATIONS_APP_URL`
- `POLLINATIONS_SECRET_KEY`
- `POLLINATIONS_PUBLISHABLE_KEY`

## 3.2 Relay Google Flow (backend AI -> worker)
- `GOOGLE_FLOW_BROWSER_BASE_URL` (default compose: `http://google-flow-playwright-worker:4310`)
- `GOOGLE_FLOW_BROWSER_API_KEY`
- `GOOGLE_FLOW_BROWSER_TIMEOUT_MS`
- `GOOGLE_FLOW_BROWSER_IMAGE_PATH` (`/v1/image/generate`)
- `GOOGLE_FLOW_BROWSER_VIDEO_PATH` (`/v1/video/generate`)
- `GOOGLE_FLOW_BROWSER_TASK_STATUS_PATH` (`/v1/tasks/{taskId}`)
- `GOOGLE_FLOW_BROWSER_LOGIN_URL_PATH` (`/v1/auth/login-url`)
- `GOOGLE_FLOW_BROWSER_SESSION_STATUS_PATH` (`/v1/auth/session-status`)
- `GOOGLE_FLOW_BROWSER_RELOGIN_PATH` (`/v1/auth/relogin`)

## 3.3 Worker Playwright
- `GOOGLE_FLOW_WORKER_PORT` (default `4310`)
- `GOOGLE_FLOW_WORKER_API_KEY`
- `GOOGLE_FLOW_URL` (default `https://labs.google/fx/tools/flow`)
- `GOOGLE_FLOW_USER_DATA_DIR` (default `/data/google-flow-user-data`)
- `GOOGLE_FLOW_HEADLESS` (default `false`)
- `GOOGLE_FLOW_ACTION_TIMEOUT_MS` (default `120000`)
- `GOOGLE_FLOW_TASK_TTL_MS` (default `86400000`)

## 4) Perubahan Docker Compose

Ditambahkan service:
- `google-flow-playwright-worker`

Karakteristik:
- image build dari `project/aitoearn-backend/apps/google-flow-playwright-worker`
- volume persistent untuk profile login browser (`google-flow-user-data`)
- healthcheck `/health`
- `aitoearn-ai` sekarang `depends_on` worker ini (healthy)

## 5) Single Worker Queue Strategy

Worker Playwright memakai queue serial (single worker queue):
- task browser dieksekusi satu per satu,
- menghindari race pada session/profile yang sama,
- selaras dengan requirement runtime “single worker queue”.

## 6) Verifikasi End-to-End

## 6.1 Pollinations
1. Cek model list:
   - `GET /ai/models/image/generation` (harus ada model pollinations)
   - `GET /ai/models/video/generation` (harus ada model pollinations)
2. Generate image:
   - `POST /ai/image/generate/async` model `pollinations-flux`
   - Poll `GET /ai/image/task/:logId` sampai `success`
3. Generate video:
   - `POST /ai/video/generations` model `pollinations-veo`
   - Poll `GET /ai/video/generations/:taskId` sampai selesai

## 6.2 Playwright Google Flow
1. Cek login URL:
   - `GET /ai/google-flow/login-url`
2. Login Google di URL tersebut.
3. Cek sesi:
   - `GET /ai/google-flow/session-status` -> `loggedIn: true`
4. Generate image:
   - model `google-flow-browser-image`
5. Generate video:
   - model `google-flow-browser-video`
6. Jika perlu reset sesi:
   - `POST /ai/google-flow/relogin`

## 7) Daftar Perubahan Kode (High-Level)

### Backend AI
- Config:
  - `project/aitoearn-backend/apps/aitoearn-ai/src/config.ts`
  - `project/aitoearn-backend/apps/aitoearn-ai/config/config.js`
- Image:
  - `.../core/ai/image/image.service.ts`
  - `.../core/ai/image/image.module.ts`
- Video:
  - `.../core/ai/video/video.service.ts`
  - `.../core/ai/video/video-task-status.scheduler.ts`
  - `.../core/ai/video/video.module.ts`
- Channel enum:
  - `project/aitoearn-backend/libs/mongodb/src/enums/ai-log.enum.ts`
- Google Flow relay client:
  - `.../core/ai/libs/google-flow-browser/*`
- Google Flow auth endpoints:
  - `.../core/ai/google-flow/google-flow.controller.ts`
  - `.../core/ai/google-flow/google-flow.module.ts`

### Playwright Worker
- `project/aitoearn-backend/apps/google-flow-playwright-worker/src/server.mjs`
- `project/aitoearn-backend/apps/google-flow-playwright-worker/package.json`
- `project/aitoearn-backend/apps/google-flow-playwright-worker/Dockerfile`
- `project/aitoearn-backend/apps/google-flow-playwright-worker/README.md`

### Frontend
- `project/aitoearn-web/src/components/PublishDialog/compoents/PublishDialogAi.tsx`

### Deployment Config
- `docker-compose.yaml`
- `project/aitoearn-backend/.env.example`

## 8) Commit Referensi Integrasi

- `b9d31ec1` feat: align Pollinations integration with gen API and model mappings
- `8b5d2905` feat: add Google Flow Playwright relay models for image and video
- `94a90efc` feat: add Google Flow session endpoints and Playwright relay worker

## 9) Catatan Operasional

- Jangan commit secret key aktual ke repository.
- `POLLINATIONS_PUBLISHABLE_KEY` dan key relay worker harus diisi via env runtime/deployment.
- Jika build docker gagal karena lockfile, jalankan `pnpm install` pada `project/aitoearn-backend` lalu rebuild.
