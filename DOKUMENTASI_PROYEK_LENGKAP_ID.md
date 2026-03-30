# Dokumentasi Proyek Lengkap AiToEarn (ID)

Dokumen ini menjadi peta utama monorepo `AiToEarn` untuk kebutuhan engineering, operasi, dan handover.

## 1) Ringkasan Arsitektur

Monorepo terdiri dari 3 domain utama:

- `project/aitoearn-web`  
  Frontend web (Next.js) untuk UI publishing, AI tools, manajemen profile Playwright, dsb.
- `project/aitoearn-backend`  
  Backend utama (Nx + NestJS + libs) yang berisi:
  - `apps/aitoearn-ai`: layanan AI (chat/image/video/agent/playwright bridge).
  - `apps/aitoearn-server`: layanan core produk (akun, channel, publish, content, credits, tools).
  - `apps/google-flow-playwright-worker`: worker browser automation untuk Google Flow.
  - `apps/google-flow-remote-browser`: Chrome remote + noVNC + CDP untuk login visual.
- `project/aitoearn-electron`  
  Aplikasi desktop + embedded server.

Topologi runtime utama (Docker):

- `aitoearn-nginx` (gateway, expose `8080`/`9000`)
- `aitoearn-web`
- `aitoearn-ai`
- `aitoearn-server`
- `google-flow-playwright-worker`
- `google-flow-remote-browser`
- `mongodb`
- `redis`
- `rustfs` (+ init)

## 2) Alur Request Utama

## 2.1 Alur AI dari Web ke Provider

1. User submit request AI dari `aitoearn-web`.
2. Web memanggil endpoint `/api/ai/*` via nginx.
3. `aitoearn-ai` memvalidasi request + memilih provider/model.
4. Untuk model browser-based (Google Flow), `aitoearn-ai` mendelegasikan ke `google-flow-playwright-worker`.
5. Worker menjalankan automation browser, polling status task.
6. Hasil (`outputUrl`/status) disimpan/diteruskan kembali ke web.

## 2.2 Alur Google Flow Playwright

1. Buat/ambil `profile`.
2. Login flow:
   - `login/open` buka noVNC browser remote.
   - user login/challenge.
   - `login/resume` verifikasi session authenticated.
3. Generate:
   - `POST /v1/image/generate` atau `/v1/video/generate`.
   - Worker menjalankan task async (`queued -> processing -> succeeded|failed`).
4. Polling:
   - `GET /v1/tasks/:taskId`.

Detail operasional Playwright ada di:
- [DOKUMENTASI_DEBUG_PLAYWRIGHT_GOOGLE_FLOW_ID.md](/opt/AiToEarn/DOKUMENTASI_DEBUG_PLAYWRIGHT_GOOGLE_FLOW_ID.md)

## 3) Struktur Direktori Penting

- `/opt/AiToEarn/docker-compose.yaml`  
  Orkestrasi service lokal/server.
- `/opt/AiToEarn/nginx/nginx.conf`  
  Routing gateway.
- `/opt/AiToEarn/project/aitoearn-web/src/api`  
  API layer frontend.
- `/opt/AiToEarn/project/aitoearn-backend/apps/aitoearn-ai/src/core`  
  Domain AI + agent + internal API.
- `/opt/AiToEarn/project/aitoearn-backend/apps/aitoearn-server/src/core`  
  Domain social account/publish/content/tools.
- `/opt/AiToEarn/project/aitoearn-backend/libs`  
  Shared libraries (mongodb, auth, queue, assets, dsb).
- `/opt/AiToEarn/skills`  
  Skill internal project untuk agent workflow.

## 4) Inventory API (Lengkap)

Inventory endpoint diekstrak otomatis dari source controller.

- `aitoearn-ai` (87 endpoint):
  - [docs/API_INVENTORY_AITOEARN_AI_ID.md](/opt/AiToEarn/docs/API_INVENTORY_AITOEARN_AI_ID.md)
- `aitoearn-server` (315 endpoint):
  - [docs/API_INVENTORY_AITOEARN_SERVER_ID.md](/opt/AiToEarn/docs/API_INVENTORY_AITOEARN_SERVER_ID.md)

Endpoint worker Playwright (Express) yang aktif:

- `GET /health`
- `POST /v1/profiles`
- `GET /v1/profiles`
- `GET /v1/profiles/:id`
- `POST /v1/profiles/:id/login/start`
- `POST /v1/profiles/:id/login/open`
- `POST /v1/profiles/:id/login/credentials`
- `GET /v1/profiles/:id/login/status`
- `POST /v1/profiles/:id/login/resume`
- `POST /v1/profiles/:id/login/reset`
- `GET /v1/profiles/:id/debug`
- `POST /v1/image/generate`
- `POST /v1/video/generate`
- `GET /v1/tasks/:taskId`
- Legacy shim:
  - `GET /v1/auth/login-url`
  - `GET /v1/auth/session-status`
  - `POST /v1/auth/relogin`

## 5) Alur AI per Domain

## 5.1 Chat AI

- Endpoint utama: `/ai/chat`, `/ai/chat/stream`, `/ai/chat/claude`, `/ai/models/chat`.
- Stream harus menjaga kompatibilitas format event.

## 5.2 Image AI

- Endpoint utama:
  - `/ai/models/image/generation`
  - `/ai/image/generate`
  - `/ai/image/generate/async`
  - `/ai/image/task/:logId`
- Provider dapat melibatkan Pollinations/Google Flow/browser flow sesuai konfigurasi model.

## 5.3 Video AI

- Endpoint utama:
  - `/ai/models/video/generation`
  - `/ai/video/generations`
  - `/ai/video/generations/:taskId`
  - `/ai/video/generations` (list)
- Integrasi khusus:
  - `/ai/openai/videos*`
  - `/ai/volcengine/video*`
  - Google Flow browser mode (via Playwright worker).

## 5.4 Draft Generation

- Endpoint utama: `/ai/draft-generation/*`.
- Menangani generation metadata/caption/material draft termasuk pricing/stats/query.

## 5.5 Agent

- Endpoint utama: `/agent/tasks*`.
- Mendukung lifecycle task, message retrieval, abort, favorite, rating, share token.

## 6) Konfigurasi dan ENV Kritis

Contoh domain penting:

- Infrastruktur:
  - `MONGODB_*`, `REDIS_*`, `JWT_SECRET`, `INTERNAL_TOKEN`
- AI provider:
  - `OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`, `GROQ_*`, `VOLCENGINE_*`
- Pollinations:
  - `POLLINATIONS_IMAGE_BASE_URL`
  - `POLLINATIONS_VIDEO_BASE_URL`
  - `POLLINATIONS_APP_URL`
  - `POLLINATIONS_SECRET_KEY`, `POLLINATIONS_PUBLISHABLE_KEY`
- Google Flow browser bridge:
  - `GOOGLE_FLOW_BROWSER_BASE_URL`
  - `GOOGLE_FLOW_BROWSER_*_PATH`
  - `PLAYWRIGHT_CREDENTIALS_SECRET`
- Worker Playwright:
  - `GOOGLE_FLOW_HEADLESS`
  - `GOOGLE_FLOW_REMOTE_CDP_URL`
  - `GOOGLE_FLOW_REMOTE_LOGIN_OPEN_URL`
  - `GOOGLE_FLOW_REMOTE_LOGIN_PUBLIC_URL`
  - `GOOGLE_FLOW_ACTION_TIMEOUT_MS`
  - `GOOGLE_FLOW_DEBUG_EXPORT_DIR`

## 7) Operasional Harian

Command penting:

```bash
# Build + up service utama
docker compose build
docker compose up -d

# Cek status container
docker compose ps

# Cek log
docker logs -f aitoearn-ai
docker logs -f aitoearn-server
docker logs -f google-flow-playwright-worker
docker logs -f google-flow-remote-browser
```

Untuk verifikasi API cepat:

```bash
# contoh endpoint health internal worker
docker exec google-flow-playwright-worker sh -lc 'wget -qO- http://127.0.0.1:4310/health'
```

## 8) Testing Minimum (Disarankan)

- Perubahan dokumentasi:
  - validasi path/link file.
- Perubahan frontend:
  - lint + type-check + smoke UI fitur terdampak.
- Perubahan backend:
  - unit/integration test modul terdampak.
  - verifikasi endpoint penting dengan contoh request nyata.
- Perubahan kontrak API/SSE:
  - validasi shape response/event di sisi web/electron.

## 9) Mekanisme Update Dokumentasi

Jika ada penambahan endpoint/controller:

1. Regenerate inventory API.
2. Update dokumen utama ini jika ada flow/arsitektur berubah.
3. Update skill index bila ada workflow baru.

Contoh regenerate inventory:

```bash
node scripts/generate-api-inventory.mjs
```

Jika script belum ada, gunakan extractor one-off yang membaca `*.controller.ts` seperti proses dokumentasi ini.

