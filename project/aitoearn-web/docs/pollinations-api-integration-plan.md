# Pollinations API Integration Plan (Focus: Image & Video)

## 1) Goal

Menambahkan dukungan **Pollinations API** sebagai provider khusus **image generation** dan **video generation** di AiToEarn, dengan prinsip:
- aman untuk production,
- backward-compatible dengan flow existing,
- mudah di-rollout bertahap di backend, web, dan electron.

Referensi: https://enter.pollinations.ai/api/docs

---

## 2) Scope (Image & Video Only)

### In Scope
1. Integrasi Pollinations untuk **generate image** dari prompt.
2. Integrasi Pollinations untuk **generate video** (jika endpoint tersedia di versi docs yang dipakai).
3. Storage hasil media (URL/asset record) ke alur material existing.
4. Status async job untuk proses media yang berjalan lama.

### Out of Scope
1. Text-only chat/completion flow.
2. Refactor besar modul AI provider existing.
3. Breaking change pada endpoint lama.

---

## 3) Cross-Layer Architecture

## 3.1 Backend (`project/aitoearn-backend`)

Tambahkan adapter provider khusus Pollinations:
- `PollinationsMediaProviderService`
- implement method minimal:
  - `generateImage(...)`
  - `generateVideo(...)`
  - `getJobStatus(...)` (untuk operasi async)

Routing provider:
- tetap lewat service/provider router existing.
- provider baru: `pollinations`.

Normalisasi respons ke kontrak internal AiToEarn:
- `assetType: image|video`
- `assetUrl`
- `thumbnailUrl` (opsional)
- `jobId` + `status` jika async.

## 3.2 Web (`project/aitoearn-web`)

- Tambahkan opsi provider `pollinations` di UI generator media.
- Untuk mode video, tampilkan progress/status (queued/running/success/failed).
- Hasil image/video masuk ke alur asset material yang sudah ada.

## 3.3 Electron (`project/aitoearn-electron`)

- Expose opsi provider yang sama.
- Pertahankan kompatibilitas modul task/publish/account/tools.

---

## 4) API Contract Proposal (Backward-Compatible)

## 4.1 Create media generation job

`POST /ai/media/generate`

Request:
```json
{
  "provider": "auto|pollinations",
  "assetType": "image|video",
  "prompt": "string",
  "model": "optional-string",
  "options": {
    "width": 1024,
    "height": 1024,
    "durationSec": 8,
    "fps": 24,
    "seed": 123,
    "negativePrompt": "optional-string"
  }
}
```

Response (sync jika image cepat):
```json
{
  "provider": "pollinations",
  "assetType": "image",
  "status": "success",
  "assetUrl": "https://...",
  "thumbnailUrl": "https://..."
}
```

Response (async, umumnya video):
```json
{
  "provider": "pollinations",
  "assetType": "video",
  "status": "queued",
  "jobId": "job_123"
}
```

## 4.2 Polling job status

`GET /ai/media/jobs/:jobId`

```json
{
  "jobId": "job_123",
  "assetType": "video",
  "status": "running|success|failed",
  "progress": 62,
  "assetUrl": "https://...",
  "thumbnailUrl": "https://...",
  "error": null
}
```

---

## 5) Implementation Plan

### Phase 0 — Contract Validation (0.5 sprint)
1. Verifikasi endpoint image/video Pollinations yang aktif saat implementasi.
2. Tentukan parameter minimum yang didukung stabil.
3. Finalkan schema normalisasi internal untuk `image|video`.

### Phase 1 — Backend Adapter (1 sprint)
1. Tambah enum provider `pollinations`.
2. Implement:
   - generate image,
   - generate video,
   - job status polling.
3. Error mapping standar (timeout, rate-limit, invalid prompt, provider unavailable).
4. Env config:
   - `AI_PROVIDER_POLLINATIONS_ENABLED`
   - `POLLINATIONS_BASE_URL`
   - `POLLINATIONS_API_KEY` (jika diperlukan)
   - `POLLINATIONS_IMAGE_MODEL`
   - `POLLINATIONS_VIDEO_MODEL`.

### Phase 2 — Web + Electron Wiring (0.5–1 sprint)
1. UI toggle `Image` vs `Video`.
2. Input options relevan per tipe media.
3. Progress UI untuk video job async.
4. Simpan hasil ke material/asset flow existing.

### Phase 3 — Hardening (0.5 sprint)
1. Retry policy + fallback provider (`auto`).
2. Observability: latency, success rate, fail reason.
3. Guardrails ukuran/durasi agar biaya terkendali.

## 5.1 Status Update Branch `work` (per 2026-03-27)

### ✅ Yang sudah terimplementasi
- Pollinations channel sudah ditambahkan ke enum logging AI (`AiLogChannel.Pollinations`).
- Backend sudah support generate image Pollinations melalui mapping model:
  - `pollinations-flux` -> `flux`
  - `pollinations-gptimage` -> `gptimage`
  - `pollinations-imagen` -> `imagen`
- Backend sudah support generate video Pollinations melalui mapping model:
  - `pollinations-veo-3.1` -> `veo-3.1`
  - `pollinations-seedance` -> `seedance`
- Konfigurasi env/config Pollinations sudah masuk (`imageBaseUrl`, `videoBaseUrl`, `appUrl`, `secretKey`, `publishableKey`).
- MCP media tool sudah expose generate image/video Pollinations untuk skenario agent.
- Web flow generate image sudah mulai di-wire ke endpoint image model API.

### 🟡 Sedang berjalan / parsial
- Penyelarasan kontrak respons final lintas backend-web-electron masih parsial (khususnya status async video agar konsisten `queued/running/success/failed`).
- Integrasi penuh progress UI video async di web masih perlu verifikasi end-to-end pada alur publish.

### 🔜 Next Step prioritas
1. Finalisasi endpoint status/polling video Pollinations dengan shape respons yang stabil untuk consumer.
2. Tambah test minimum backend (unit mapping + integration untuk generate/polling).
3. Tambah verifikasi frontend (type-check + UI state: submitted/processing/failed/success).
4. Lakukan validasi kompatibilitas electron terhadap model/provider baru.

### Checklist fase implementasi (living checklist)
- [x] Phase 0.1 Verifikasi endpoint image/video Pollinations.
- [x] Phase 0.2 Tentukan parameter minimum stabil (model, width, height, duration, seed).
- [ ] Phase 0.3 Finalisasi schema normalisasi internal `image|video` end-to-end.
- [x] Phase 1.1 Tambah enum/channel provider Pollinations.
- [x] Phase 1.2 Implement generate image Pollinations.
- [x] Phase 1.3 Implement generate video Pollinations.
- [ ] Phase 1.4 Standarisasi error mapping provider Pollinations.
- [x] Phase 1.5 Tambah env config Pollinations di runtime config.
- [x] Phase 2.1 Mulai wiring web flow generate image.
- [ ] Phase 2.2 Sinkronisasi penuh progress/status video async di UI.
- [ ] Phase 2.3 Verifikasi penyimpanan hasil video ke material/asset flow existing.
- [ ] Phase 2.4 Verifikasi parity di electron.
- [ ] Phase 3.1 Retry/fallback policy (`auto`).
- [ ] Phase 3.2 Observability latency/success/failure reason.
- [ ] Phase 3.3 Guardrails resolusi/durasi untuk kontrol biaya.

---

## 6) Testing Minimum

## 6.1 Backend
- Unit test mapping response image/video.
- Unit test error mapping (4xx/5xx/timeout).
- Integration test endpoint:
  - `POST /ai/media/generate`
  - `GET /ai/media/jobs/:jobId`.

## 6.2 Frontend
- Type-check provider enum + `assetType`.
- UI test mode switch image/video.
- UI test progress dan fail state untuk video async.

## 6.3 Contract
- Snapshot response shape untuk 3 kondisi:
  - image success,
  - video queued/running,
  - video failed.

---

## 7) Risks & Mitigations

1. **Video generation lebih lambat dan rentan timeout**  
   Mitigasi: async job + polling/status endpoint + timeout limit.

2. **Perbedaan format response provider**  
   Mitigasi: schema normalisasi tunggal sebelum dikirim ke consumer.

3. **Biaya tinggi untuk media generatif**  
   Mitigasi: pembatasan resolusi/durasi default + quota/guardrail.

4. **Dampak ke publish flow**  
   Mitigasi: simpan hasil sebagai asset standar sehingga publish pipeline tidak berubah.

---

## 8) Acceptance Criteria

1. User dapat generate **image** dari prompt dan hasil masuk ke asset library.
2. User dapat generate **video** via async job hingga status `success/failed`.
3. Kontrak API tetap kompatibel dengan consumer lama.
4. Terdapat observability dasar untuk performa dan kegagalan.

---

## 9) Deliverables

1. Dokumen mapping Pollinations image/video -> kontrak internal.
2. PR backend adapter + tests.
3. PR web/electron UI wiring + type update.
4. Runbook operasional (env, troubleshooting, fallback).
