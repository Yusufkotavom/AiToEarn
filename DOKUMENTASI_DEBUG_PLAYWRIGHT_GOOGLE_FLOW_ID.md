# Dokumentasi Debugging Playwright Google Flow (Local/Server)

Dokumen ini menjelaskan cara debug `google-flow-playwright-worker` di repo AiToEarn, termasuk:
- test local,
- alur profile login,
- menjalankan task image/video,
- daftar parameter request,
- mode headless/non-headless,
- mode recording/debug.

## 1. Komponen yang Terlibat

- `google-flow-playwright-worker`:
  API worker Playwright (port internal `4310`).
- `google-flow-remote-browser`:
  browser remote + noVNC + CDP (port internal `4320`, noVNC `6080`, CDP proxy `9223`).
- `aitoearn-ai`:
  backend utama yang memanggil worker ini.

Di `docker-compose.yaml` saat ini:
- Worker **tidak** expose `4310` ke host.
- Untuk test manual, panggil endpoint worker via:
  - `docker exec google-flow-playwright-worker ...`, atau
  - dari container lain dalam network internal.

## 2. Menjalankan Service

Di root repo:

```bash
docker compose up -d google-flow-remote-browser google-flow-playwright-worker
docker compose ps
```

Cek health:

```bash
docker compose exec -T google-flow-playwright-worker sh -lc 'wget -qO- http://127.0.0.1:4310/health'
docker compose exec -T google-flow-remote-browser sh -lc 'wget -qO- http://127.0.0.1:4320/health'
```

## 3. Alur Dasar End-to-End (Profile -> Login -> Generate -> Poll Task)

### 3.1 Buat profile

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  --header="Content-Type: application/json" \
  --post-data='"'"'{"id":"489b6b6d-80a1-4793-9f79-f3d4df76f597","label":"yusuf","provider":"google-flow","capabilities":["image","video"],"headless":true}'"'"' \
  http://127.0.0.1:4310/v1/profiles'
```

List profile:

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- http://127.0.0.1:4310/v1/profiles'
```

### 3.2 Buka browser login (noVNC)

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  --header="Content-Type: application/json" \
  --post-data="{}" \
  http://127.0.0.1:4310/v1/profiles/489b6b6d-80a1-4793-9f79-f3d4df76f597/login/open'
```

Output akan berisi `loginUrl` (biasanya `/flow-login/vnc.html?...`).

### 3.3 Login (opsi manual/noVNC atau kredensial)

Opsi A - manual di noVNC:
1. Buka URL noVNC.
2. Login Google sampai selesai challenge.
3. Lanjutkan dengan endpoint `login/resume`.

Opsi B - kirim email/password:

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  --header="Content-Type: application/json" \
  --post-data='"'"'{"email":"your-email@gmail.com","password":"your-password"}'"'"' \
  http://127.0.0.1:4310/v1/profiles/489b6b6d-80a1-4793-9f79-f3d4df76f597/login/credentials'
```

### 3.4 Resume + cek status login

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  --header="Content-Type: application/json" \
  --post-data="{}" \
  http://127.0.0.1:4310/v1/profiles/489b6b6d-80a1-4793-9f79-f3d4df76f597/login/resume'

docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  http://127.0.0.1:4310/v1/profiles/489b6b6d-80a1-4793-9f79-f3d4df76f597/login/status'
```

Target status: `authenticated`.

### 3.5 Generate image

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  --header="Content-Type: application/json" \
  --post-data='"'"'{"profileId":"489b6b6d-80a1-4793-9f79-f3d4df76f597","model":"google-flow-browser-image-nano-banana-2","prompt":"kucing lucu","size":"1024x1024","n":2}'"'"' \
  http://127.0.0.1:4310/v1/image/generate'
```

Response: `{"taskId":"...","status":"queued","profileId":"..."}`

### 3.6 Generate video

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  --header="Content-Type: application/json" \
  --post-data='"'"'{"profileId":"489b6b6d-80a1-4793-9f79-f3d4df76f597","model":"google-flow-browser-video-nano-banana-2","prompt":"kucing lucu berlari di taman","size":"720x1280"}'"'"' \
  http://127.0.0.1:4310/v1/video/generate'
```

### 3.7 Poll status task

```bash
TASK_ID="isi-task-id"
docker exec google-flow-playwright-worker sh -lc "wget -qO- http://127.0.0.1:4310/v1/tasks/$TASK_ID"
```

Status:
- `queued`
- `processing`
- `succeeded` (`outputUrl` tersedia)
- `failed` (`error` tersedia)

## 4. Daftar Endpoint Worker

- `GET /health`
- `POST /v1/profiles`
- `GET /v1/profiles`
- `GET /v1/profiles/:id`
- `POST /v1/profiles/:id/login/start`
- `POST /v1/profiles/:id/login/open`
- `POST /v1/profiles/:id/login/credentials`
- `GET /v1/profiles/:id/login/status`
- `POST /v1/profiles/:id/login/resume`
- `POST /v1/profiles/:id/login/reset`
- `GET /v1/profiles/:id/debug`
- `POST /v1/image/generate`
- `POST /v1/video/generate`
- `GET /v1/tasks/:taskId`

Legacy (single-profile shim):
- `GET /v1/auth/login-url`
- `GET /v1/auth/session-status`
- `POST /v1/auth/relogin`

## 5. Parameter Request (Yang Dipakai Worker)

## 5.1 `POST /v1/profiles`

Body:
- `id?: string`
- `label?: string`
- `provider?: string` (default `google-flow`)
- `capabilities?: string[]` (contoh `["image","video"]`)
- `headless?: boolean`

## 5.2 `POST /v1/profiles/:id/login/credentials`

Body:
- `email: string` (wajib)
- `password: string` (wajib)

## 5.3 `POST /v1/image/generate`

Body:
- `profileId: string` (wajib)
- `prompt: string` (wajib)
- `model?: string` (mapping ke pilihan model UI Flow)
- `flowModel?: string` (override nama model langsung di UI)
- `size?: string` (contoh `1024x1024`, `720x1280`, atau `1:1`)
- `aspectRatio?: string` (contoh `1:1`, `9:16`)
- `metadata?.aspectRatio?: string`
- `n?: number` (jumlah output 1..4)

Catatan:
- Worker memilih mode Image, model, ratio, jumlah output, isi prompt, submit, tunggu progress, lalu cari tombol download.

## 5.4 `POST /v1/video/generate`

Body:
- `profileId: string` (wajib)
- `prompt: string` (wajib)
- `model?: string`
- `flowModel?: string`
- `size?: string`
- `aspectRatio?: string`
- `metadata?.aspectRatio?: string`

Catatan:
- `duration` bisa dikirim dari caller, tapi logic UI worker saat ini tidak mengubah kontrol durasi secara eksplisit.

## 6. Lokasi Log dan Snapshot Debug

## 6.1 Log container

```bash
docker logs -f google-flow-playwright-worker
docker logs -f google-flow-remote-browser
```

## 6.2 Snapshot otomatis

Konfigurasi default:
- `GOOGLE_FLOW_DEBUG_EXPORT_DIR=/project/debug-snapshots`
- mount ke host: `./debug-snapshots`

Cek file:

```bash
ls -lt /opt/AiToEarn/debug-snapshots/<profileId> | head -n 30
```

Nama file contoh:
- `...-image-opened.png`
- `...-image-workspace-ready.png`
- `...-image-prompt-filled.png`
- `...-image-submitted.png`
- `...-image-output-found.png`
- `...-image-download-not-found.png`

## 6.3 Debug profile state

```bash
docker exec google-flow-playwright-worker sh -lc 'wget -qO- \
  http://127.0.0.1:4310/v1/profiles/489b6b6d-80a1-4793-9f79-f3d4df76f597/debug'
```

## 7. Headless vs Non-Headless

## 7.1 Headless (disarankan server)

Set:
- `GOOGLE_FLOW_HEADLESS=true`

Kelebihan:
- hemat resource,
- stabil untuk automation server.

## 7.2 Non-headless (butuh display/X server)

Set:
- `GOOGLE_FLOW_HEADLESS=false`

Catatan penting:
- jika tidak ada X server (`$DISPLAY`), browser headed gagal.
- worker akan fallback ke headless jika `DISPLAY` tidak tersedia.

Untuk login visual di server, gunakan pola:
- remote browser container (`google-flow-remote-browser`) + noVNC
- worker attach via CDP (`GOOGLE_FLOW_REMOTE_CDP_URL`).

## 8. Mode Recording / Debug Playwright

Repo ini saat ini menyediakan 3 level debug praktis:

1. Snapshot step-by-step (built-in):
   - aktif by default (`GOOGLE_FLOW_LOGIN_SNAPSHOT_ENABLED=true`)
   - output ke `debug-snapshots/<profileId>`.
2. Live visual session via noVNC:
   - lihat proses login/generate real-time.
3. Verbose Playwright log:
   - jalankan worker dengan `DEBUG=pw:api,pw:browser*` untuk melihat call Playwright detail.

Contoh override env sementara:

```bash
DEBUG='pw:api,pw:browser*' docker compose up -d --force-recreate google-flow-playwright-worker
docker logs -f google-flow-playwright-worker
```

Catatan:
- tracing/video artifact Playwright (`trace.zip`, video `.webm`) belum diaktifkan sebagai fitur bawaan worker API.
- untuk forensic lebih detail, gunakan script repro terpisah dengan Playwright `context.tracing.start(...)` lalu `stop(...)`.

## 9. Troubleshooting Cepat

## 9.1 `Target page, context or browser has been closed`
- Biasanya CDP/browser remote sempat restart.
- Cek `google-flow-remote-browser` health + logs.
- Jalankan ulang `login/open`, lalu `login/resume`.

## 9.2 `Missing X server or $DISPLAY`
- Menjalankan headed tanpa X server.
- Solusi: pakai `GOOGLE_FLOW_HEADLESS=true` atau noVNC remote browser.

## 9.3 Status selalu `awaiting_challenge`
- Login belum selesai (2FA/challenge masih pending).
- Selesaikan challenge di noVNC lalu panggil `POST /login/resume`.

## 9.4 Task lama `processing`
- Cek log worker + snapshot terbaru.
- Cek apakah prompt terisi, submit sudah jalan, progress berubah.
- Cek timeout: `GOOGLE_FLOW_ACTION_TIMEOUT_MS` (default `120000`).

## 9.5 Task `failed` dan `download not found`
- Lihat snapshot `*-download-not-found.png` untuk kondisi UI saat gagal.
- Verifikasi tombol download memang muncul di hasil image card/preview.
- Update selector download bila UI Google Flow berubah.

## 10. Checklist Operasional

Sebelum test:
- `google-flow-playwright-worker` healthy
- `google-flow-remote-browser` healthy
- profile ada
- status profile `authenticated`

Saat test:
- kirim request generate
- simpan `taskId`
- poll `/v1/tasks/:taskId` sampai `succeeded/failed`
- jika gagal, ambil `/v1/profiles/:id/debug` + screenshot snapshot

Sesudah test:
- jika perlu reset login:
  - `POST /v1/profiles/:id/login/reset`

