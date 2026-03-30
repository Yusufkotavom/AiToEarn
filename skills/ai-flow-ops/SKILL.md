---
name: ai-flow-ops
description: Gunakan skill ini untuk perubahan dan verifikasi alur AI end-to-end (web -> aitoearn-ai -> provider -> status/result) termasuk model image/video/chat.
---

# AI Flow Ops

## Kapan dipakai

Gunakan saat:
- menambah model/provider AI,
- mengubah alur task async image/video,
- investigasi mismatch frontend vs backend pada status/result,
- mengecek integrasi Pollinations/Google Flow/OpenAI/Volcengine.

## Workflow ringkas

1. Petakan jalur request dari web API layer ke endpoint backend.
2. Validasi mapping model, payload, dan path endpoint provider.
3. Uji terminal state task (`queued`, `processing`, `succeeded`, `failed`).
4. Validasi persistence/log dan URL output final.
5. Pastikan kontrak respons tetap kompatibel untuk UI.

## Guardrails

- Hindari perubahan breaking pada shape response tanpa migrasi.
- Untuk alur async, pastikan endpoint status tetap konsisten.
- Bila fallback diubah, dokumentasikan perilaku gagal/sukses secara eksplisit.

