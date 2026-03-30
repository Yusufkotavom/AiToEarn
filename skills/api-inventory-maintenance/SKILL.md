---
name: api-inventory-maintenance
description: Gunakan skill ini untuk memelihara dokumentasi endpoint API lintas layanan (aitoearn-ai, aitoearn-server, worker) agar selalu sinkron dengan source code controller.
---

# API Inventory Maintenance

## Kapan dipakai

Gunakan saat:
- ada perubahan endpoint/controller,
- perlu daftar API lengkap untuk handover/audit,
- perlu membandingkan kontrak API web/backend/electron.

## Workflow ringkas

1. Ekstrak endpoint dari `*.controller.ts` (method + path + source line).
2. Kelompokkan per aplikasi (`aitoearn-ai`, `aitoearn-server`, worker).
3. Update file inventory API markdown.
4. Sinkronkan dokumen arsitektur/alur jika ada perubahan domain.
5. Verifikasi tidak ada endpoint kritis yang terlewat.

## Guardrails

- Tandai inventory sebagai hasil generate + timestamp.
- Jangan ubah path endpoint di dokumentasi tanpa bukti perubahan source.
- Jika endpoint ambigu karena dynamic route/decorator custom, tambahkan catatan.

