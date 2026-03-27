---
name: web-frontend-development
description: Gunakan skill ini untuk perubahan di project/aitoearn-web, termasuk komponen UI, state store, route app router, API layer, i18n, dan alur interaksi Agent berbasis SSE.
---

# Web Frontend Development

## Kapan dipakai

Gunakan saat tugas menyentuh:
- `project/aitoearn-web/src/**`
- komponen React/Next.js, hooks, store zustand,
- wrapper API dan request handling.

## Workflow ringkas

1. Telusuri alur UI → API function (`src/api`) → endpoint backend.
2. Implement perubahan dengan reusable component/hook.
3. Pastikan token, bahasa, dan error handling tetap lewat `src/utils/request.ts`.
4. Jalankan lint/type-check/test yang relevan.

## Guardrails

- Hindari hardcode URL API selain kebutuhan eksplisit.
- Jangan bypass store global untuk auth/lang state.
- Jika mengubah UI visual penting, sertakan screenshot bila tool tersedia.
