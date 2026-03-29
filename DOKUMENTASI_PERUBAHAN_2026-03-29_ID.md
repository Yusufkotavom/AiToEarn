# Dokumentasi Perubahan (Sampai 29 Maret 2026)

Dokumen ini merangkum perubahan yang sudah dikerjakan dan sudah dipush ke `origin/main` pada rangkaian commit terbaru.

## 1) Commit Utama

- `98136b30` - `feat(web): add day-list calendar view and virtualized scheduler list`
- `63802846` - `feat: improve scheduler, relay media upload, and content manager UI`
- `677e47a8` - `feat(nav): add content manager entry and cross-tab batch controls`
- `713a5a36` - `feat(content-manager): compact mobile controls and expand draft actions`
- `8821519e` - `feat: drive explorer bookmarks, navigation, thumbnails, and rclone mount integration`

## 2) Ringkasan Fitur yang Sudah Dikerjakan

### A. Drive Explorer

- UI explorer untuk file/folder drive.
- Dukungan pilih file individual dan bulk.
- Bookmark folder path (dropdown bookmark + input manual).
- Navigasi back/forward.
- Perbaikan mobile (scroll, layout lebih ramah mobile).
- Thumbnail media.
- Integrasi pemakaian folder mount (`/mnt/social-drive`) dengan alur import.

### B. Content Manager

- Halaman `new-page-content` diarahkan menjadi content manager yang lebih kuat.
- Dukungan tampilan `list` dan `grid`.
- UI dipadatkan agar metadata/info tidak mengganggu area konten.
- Aksi batch diperluas (tidak hanya draft; lintas tab/workflow).
- Sidebar ditambah entry/menu terkait.

### C. Content Scheduler (Batch + Recurring)

- Batch schedule:
  - Mode `viral slots` (contoh 10:00, 15:00, 17:00).
  - Mode `interval` (contoh setiap 4 jam).
  - Estimasi jumlah hari dari total item.
- Recurring/schedule rule:
  - `daily`, `weekly`, `custom_weekdays`.
  - CRUD rule (`create/list/update/delete`).
- Queue overview:
  - Ringkasan `ready/queued/running/published/failed`.
- Error handling batch:
  - Menampilkan partial failure (`totalFailed`, `failedItems`) agar tidak silent fail.

### D. Integrasi Relay Publish

- Penanganan akun relay (`relayAccountRef`) agar flow publish diarahkan ke relay.
- Upload media ke relay sebelum create publish task untuk akun relay.
- Penyelarasan payload option per sosial media agar seragam dengan alur single publish.
- Perbaikan validasi YouTube (`option.youtube` jadi optional pada jalur yang relevan).
- Penambahan log diagnostik relay media upload (`started/finished`) untuk debug.
- Jalur recurring rule juga diselaraskan agar relay-aware.

### E. Accounts Calendar: View Baru `List per Day`

- Di halaman `https://api.piiblog.net/[lng]/accounts`, toolbar sekarang punya 3 view:
  - `Week`
  - `Month`
  - `List` (baru)
- View `List`:
  - Menampilkan post terkelompok per tanggal (daily separator).
  - Tombol `Create` per hari.
  - Tetap kompatibel dengan data publish record existing.

### F. Content Scheduler: List Mode Cepat

- Toggle panel `Queue | List`.
- `List` menampilkan seluruh post, dipisah per tanggal.
- Endless scroll.
- Virtualized rendering (windowed list) agar ringan untuk data besar.
- Filter:
  - Platform
  - Status (`queued/running/published/failed`)

## 3) Endpoint Backend yang Dipakai/Ditambah dalam Alur Scheduler

- `POST /plat/publish/schedule/batch`
- `POST /plat/publish/schedule/rules`
- `GET /plat/publish/schedule/rules`
- `POST /plat/publish/schedule/rules/:id`
- `DELETE /plat/publish/schedule/rules/:id`
- `GET /plat/publish/queue/overview`
- `POST /plat/publish/updateTaskTime/batch`
- `POST /plat/publish/posts`
- `POST /plat/publish/statuses/queued/posts`

## 4) File Kunci yang Berubah (high impact)

- Web:
  - `project/aitoearn-web/src/app/[lng]/content-scheduler/ContentSchedulerShell.tsx`
  - `project/aitoearn-web/src/api/scheduler.ts`
  - `project/aitoearn-web/src/app/[lng]/accounts/components/CalendarTiming/index.tsx`
  - `project/aitoearn-web/src/app/[lng]/accounts/components/CalendarTiming/CalendarToolbar.tsx`
  - `project/aitoearn-web/src/app/[lng]/accounts/components/CalendarTiming/PCDayListView.tsx`
  - `project/aitoearn-web/src/app/[lng]/accounts/components/CalendarTimingItem/components/RecordCore.tsx`
  - `project/aitoearn-web/src/store/system.ts`
- Backend:
  - `project/aitoearn-backend/apps/aitoearn-server/src/core/channel/publish.service.ts`
  - `project/aitoearn-backend/apps/aitoearn-server/src/core/channel/publishing/publishing.service.ts`
  - `project/aitoearn-backend/apps/aitoearn-server/src/core/channel/publishing/schedule-rule.service.ts`
  - `project/aitoearn-backend/apps/aitoearn-server/src/core/channel/publishing/providers/youtube.service.ts`
  - `project/aitoearn-backend/apps/aitoearn-server/src/core/relay/relay-client.service.ts`

## 5) Catatan Operasional

- File `.env` tidak ikut commit/push (tetap lokal).
- Untuk menerapkan perubahan terbaru:
  - `docker compose build`
  - `docker compose up -d`
- Verifikasi cepat:
  - `docker compose ps`
  - cek status `aitoearn-web`, `aitoearn-server`, `aitoearn-ai` harus `Up/healthy`.

## 6) Checklist Uji Manual (Disarankan)

- Drive Explorer:
  - Bookmark path tersimpan dan bisa dipilih ulang.
  - Navigasi back/forward bekerja.
  - Import dari mount path berhasil.
- Content Scheduler:
  - Batch schedule menghasilkan task sesuai estimasi.
  - Partial failure muncul jelas di UI.
  - Queue overview berubah sesuai status.
- Relay:
  - Akun relay berhasil create schedule.
  - Media upload relay muncul di log `started/finished`.
  - Post tampil dengan media di relay target.
- Accounts Calendar:
  - Tombol view `List` muncul.
  - Grouping per hari tampil benar.
  - `Prev/Next/Today` bekerja pada list mode.

