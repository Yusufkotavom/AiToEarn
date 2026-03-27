# AGENTS.md — Instruksi Agent untuk Repository AiToEarn

Dokumen ini adalah panduan kerja agent AI di root repository `AiToEarn`.

## 1) Tujuan

Pastikan setiap perubahan:
- aman,
- mudah direview,
- tidak merusak alur lintas aplikasi (web, backend AI, electron),
- dan konsisten dengan arsitektur monorepo.

## 2) Peta Proyek

- `project/aitoearn-web` → frontend Next.js (web app).
- `project/aitoearn-backend` → backend utama AI (Nx + NestJS + libs).
- `project/aitoearn-electron` → desktop app + embedded server.

## 3) Aturan Kerja Umum

1. **Selalu cek dampak lintas layer** sebelum patch:
   - perubahan API backend harus dicek dampaknya ke `project/aitoearn-web/src/api/*`.
   - perubahan kontrak data task AI harus dicek dampaknya ke UI Agent.
2. **Perubahan kecil dan terfokus** (small, reviewable commits).
3. **Jangan refactor besar** kecuali diminta eksplisit.
4. **Jaga backward compatibility** untuk endpoint yang sudah dipakai frontend/electron.

## 4) Praktik untuk Backend AI

- Ikuti pola module/service/controller NestJS yang sudah ada.
- Gunakan DTO/schema validasi (zod atau schema yang berlaku di modul terkait).
- Untuk proses berat, utamakan jalur async (queue + status endpoint), bukan blocking request panjang.
- Untuk alur streaming, pertahankan perilaku SSE (jangan ubah format event tanpa migrasi).

## 5) Praktik untuk Frontend Web

- Gunakan wrapper request terpusat (`src/utils/request.ts`) dan API layer (`src/api/*`).
- Hindari hardcode endpoint/token di komponen.
- Pastikan i18n, state store, dan error handling tetap konsisten.

## 6) Praktik untuk Electron

- Perlakukan `project/aitoearn-electron` sebagai domain terpisah dengan dependensi sendiri.
- Perubahan server electron harus menjaga kompatibilitas modul task/publish/account/tools.

## 7) Testing Minimum per Jenis Perubahan

- **Dokumentasi saja**: cek tautan/file valid.
- **Frontend**: lint/type-check + (jika memungkinkan) test e2e terkait fitur.
- **Backend**: lint/test unit modul terdampak + verifikasi endpoint penting.
- **Kontrak API/SSE**: verifikasi shape respons/event dengan contoh nyata.

## 8) Kapan Harus Menambah Skill

Tambah skill baru bila:
- ada workflow berulang yang panjang/rumit,
- ada integrasi tool khusus,
- atau ada area domain yang sering menimbulkan error.

Semua skill project diletakkan di folder `skills/` pada root repository.
