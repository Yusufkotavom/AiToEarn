---
name: docker-operations
description: Gunakan skill ini untuk pekerjaan deployment/container pada project AiToEarn, termasuk docker-compose, Dockerfile web/backend, variabel environment, startup health check, dan troubleshooting service dependency.
---

# Docker Operations

## Kapan dipakai

Gunakan saat tugas terkait:
- `docker-compose.yaml`
- `DOCKER_DEPLOYMENT_CN.md` / `DOCKER_DEPLOYMENT_EN.md`
- Dockerfile di web/backend.

## Workflow ringkas

1. Petakan service dan dependency (app, db, redis, storage, dll).
2. Validasi env penting dan port mapping.
3. Jalankan compose up/build sesuai scope perubahan.
4. Cek health endpoint/log startup dan konektivitas antar service.

## Guardrails

- Jangan commit secret/API key ke repo.
- Pastikan command reproduktif untuk local dan server minimal.
