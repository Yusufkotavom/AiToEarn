---
name: playwright-google-flow-ops
description: Gunakan skill ini untuk operasi login, troubleshooting, dan generate task pada integrasi Google Flow berbasis Playwright worker + remote browser/noVNC.
---

# Playwright Google Flow Ops

## Kapan dipakai

Gunakan saat tugas menyentuh:
- `apps/google-flow-playwright-worker`
- `apps/google-flow-remote-browser`
- endpoint `/ai/playwright/*` atau `/v1/profiles/*` dan `/v1/tasks/*`
- isu login challenge, resume status, output tidak muncul, atau timeout generate.

## Workflow ringkas

1. Verifikasi container `google-flow-playwright-worker` + `google-flow-remote-browser` sehat.
2. Verifikasi profile dan status login (`login/status`, `login/resume`).
3. Jalankan generate task dan poll hingga terminal state (`succeeded`/`failed`).
4. Jika gagal, inspeksi snapshot debug + log worker lalu perbaiki selector/flow.
5. Rebuild service terdampak dan uji ulang end-to-end.

## Guardrails

- Jangan hardcode kredensial sensitif di source.
- Jangan menambah fallback provider tersembunyi tanpa persetujuan (gagal harus tetap gagal).
- Selalu simpan bukti debug (task id, log error, path screenshot) saat investigasi.

