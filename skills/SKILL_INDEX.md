# Skill Index untuk AiToEarn

Daftar skill custom project:

1. `backend-ai-development` — perubahan backend AI Nx/NestJS.
2. `web-frontend-development` — perubahan frontend Next.js.
3. `electron-development` — perubahan app desktop + server electron.
4. `api-sse-integration` — perubahan kontrak API & SSE.
5. `testing-quality-gates` — quality gate berbasis scope.
6. `docker-operations` — deployment & troubleshooting docker.
7. `playwright-google-flow-ops` — operasi login/generate/debug integrasi Google Flow via Playwright.
8. `api-inventory-maintenance` — ekstraksi dan sinkronisasi daftar endpoint API.
9. `ai-flow-ops` — verifikasi alur AI end-to-end lintas web/backend/provider.

Rekomendasi penggunaan berurutan untuk mayoritas task fitur:

- `backend-ai-development` / `web-frontend-development` (sesuai domain)
- `api-sse-integration` (jika ada perubahan kontrak)
- `testing-quality-gates` (sebelum commit)

Rekomendasi tambahan untuk domain AI browser flow:

- `playwright-google-flow-ops` (untuk investigasi login/task browser)
- `ai-flow-ops` (untuk validasi status/result model)
- `api-inventory-maintenance` (saat update dokumentasi endpoint)
