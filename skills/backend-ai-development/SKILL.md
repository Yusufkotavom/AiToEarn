---
name: backend-ai-development
description: Gunakan skill ini untuk perubahan pada project/aitoearn-backend, termasuk endpoint NestJS, service AI (chat/image/video/agent), queue consumer, serta schema/repository terkait MongoDB.
---

# Backend AI Development

## Kapan dipakai

Gunakan saat tugas menyentuh:
- `project/aitoearn-backend/apps/aitoearn-ai/src/**`
- `project/aitoearn-backend/libs/**`
- endpoint `agent`, `ai/*`, `internal/*`, `draft-generation`, `material-adaptation`.

## Workflow ringkas

1. Identifikasi modul terdampak (controller → service → repository/lib).
2. Cek kontrak API yang dipakai frontend (`project/aitoearn-web/src/api/*`).
3. Implementasi perubahan dengan menjaga kompatibilitas kontrak.
4. Verifikasi jalur async (queue/status) bila menyentuh proses AI berat.
5. Jalankan check minimum yang relevan (`nx` command bila tersedia).

## Guardrails

- Jangan ubah format SSE/event tanpa catatan migrasi.
- Hindari query DB non-terindeks untuk endpoint list utama.
- Untuk perubahan error code, cek dampaknya ke UI handling.
