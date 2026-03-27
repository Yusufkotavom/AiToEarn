---
name: api-sse-integration
description: Gunakan skill ini ketika mengubah kontrak API atau alur SSE antara backend dan frontend, termasuk endpoint agent/chat stream, format event, polling fallback, dan kompatibilitas versi klien.
---

# API + SSE Integration

## Kapan dipakai

Gunakan saat mengubah:
- endpoint request/response JSON,
- format event SSE (`message`, `status`, `done`, `error`, dst),
- mekanisme reconnect/polling fallback.

## Checklist wajib

1. Dokumentasikan kontrak sebelum dan sesudah perubahan.
2. Verifikasi frontend parser/handler untuk semua tipe event.
3. Pastikan fallback polling (`messages after lastMessageId`) tetap valid.
4. Uji minimal 1 skenario sukses + 1 skenario error + 1 disconnect/retry.

## Guardrails

- Hindari breaking change tanpa versioning atau adaptor.
- Jangan ubah nama field inti task/message sembarangan.
