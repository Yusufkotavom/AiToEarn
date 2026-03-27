# GitHub Actions: Build & Image Upload Notes

Dokumen ini merangkum workflow yang terkait build dan upload image Docker.

## Workflow yang melakukan upload image

1. **`.github/workflows/web-build.yml`**
   - Membangun image `aitoearn-web`.
   - Push image ke Docker Hub **hanya jika** `DOCKER_HUB_TOKEN` tersedia.
   - Tag versi: `YYYYMMDD-<short_sha>`.
   - Tag `latest` dipush saat `push` ke `main`, atau manual dispatch dengan `push_latest=true`.

2. **`.github/workflows/backend-build.yml`**
   - Membangun image backend per app (`aitoearn-ai`, `aitoearn-server`) berdasarkan app yang berubah / dipilih.
   - Push image ke Docker Hub **hanya jika** `DOCKER_HUB_TOKEN` tersedia.
   - Tag versi: `YYYYMMDD-<short_sha>`.
   - Tag `latest` dipush saat `push` ke `main`, atau manual dispatch dengan `push_latest=true`.

## Workflow yang **tidak** upload image

- `.github/workflows/web-check.yml`: lint/build check web.
- `.github/workflows/backen-check.yml`: lint/build check backend.
- `.github/workflows/pr-issue-check.yml`: validasi format judul PR dan issue link.

## Kenapa kadang image tidak muncul di Docker Hub?

Penyebab paling umum: secret `DOCKER_HUB_TOKEN` belum di-set. Saat token tidak ada, workflow berjalan dalam mode **build-only** (tanpa push).

## Apa yang perlu dirubah / diperbaiki

Prioritas tinggi:

1. **Set secret repository**
   - `DOCKER_HUB_TOKEN` (required untuk upload image).
2. **Set repository variable**
   - `DOCKER_HUB_USERNAME` (opsional; default ke owner repo).
3. **Pastikan trigger branch benar**
   - Build workflow saat ini fokus di branch `main` untuk push event.

Prioritas menengah:

4. **Perbaiki typo nama file workflow**
   - `backen-check.yml` → `backend-check.yml` agar konsisten dan mudah dicari.
5. **Tambahkan fallback registry (opsional)**
   - Misalnya push ke GHCR ketika `DOCKER_HUB_TOKEN` tidak ada.
6. **Tambahkan notifikasi gagal push**
   - Supaya tim cepat tahu jika build sukses tapi upload image gagal.

## Checklist cepat debugging

- Cek apakah run log menampilkan: `Docker Hub token found: image push enabled`.
- Cek tag final di summary job.
- Cek apakah akun/namespace Docker Hub sesuai dengan `DOCKER_HUB_USERNAME`.
- Cek apakah image memang di-trigger dari perubahan path yang sesuai.
