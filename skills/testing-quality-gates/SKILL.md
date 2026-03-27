---
name: testing-quality-gates
description: Gunakan skill ini untuk menentukan dan menjalankan quality gate berdasarkan scope perubahan (docs, frontend, backend, electron), termasuk lint, type-check, unit/integration/e2e test, dan verifikasi manual minimal.
---

# Testing & Quality Gates

## Kapan dipakai

Gunakan untuk semua tugas yang memerlukan validasi sebelum commit.

## Strategi pengujian berbasis scope

- **Docs-only**: validasi file/link + format.
- **Frontend**: lint + type-check + e2e terarah bila memungkinkan.
- **Backend**: lint/test modul terdampak + cek endpoint inti.
- **Electron**: lint/test sesuai package + smoke test alur terkait.

## Format laporan

- Tulis command yang dijalankan.
- Tandai hasil: pass / warning (limit environment) / fail.
- Jika ada test tidak dijalankan, jelaskan alasan.
