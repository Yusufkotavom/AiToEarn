# AI Metadata Generation (Asset & Draft Asset) — Ide + Implementation Plan

## 1) Goal

Menambahkan fitur **Generate Metadata by AI** untuk:
- asset/draft asset individual,
- multiple asset sekaligus (batch),
- provider yang bisa dipilih (**Groq** atau **Gemini**),
- prompt yang bisa diedit di UI dan disimpan di setting,
- context-aware generation memakai data yang sudah ada (`title`, `description`, `tags/topics`, platform target).

Scope utama: `project/aitoearn-web` (frontend), dengan kontrak API yang backward-compatible untuk backend/electron.

---

## 2) UX Proposal (Frontend-first)

### 2.1 Entry point di UI

1. **Create Material modal** (seperti screenshot user)
   - Tambah tombol: `Generate Metadata` di bawah field title/description.
   - Saat diklik, tampilkan drawer/popover kecil berisi:
     - provider selector (`Auto`, `Groq`, `Gemini`),
     - prompt template picker,
     - tombol `Generate`.

2. **Publish Work modal**
   - Untuk tiap channel card, tambah action `Regenerate metadata` (per-channel override opsional).
   - Untuk level global (All Channels), tambah action `Generate for all selected assets`.

3. **Draft/Asset list (batch mode)**
   - Checkbox multi-select + bulk action bar:
     - `Generate metadata (N)`
     - `Apply result strategy`: `replace empty only` / `replace all`.

### 2.2 Pengalaman hasil generate

- Hasil AI masuk ke preview panel sebelum di-apply:
  - `Title`, `Description`, `Tags`.
- User bisa `Apply`, `Apply All`, atau edit manual.
- Jika parsing gagal (format AI tidak valid): fallback ke raw text + warning non-blocking.

---

## 3) Functional Requirements

### 3.1 Provider & model policy

- Provider enum:
  - `groq`
  - `gemini`
  - `auto` (backend memilih berdasarkan latency/availability/cost)
- Model configurable per provider via setting (mis. default):
  - Groq: `llama-3.3-70b` (contoh)
  - Gemini: `gemini-2.0-flash` (contoh)

### 3.2 Metadata fields

Output terstruktur:
- `title` (string, platform-aware length)
- `description` (string)
- `tags` (string[])
- optional: `language`, `tone`, `safetyFlags`

### 3.3 Context input

Input context dari material existing:
- existing `title`
- existing `description`
- existing `tags/topics`
- selected platform(s)
- media hint opsional (thumbnail OCR/caption jika nanti ada)

### 3.4 Batch mode

- User pilih banyak draft/asset lalu trigger satu job batch.
- UI polling status per item: `queued / generating / success / failed`.
- Retry gagal per item atau retry semua gagal.

### 3.5 Prompt template setting

- Setting level user/workspace:
  - default template global,
  - template per platform (opsional phase 2),
  - variables yang didukung: `{{title}}`, `{{description}}`, `{{tags}}`, `{{platform}}`, `{{language}}`, `{{tone}}`.
- Ada tombol restore default.

---

## 4) Recommended API Contract (Backend-facing)

> Tujuan kontrak ini supaya frontend bisa implement cepat, backend bisa map ke provider mana saja.

### 4.1 Single generation

`POST /ai/metadata/generate`

Request:
```json
{
  "provider": "auto|groq|gemini",
  "model": "string",
  "promptTemplate": "string",
  "strategy": "replace_empty|replace_all",
  "item": {
    "materialId": "string",
    "title": "string",
    "description": "string",
    "tags": ["string"],
    "platforms": ["youtube", "tiktok"]
  }
}
```

Response:
```json
{
  "title": "...",
  "description": "...",
  "tags": ["..."],
  "provider": "groq",
  "model": "...",
  "usage": { "inputTokens": 0, "outputTokens": 0 }
}
```

### 4.2 Batch generation (async)

- `POST /ai/metadata/generate/batch` => return `jobId`
- `GET /ai/metadata/generate/batch/:jobId` => aggregate + per-item status
- optional SSE: `/ai/metadata/generate/batch/:jobId/stream`

Batch item status:
- `queued`
- `running`
- `success`
- `failed`

---

## 5) Frontend Technical Plan (AiToEarn Web)

### 5.1 API layer (`src/api/*`)

Tambahkan file baru: `src/api/metadataGeneration.ts`
- `apiGenerateMetadata(payload)`
- `apiCreateMetadataBatch(payload)`
- `apiGetMetadataBatchJob(jobId)`
- `apiGetMetadataSettings()`
- `apiUpdateMetadataSettings(payload)`

Gunakan wrapper request existing (`src/utils/request.ts`) agar konsisten.

### 5.2 Store / state

Tambah store ringan (zustand / persist store) untuk:
- draft setting editor state (provider, prompt template sementara),
- batch job progress cache (in-memory),
- apply strategy default.

### 5.3 UI components

1. `MetadataGenerateButton`
2. `MetadataGenerateDrawer`
3. `MetadataPreviewDiff`
4. `MetadataBatchProgressPanel`
5. `MetadataSettingsPanel`

Integrasi utama:
- create material flow,
- publish flow,
- draft box list bulk action.

### 5.4 Validation & guardrails

- Panjang title/desc disesuaikan platform limits.
- Tag dedup, trim, max count.
- Jika output AI kosong, tampilkan actionable error.

### 5.5 i18n

Tambah key baru di locale `brandPromotion` / `publish` / `material`.

---

## 6) Rollout Plan (Incremental)

### Phase 1 (MVP, 1-2 sprint)
- Single generate di Create Material.
- Provider selector (`auto/groq/gemini`).
- Prompt editable + save user setting.
- Apply result ke form title/desc/tags.

### Phase 2
- Batch generate dari draft/asset list.
- Async progress UI + retry failed item.
- Strategy `replace_empty` vs `replace_all`.

### Phase 3
- Platform-specific templates.
- Quality scoring + A/B variant metadata.
- Optional SEO/engagement hints.

---

## 7) Risks & Mitigations

1. **Inconsistent AI output format**
   - Gunakan strict JSON schema di backend + response normalization.
2. **Latency tinggi di batch**
   - Async queue + progress endpoint/SSE.
3. **Overwriting user content**
   - Default strategy: `replace_empty` + preview before apply.
4. **Provider downtime/rate limit**
   - `auto` fallback policy + retry with alternate provider.

---

## 8) Acceptance Criteria

- User dapat generate metadata untuk 1 asset dari UI create material.
- User dapat memilih provider `groq/gemini/auto`.
- User dapat edit prompt template di setting dan tersimpan.
- User dapat menjalankan batch metadata generation untuk multi-item.
- Tiap item batch punya status, error reason, retry.
- Output title/description/tags bisa di-review sebelum apply.

---

## 9) Suggested Prompt Template (Default)

```txt
You are a social media metadata assistant.

Expand and improve metadata using the context below.
Return strict JSON with keys: title, description, tags.

Context:
- Title: {{title}}
- Description: {{description}}
- Tags: {{tags}}
- Platform: {{platform}}
- Language: {{language}}

Rules:
1) Keep tone engaging and natural.
2) Do not invent false claims.
3) Keep title concise and platform-friendly.
4) Return 5-10 relevant tags.
```

---

## 10) Cross-layer Checklist (before implementation)

- [ ] Backend endpoint + schema finalized (single + batch + settings).
- [ ] Frontend API typing aligned.
- [ ] Publish flow impact checked.
- [ ] Draft asset list bulk action tested on mobile viewport.
- [ ] Error states tested (provider timeout, invalid JSON, quota).
