# Dokumentasi Teknis Lengkap Proyek AiToEarn (Bahasa Indonesia)

Dokumen ini menyajikan ringkasan teknis menyeluruh terkait arsitektur, API, alur proses, data, dan komponen utama yang digunakan dalam repository **AiToEarn**.

> Cakupan dokumen ini berdasarkan kode sumber saat ini pada branch aktif repository.

---

## 1) Gambaran Umum Sistem

AiToEarn di repository ini adalah ekosistem multi-aplikasi dengan 3 pilar utama:

1. **Web App (Next.js)** — antarmuka pengguna berbasis browser untuk alur Agent, AI tools, channel management, dsb.
2. **Backend AI Service (NestJS + Nx Monorepo)** — API utama untuk chat, image, video, draft generation, material adaptation, agent SSE.
3. **Electron App + Embedded Server** — aplikasi desktop (legacy/enterprise flow) dengan server NestJS terpisah untuk modul operasi, akun, task, publish, finance, tools, dsb.

Secara fungsional, nilai utama platform adalah alur end-to-end:

**Create → Adapt → Publish → Engage → Monetize**.

---

## 2) Struktur Repository (High-Level)

- `project/aitoearn-web/` → Frontend web (Next.js 14 App Router).
- `project/aitoearn-backend/` → Backend Nx monorepo (NestJS app + shared libs).
- `project/aitoearn-electron/` → Desktop app (Electron + Vite + React) beserta server NestJS.
- `docker-compose.yaml` + `DOCKER_DEPLOYMENT_*.md` → deployment Docker.
- `README.md` + `README_EN.md` → dokumentasi umum produk.

---

## 3) Stack Teknologi yang Digunakan

## Frontend Web

- **Next.js 14**, React 18, TypeScript.
- State management: **Zustand**.
- UI: **Ant Design**, Radix UI, Tailwind/Sass.
- SSE client: `@microsoft/fetch-event-source`.
- E2E testing: **Playwright**.

## Backend AI (Nx)

- **NestJS** modular.
- **Nx** workspace orchestration.
- Validasi skema: **Zod**.
- Queue async: **BullMQ** melalui library internal queue.
- DB utama: **MongoDB** (berbagai schema repository pattern).
- Caching/pubsub/lock: **Redis** + Redlock.
- Integrasi model AI multi-provider: OpenAI, Gemini, Grok, Volcengine, Anthropic, AICSO.

## Electron

- **Electron + Vite + React**.
- Embedded NestJS server.
- Modul bisnis tambahan: task/reward/finance/publish/platform connectors.

---

## 4) Arsitektur API Backend AI (project/aitoearn-backend)

Aplikasi utama berada di:

- `apps/aitoearn-ai/src/main.ts`
- `apps/aitoearn-ai/src/app.module.ts`
- `apps/aitoearn-ai/src/config.ts`

### 4.1 Komposisi Module Utama

`AppModule` menggabungkan:

- Infrastructure: MongoDB, Queue, Redlock, Auth, Server Client, Assets.
- Domain modules: `AiModule`, `AgentModule`, `InternalModule`, `MaterialAdaptationModule`, `DraftGenerationModule`.

### 4.2 Middleware/Pipeline API

Melalui `libs/common/src/starter.ts`, pipeline server mencakup:

- global validation pipe (Zod),
- response interceptor,
- global exception filter,
- optional global prefix (`config.globalPrefix`),
- optional OpenAPI endpoint,
- health endpoint (`/health`) dan metrics setup.

---

## 5) Endpoint API Utama dan Logika Proses

> Catatan: path final dapat memiliki prefix global bila diaktifkan via konfigurasi environment.

## 5.1 Agent API (`/agent`)

### Endpoint penting

- `POST /agent/tasks` → membuat task konten berbasis Agent (SSE stream).
- `GET /agent/tasks` → list task (paging/filter).
- `GET /agent/tasks/:taskId` → detail task.
- `GET /agent/tasks/:taskId/messages` → polling incremental message pasca SSE putus.
- `PATCH /agent/tasks/:taskId` → update judul.
- `DELETE /agent/tasks/:taskId` → soft delete.
- `POST /agent/tasks/:taskId/abort` → abort task running via Redis pub/sub.
- `POST|DELETE /agent/tasks/:taskId/favorite` → favorite/unfavorite.
- `POST /agent/tasks/:taskId/rating` → rating saat status valid.
- `POST /agent/tasks/:taskId/share` + `GET /agent/tasks/shared/:token` → share publik berbasis token TTL.

### Alur logika inti

1. Client memanggil `POST /agent/tasks`.
2. Server menjalankan runtime `createContentGenerationTask(...)` dengan stream SSE.
3. Task disimpan sebagai `ContentGenerationTask`.
4. Saat abort, controller publish event ke channel Redis (`AGENT_TASK_ABORT_CHANNEL`) lalu runtime menghentikan task.
5. Untuk reliabilitas, scheduler/service melakukan recovery task `running` yang timeout menjadi `error`.

---

## 5.2 AI Chat API (`/ai/chat*`, `/ai/models/chat`)

- `GET /ai/models/chat` → daftar model chat yang tersedia.
- `POST /ai/chat` → chat non-stream.
- `POST /ai/chat/stream` → chat stream SSE.
- `POST /ai/chat/claude` → stream route khusus Claude flow.

Logika utama:

- Validasi input via DTO + Zod.
- Inject konteks user (`userId`, `userType`) ke service.
- Service memilih provider/model berdasarkan konfigurasi `config.ai.models.chat`.

---

## 5.3 AI Image API

- `GET /ai/models/image/generation`
- `GET /ai/models/image/edit`
- `POST /ai/image/generate`
- `POST /ai/image/edit`
- `POST /ai/image/generate/async`
- `POST /ai/image/edit/async`
- `GET /ai/image/task/:logId`

Logika utama:

- Mendukung mode sync dan async.
- Mode async menyimpan log task (AiLog) dan dipolling via endpoint status.
- Model parameter (size/style/quality/dll) disajikan dari konfigurasi model.

---

## 5.4 AI Video API

- `GET /ai/models/video/generation`
- `POST /ai/video/generations`
- `GET /ai/video/generations/:taskId`
- `GET /ai/video/generations`

Tambahan provider-specific:

- OpenAI video route: `/ai/openai/videos...`
- Volcengine video route: `/ai/volcengine/video...`

Logika utama:

- Eksekusi video generation berbasis model/prompt/input media.
- Task tracking + status query.
- Histori list per user.

---

## 5.5 Draft Generation API (`/ai/draft-generation`)

- `GET /stats` → statistik task generating.
- `GET /` → list paginated draft tasks.
- `POST /query` → batch query by task IDs.
- `GET /pricing` → pricing model draft.
- `GET /:id` → detail task.
- `POST /v2` → fixed pipeline draft generation (lebih ringan dari orchestrasi agent penuh).
- `POST /image-text` → draft generation mode image-text.

### Mekanisme async Draft Generation

1. Request membuat AiLog + enqueue BullMQ (`QueueName.DraftGeneration`).
2. `DraftGenerationConsumer` memproses job berdasar `version` (`v1`, `v2`, `v2-image-text`).
3. Service menjalankan pipeline generate (termasuk agent/MCP pada mode tertentu).
4. Hasil disimpan sebagai `material` dan status AiLog diupdate (`Success/Failed`).

---

## 5.6 Material Adaptation API (`/ai/material-adaptation`)

- `POST /` → adapt satu material ke multi-platform.
- `PATCH /:materialId/:platform` → update konten adaptasi.
- `DELETE /:materialId/:platform` → hapus adaptasi per platform.
- `DELETE /:materialId` → hapus semua adaptasi material.
- `GET /:materialId/:platform` → ambil adaptasi (dapat auto-generate bila belum ada).
- `GET /:materialId` → list adaptasi material.

Use case: menghasilkan title/desc/topics yang sesuai karakter platform tujuan.

---

## 5.7 Internal API (`/internal/*`)

Controller internal menyediakan endpoint antar-service, misalnya:

- internal chat completion,
- image generation/edit async,
- video generation/status/list,
- qrcode-art generation,
- model config retrieval.

Endpoint ini diproteksi dengan decorator internal auth (`@Internal()`).

---

## 6) Alur End-to-End: Dari Prompt Hingga Konten

Contoh alur “Agent task + publish-ready output”:

1. User kirim prompt dari web.
2. Web membuka SSE ke `/agent/tasks`.
3. Backend Agent runtime mengeksekusi reasoning + tool calls (MCP/tooling internal).
4. Jika butuh AI image/video/chat, runtime memanggil service AI terkait.
5. Output final disimpan sebagai task messages + metadata + media references.
6. Frontend menerima event SSE (`status`, `message`, `result`, `done`).
7. User dapat: simpan, favorit, share token, lanjutkan percakapan, atau publish.

---

## 7) Data Layer (MongoDB) dan Entitas Penting

Di `libs/mongodb/src/schemas/`, terdapat banyak schema domain. Entitas kunci yang relevan terhadap API AI/Agent antara lain:

- `content-generation-task.schema.ts` → state percakapan/hasil Agent.
- `ai-log.schema.ts` → tracking job AI async (status, point, error, response).
- `material.schema.ts` dan `material-group.schema.ts` → hasil konten yang siap dipakai/publish.
- `asset.schema.ts`, `media.schema.ts` → file/media metadata.
- `publish-record.schema.ts`, `publishing-task-meta.schema.ts` → jejak publikasi.
- `account.schema.ts`, `oauth2-credential.schema.ts` → koneksi akun platform.
- `credits-*` / `points-record.schema.ts` → konsumsi kredit dan billing logic.

Kesimpulan: sistem memakai pendekatan event/task-driven + status tracking kuat di tingkat dokumen MongoDB.

---

## 8) Integrasi Frontend Web terhadap API

Di `project/aitoearn-web/src/api/` ada lapisan API wrapper per domain:

- `agent.ts` → SSE task orchestration + task CRUD.
- `ai.ts` → chat/image/video/models/logs/material-adaptation.
- `draftGeneration.ts`, `assets.ts`, `material.ts`, `media.ts`, `account.ts`, dll.

### Mekanisme request frontend

- Wrapper generik di `src/utils/request.ts`.
- `baseURL` berasal dari `NEXT_PUBLIC_API_URL`.
- Token user disuntik otomatis via header `Authorization: Bearer ...`.
- Language header `Accept-Language` juga ditambahkan.

Dengan pola ini, semua module UI cukup panggil function domain-level tanpa mengurus boilerplate fetch/token berulang.

---

## 9) Electron + Embedded Server

Walau web + backend AI adalah jalur modern utama, repository juga memiliki stack Electron:

- Frontend desktop di `project/aitoearn-electron/src/`.
- Server NestJS di `project/aitoearn-electron/server/src/`.

`AppModule` server Electron memuat banyak modul bisnis (auth, user, task, publish, tools, finance, tracing, platform connectors, reward, dll), plus queue, Redis, Mongo, OSS, SMS, WX integration.

Ini menunjukkan coexistence antara:

- arsitektur backend AI modular terbaru (Nx), dan
- server bisnis desktop yang lebih luas/legacy.

---

## 10) Keamanan, Auth, dan Kontrol Akses

Komponen auth penting:

- `libs/aitoearn-auth` (backend AI) untuk token extraction, guard, decorators (`@Public`, `@Internal`, `@GetToken`).
- Frontend menyimpan token di store lalu injeksi ke header.
- Endpoint publik dipilih eksplisit (mis. model list tertentu, share token route).

Kontrol operasional tambahan:

- abort mechanism via Redis channel,
- timeout recovery task,
- internal route isolation,
- structured error code (`ResponseCode`) dari common layer.

---

## 11) Observability & Operability

Kemampuan operasional yang tampak dari kode:

- Health endpoint.
- Metrics setup pada bootstrap.
- OpenAPI opsional dari konfigurasi.
- Logging terpadu (console/cloudwatch/feishu/mongodb logger configurable).
- Graceful shutdown + wait running task (Agent & DraftGeneration service).

Ini penting untuk workload AI asynchronous yang rentan timeout/disconnect.

---

## 12) Ringkasan Proses Logika API (Checklist)

- ✅ API dibagi domain (agent, chat, image, video, draft, adaptation, internal).
- ✅ Jalur sinkron dan asinkron dipisahkan jelas.
- ✅ Status tracking task terstruktur (running/completed/error/requires_action/aborted).
- ✅ SSE dipakai untuk pengalaman near-real-time pada Agent/chat stream.
- ✅ Queue + consumer digunakan untuk proses berat (draft generation).
- ✅ Data persistence granular (task log, material, asset, publish record, credits).
- ✅ Frontend wrapper API konsisten dan terpusat.

---

## 13) Saran Pengembangan Dokumentasi Lanjutan

Agar dokumentasi makin production-grade, disarankan menambah:

1. **OpenAPI snapshot per release** (terutama endpoint publik).
2. **Sequence diagram** (Agent task, Draft v2 pipeline, publish pipeline).
3. **Error code catalog** (mapping `ResponseCode` ke tindakan UI).
4. **Data retention policy** (task/messages/assets/logs).
5. **Security hardening doc** (API key rotation, token TTL, internal route gateway).

---

## 14) Penutup

Dokumen ini bertujuan menjadi peta menyeluruh agar developer baru bisa cepat memahami:

- aplikasi mana menangani apa,
- endpoint mana untuk use case tertentu,
- bagaimana alur async AI diproses,
- dan bagaimana frontend/web/electron terhubung ke domain API.

Bila dibutuhkan, dokumen ini bisa dilanjutkan ke versi “API Reference per endpoint” (request/response contoh JSON lengkap per route).
