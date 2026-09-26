# Admin, Membership, Account Center, Develop, dan QRIS

## Role

Role aplikasi:

- `user`: akun gratis.
- membership aktif: tetap role `user`, tetapi memperoleh entitlement membership.
- `admin`: akses tertinggi.

Admin bawaan adalah Google account terverifikasi:

`andyirvan1609@gmail.com`

Worker juga mendukung override `ADMIN_EMAILS`. Admin selalu dianggap membership aktif permanen.

## Entitlement

Akun gratis:
- penggunaan lokal tetap tersedia sesuai fitur halaman;
- tidak mendapat cloud dataset sync;
- jika payment gate analisis diaktifkan, mengikuti aturan pembayaran per analisis.

Membership:
- cloud dataset sync;
- kuota dataset dan penyimpanan mengikuti paket;
- analisis termasuk tanpa QRIS per analisis;
- Account Center dan riwayat membership.

Admin:
- seluruh entitlement membership tanpa tanggal berakhir;
- tanpa pembayaran membership dan tanpa QRIS per analisis;
- menu **Develop** pada profil;
- akses server-side ke `/develop/`.

## Account Center

URL:

`https://irvan1609.github.io/account/`

Fitur:
- status akun/role/membership;
- penggunaan dan kuota cloud;
- sesi aktif;
- cabut sesi perangkat lain;
- riwayat pembayaran membership;
- ekspor data akun JSON;
- tautan upgrade/kelola membership.

## Membership

URL:

`https://irvan1609.github.io/membership/`

Paket disimpan di D1, bukan hard-coded UI. Admin mengatur dari Develop:
- nama;
- deskripsi;
- durasi;
- harga;
- jumlah dataset;
- batas storage;
- aktif/nonaktif.

Paket default dibuat nonaktif dengan harga 0 sehingga tidak ada harga komersial yang diinventarisasi otomatis. Admin harus mengisi harga dan mengaktifkan paket.

## QRIS membership

Membership menggunakan Midtrans Core API QRIS dari Worker akun yang sama. Webhook tidak dipercaya sendirian: Worker mengambil ulang status transaksi dari Midtrans dan mencocokkan nominal sebelum membership diterapkan.

Secret Worker:

`MIDTRANS_SERVER_KEY`

Vars:

`MIDTRANS_ENV = "sandbox"`

`MEMBERSHIP_PUBLIC_BASE_URL = "https://hitung-cabai-api.andyirvan1609.workers.dev"`

Health akan menampilkan `membershipPayments:true` setelah Server Key tersedia.

## Develop

URL:

`https://irvan1609.github.io/develop/`

Tab:
- Overview
- Users
- Membership
- Payments
- Datasets
- Hitung Cabai / AI
- Server
- Audit Log
- Backups

URL dibuat tidak terindeks mesin pencari, tetapi keamanan tidak bergantung pada URL. Semua endpoint `/v1/develop/*` memverifikasi session dan role admin di Worker.

Support view bersifat read-only. Sistem tidak mengeluarkan token impersonasi user.

## Manajemen pengguna

Admin dapat:
- memberi/mencabut membership manual;
- memilih paket dan tanggal kedaluwarsa;
- suspend/resume akun non-admin;
- mencabut semua session user;
- melihat ringkasan dan dataset metadata user dalam Support View.

Admin utama tidak dapat disuspend atau diturunkan melalui Develop.

## Kuota cloud

Kuota disimpan pada `membership_plans`:
- `dataset_limit`
- `storage_limit_bytes`

Worker memeriksa kuota sebelum INSERT/UPDATE dataset. Admin tidak dibatasi kuota paket.

## Optimasi Cloudflare

Dataset sync:
- perubahan kecil dikirim sebagai delta/idempotent operation dan perubahan beruntun digabung sebelum dikirim;
- sync dijalankan saat login, tab kembali aktif, koneksi pulih, atau tombol manual;
- circuit breaker menghentikan retry agresif setelah kegagalan berulang atau respons 429/503; `Retry-After` dihormati;
- selama cloud dijeda/offline, dataset tetap aman dan dapat digunakan dari penyimpanan lokal;
- akun tanpa entitlement cloud tidak menjalankan polling sync.

Storage:
- D1 menyimpan akun, metadata, dataset terstruktur, entitlement, dan metadata kontribusi AI;
- R2 binding `IMAGES` menyimpan foto kontribusi baru bila tersedia; BLOB D1 tetap menjadi fallback kompatibilitas;
- R2 binding `BACKUPS` menyimpan snapshot logis D1;
- workflow deploy mencoba menemukan atau membuat bucket `irvan-contribution-images` dan `irvan-backups`; bila token tidak memiliki izin R2, deployment tetap menggunakan fallback.

Retention default:
- operasi idempoten: 14 hari;
- audit log: 90 hari;
- dataset berstatus terhapus: 30 hari.

`sessions.last_seen_at` hanya ditulis maksimal satu kali per 15 menit per sesi.

## Audit

Tabel `audit_logs` mencatat tindakan sensitif seperti:
- perubahan membership;
- perubahan paket;
- support read-only view;
- suspend/resume akun;
- revoke session;
- pembuatan/unduh/ekspor backup;
- penerapan pembayaran membership.

## Backup & disaster recovery

Ekspor logis admin selalu tersedia dari Develop.

Untuk snapshot otomatis eksternal, buat R2 bucket dan binding:

`BACKUPS`

Contoh konfigurasi ada di `cloudflare/hitung-cabai-worker/wrangler.toml.example`. Handler terjadwal membuat logical backup JSON ke R2. Develop menampilkan status, ukuran, dan tombol unduh snapshot.

R2 direkomendasikan karena snapshot di luar D1 tetap tersedia bila terjadi masalah pada database D1.

## Worker health terbaru

Setelah deploy Worker terbaru:

```json
{
  "ok": true,
  "service": "hitung-cabai-api",
  "authConfigured": true,
  "datasetSync": true,
  "membershipAccess": true,
  "developConsole": true,
  "accountCenter": true,
  "membershipPayments": true,
  "apiVersion": "2026-09-26.16"
}
```

`membershipPayments` akan `false` sampai `MIDTRANS_SERVER_KEY` dipasang.


## Cloud budget & emergency

Develop → Server memiliki kontrol cloud terpusat dengan mode:
- `Auto`: normal secara default, berubah ke hemat sekitar 80% estimasi kapasitas D1 dan darurat sekitar 95%; error kuota harian D1 juga memicu mode darurat sampai reset UTC.
- `Normal`: fitur mengikuti toggle admin.
- `Hemat`: upload kontribusi AI dan fitur sosial Field Zero dijeda; dataset sync dan save game cloud tetap berjalan dengan interval lebih longgar.
- `Darurat`: dataset sync, upload AI, sosial game, save game cloud, dan transaksi membership baru dijeda. Data/analisis lokal tetap berfungsi.

Toggle terpisah tersedia untuk Dataset Sync, Upload AI, Sosial Game, Save Game Cloud, dan Pembayaran Baru. Kebijakan disimpan di D1 tetapi dibaca melalui cache Worker agar tidak menambah query pada setiap aksi.

Dashboard Server menampilkan estimasi storage aplikasi, storage R2 yang diamati ketika tab Server dibuka, serta referensi Free tier. Request Worker dan rows read/write resmi tetap harus dibaca dari Cloudflare Analytics/Dashboard; aplikasi sengaja tidak menulis counter per request ke D1.

## Deduplikasi foto kontribusi

Foto kontribusi Hitung Cabai dihitung SHA-256 setelah proses resize/kompresi. Jika object dengan hash identik sudah ada di R2, object dipakai ulang dan hanya metadata/anotasi baru yang ditulis ke D1. Foto lama yang dimigrasikan D1 → R2 memakai mekanisme deduplikasi yang sama.

## Verifikasi dan retention backup

Snapshot R2 dibaca ulang setelah dibuat, checksum SHA-256 diverifikasi, JSON divalidasi, dan struktur tabel diperiksa. Snapshot manual menjalankan validasi mendalam. Pada tanggal 1 UTC, snapshot terjadwal juga menjalankan simulasi restore read-only yang memeriksa ID unik dan referensi user tanpa menulis kembali ke database produksi.

Workflow memasang lifecycle pada bucket BACKUPS bila izin R2 tersedia:
- `d1-logical/`: 30 hari;
- `d1-monthly/`: 365 hari.

Bucket foto `IMAGES` tidak diberi expiry otomatis karena foto dapat menjadi bagian dataset pelatihan.
