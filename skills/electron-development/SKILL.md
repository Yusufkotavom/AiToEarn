---
name: electron-development
description: Gunakan skill ini untuk perubahan di project/aitoearn-electron (renderer, electron main/preload, dan embedded NestJS server) termasuk alur publish/task/account/tools pada aplikasi desktop.
---

# Electron Development

## Kapan dipakai

Gunakan saat perubahan ada di:
- `project/aitoearn-electron/src/**`
- `project/aitoearn-electron/electron/**`
- `project/aitoearn-electron/server/src/**`.

## Workflow ringkas

1. Tentukan scope: renderer UI, main process, atau server API.
2. Jika menyentuh server module, cek DTO/controller/service terkait.
3. Jika menyentuh renderer, cek API client `src/api/*` dan state UI.
4. Jalankan test/lint minimum sesuai area perubahan.

## Guardrails

- Jangan campur kontrak API web dan electron tanpa validasi.
- Pastikan kompatibilitas build Vite + Electron tetap aman.
