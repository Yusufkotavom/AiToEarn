# AI Gen via Playwright + Relay (Implementation Plan)

## Scope (Phase 1)

Dokumen ini fokus pada **AI generation via Playwright** terlebih dahulu, dengan target provider berbasis web berikut:

1. **Grok Imagine** (video generation)
2. **Google Labs Whisk** (image generation): `https://labs.google/fx/tools/whisk/project`
3. **Google Labs Flow** (image & video generation): `https://labs.google/fx/tools/flow`

Integrasi ini didesain agar **tidak mengganggu jalur API default** yang sudah ada. UI tetap konsisten, backend memilih mode eksekusi (`api` vs `playwright-relay`).

---

## Objectives

- Menambahkan mode `playwright-relay` untuk AI image/video generation.
- Menjaga endpoint UI/API tetap stabil (seamless untuk user).
- Menyediakan observability lengkap per job (timeline, logs, artifacts).
- Menyediakan recovery flow saat session provider invalid/logout.

---

## Existing System Context

### Frontend AI calls (existing)

Frontend sudah memanggil endpoint backend untuk AI image/video:

- `POST ai/image/generate/async`
- `GET ai/image/task/:logId`
- `POST ai/video/generations`
- `GET ai/video/generations/:taskId`

Sehingga, untuk integrasi Playwright, prioritasnya adalah menjaga kontrak endpoint ini tetap sama.

### Backend relay capability (existing)

Backend sudah memiliki fondasi relay optional (`config.relay`) dan mekanisme forwarding berbasis exception filter. Ini bisa digunakan sebagai basis untuk mode Playwright tanpa mengubah UX utama.

---

## Architecture (Phase 1)

### Components

1. **Core API (existing)**
   - Menjadi orchestrator bisnis.
   - Menentukan mode eksekusi AI gen (`api` atau `playwright-relay`).

2. **Relay API (new service)**
   - Endpoint untuk menerima request AI gen async.
   - Mendaftarkan job ke queue.

3. **Relay Worker (Playwright)**
   - Menjalankan browser automation ke Grok/Whisk/Flow.
   - Mengambil output media.
   - Mengunggah ke storage.

4. **Queue + Job Store**
   - Redis/BullMQ untuk antrean.
   - Store status job + step timeline + error.

5. **Artifact Storage**
   - Simpan screenshot/trace/video debug.
   - Simpan hasil media akhir (image/video).

---

## Execution Mode Strategy (clear & non-confusing)

Tambahkan mode config per capability:

- `genImageMode: api | playwright-relay`
- `genVideoMode: api | playwright-relay`

### Routing rules

- Jika mode = `api`, gunakan flow existing.
- Jika mode = `playwright-relay`, Core API submit job ke Relay API dan mengembalikan format response yang kompatibel dengan endpoint existing.

Dengan cara ini, user tetap menggunakan UI yang sama.

---

## Provider Adapters

Buat adapter terpisah agar maintainable:

- `GrokImagineAdapter`
- `GoogleWhiskAdapter`
- `GoogleFlowAdapter`

Setiap adapter wajib implement interface:

```ts
interface PlaywrightGenAdapter {
  provider: string
  type: 'image' | 'video' | 'both'
  run(job: GenJobContext): Promise<GenJobResult>
}
```

`GenJobResult` minimal:

- `status: success | failed`
- `assets: { type: 'image' | 'video'; url: string; thumbUrl?: string }[]`
- `providerJobRef?: string`
- `rawMeta?: Record<string, any>`

---

## Data Model (MVP)

### Job entity

- `id`
- `type` (`gen_image` | `gen_video`)
- `provider` (`grok_imagine` | `google_whisk` | `google_flow`)
- `mode` (`playwright-relay`)
- `userId`
- `status` (`queued` | `running` | `succeeded` | `failed`)
- `progress` (0..100)
- `attempt`
- `startedAt`, `finishedAt`
- `errorCode`, `errorMessage`

### Step log entity

- `jobId`
- `step`
- `level` (`info` | `warn` | `error`)
- `message`
- `ts`
- `meta`

### Artifact entity

- `jobId`
- `kind` (`screenshot` | `trace` | `video` | `html`)
- `path`
- `size`
- `ts`

---

## Detailed Flow (Image/Video Gen via Playwright)

1. UI memanggil endpoint existing (`ai/image/...` atau `ai/video/...`).
2. Core API cek mode (`api` vs `playwright-relay`).
3. Jika `playwright-relay`:
   - Core API kirim request async ke Relay API.
   - Relay API enqueue job.
4. Worker ambil job, jalankan adapter provider.
5. Worker menyimpan artifacts debug per step.
6. Worker download output media, upload ke storage internal.
7. Worker update status job `succeeded` + payload assets.
8. Core API endpoint status mengembalikan hasil dalam format yang cocok dengan frontend existing.

---

## Debug & Observability (required from day 1)

## Structured logs

Setiap log wajib punya field berikut:

- `jobId`
- `provider`
- `jobType`
- `userId`
- `step`
- `attempt`
- `durationMs`
- `traceId`

## Step naming convention

- `BROWSER_LAUNCH`
- `OPEN_PROVIDER_HOME`
- `AUTH_CHECK`
- `PROMPT_FILL`
- `SUBMIT_GENERATION`
- `WAIT_RESULT`
- `DOWNLOAD_ASSET`
- `UPLOAD_ASSET`
- `COMPLETE`

## Artifacts policy

- On-failure: always simpan screenshot + trace.
- On-success: sampling (mis. 5-10%) untuk quality auditing.
- Simpan path artifacts by job id:
  - `/artifacts/yyyy-mm-dd/{jobId}/...`

## Live troubleshooting endpoints

Relay API:

- `GET /jobs/:id`
- `GET /jobs/:id/logs`
- `GET /jobs/:id/artifacts`

---

## Session / Relogin (practical first)

Fokus running dulu, dengan session strategy minimal:

- Simpan `storageState` per provider-account profile.
- Saat job mulai, lakukan `AUTH_CHECK` cepat.
- Jika invalid:
  1. coba refresh context
  2. jika masih invalid, trigger login ulang
  3. bila tetap gagal, mark `needs_reauth`

`needs_reauth` akan diteruskan ke Core API agar UI bisa meminta user reconnect.

---

## Runtime Profiles (recommended)

Sediakan profile eksekusi:

### 1) `prod`

- headless: true
- tracing: on-first-retry / on-failure
- video: off (on-failure only)
- screenshot: on-failure
- timeout: ketat + retry terkontrol

### 2) `debug`

- headless: false
- slowMo: 250-500ms
- tracing: on
- video: on
- screenshot: on
- timeout: long

### 3) `soak`

- headless: true
- tracing: off
- screenshot: off (except failure)
- load test concurrency moderate

---

## Task Breakdown (Detailed)

## Epic 1 — Core API mode router (AI only)

1. Tambah config mode:
   - `genImageMode`
   - `genVideoMode`
2. Tambah routing logic pada endpoint AI existing.
3. Pastikan response kompatibel dengan frontend sekarang.

**Deliverable:** mode switch berfungsi tanpa mengubah UX.

## Epic 2 — Relay API + queue skeleton

1. Setup service relay (Nest/Fastify/Express).
2. Setup queue (BullMQ) + Redis.
3. Endpoint create/status/logs/artifacts jobs.

**Deliverable:** async pipeline berjalan end-to-end dengan mock worker.

## Epic 3 — Playwright worker foundation

1. Browser manager + context manager.
2. Artifact manager (screenshot/trace/video).
3. Step logger middleware.

**Deliverable:** satu job dummy menghasilkan timeline + artifact.

## Epic 4 — Google Whisk adapter (image)

1. Implement navigation + prompt submit + wait output.
2. Implement result extraction + download.
3. Implement upload to storage + return URL.

**Deliverable:** `gen_image` provider `google_whisk` berhasil.

## Epic 5 — Google Flow adapter (image/video)

1. Implement image flow.
2. Implement video flow.
3. Standarkan hasil ke `GenJobResult`.

**Deliverable:** `google_flow` image/video siap pakai.

## Epic 6 — Grok Imagine adapter (video)

1. Implement prompt + generation + polling/wait.
2. Tangani timeout & retry.
3. Return artifact final + metadata.

**Deliverable:** `gen_video` provider `grok_imagine` siap pakai.

## Epic 7 — Relogin + reauth UX handshake

1. AUTH_CHECK standard.
2. Auto relogin attempt.
3. Status `needs_reauth` ke Core API.
4. Frontend menampilkan action reconnect.

**Deliverable:** session invalid tidak membuat flow macet tanpa arah.

## Epic 8 — Production observability

1. Log sink (ELK/Loki/Cloud logging).
2. Metrics:
   - queue depth
   - success rate
   - median duration per provider
   - relogin rate
3. Alerting threshold.

**Deliverable:** live monitoring & fast diagnosis.

---

## Acceptance Criteria (Phase 1)

1. Frontend endpoint AI existing tetap digunakan.
2. Mode `playwright-relay` aktif via config tanpa ubah UX.
3. Minimal 2 provider berjalan:
   - Whisk (image)
   - salah satu video provider (Flow/Grok)
4. Tiap failure bisa dilacak step-by-step dari logs + artifacts.
5. Session invalid menghasilkan status reauth yang jelas.

---

## Risks & Notes

- UI provider website sering berubah -> selector brittle.
- Anti-bot/captcha dapat memutus automation flow.
- Durasi video generation bisa panjang dan variatif.

Mitigasi awal:

- adapter pattern + selector versioning
- timeout/retry policy per provider
- artifact lengkap on-failure

---

## Suggested Milestone (10 working days)

- **D1-D2**: Core mode router + relay skeleton
- **D3-D4**: Worker foundation + observability dasar
- **D5-D6**: Whisk image adapter
- **D7-D8**: Flow/Grok video adapter
- **D9**: relogin/re-auth handshake
- **D10**: E2E validation + go-live checklist

