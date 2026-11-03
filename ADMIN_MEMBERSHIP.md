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

## Cloud Budget & emergency control

Panel Develop > Server sekarang menyediakan mode `Auto`, `Normal`, `Hemat`, dan `Darurat` tanpa redeploy Worker. Sakelar independen tersedia untuk dataset sync, upload AI, cloud game, dan pembuatan pembayaran baru. Webhook pembayaran yang sudah berjalan tetap diterima agar transaksi lama tidak hilang.

Mode Auto memakai soft budget internal data aplikasi D1. Dashboard membedakan estimasi internal ini dari meter resmi Cloudflare; rows read/write harian dan Worker requests resmi tetap harus dibaca melalui Cloudflare Analytics/dashboard.

Sinkronisasi Statistical Web bersifat adaptif: perubahan beruntun ditahan lebih lama dan digabung, tidak berjalan ketika tab tersembunyi, menghormati circuit breaker/Retry-After, lalu dilanjutkan ketika aplikasi aktif kembali.

Foto kontribusi dihitung SHA-256. Foto identik menggunakan referensi objek yang sama sehingga BLOB/R2 tidak diduplikasi. Migrasi foto lama juga menghitung hash dan melakukan deduplikasi.

Snapshot R2 diverifikasi dengan SHA-256 + read-back sebelum dicatat sukses. Snapshot harian memakai prefix `d1-logical/`, snapshot bulanan `d1-monthly/`. Workflow mencoba memasang lifecycle 30 hari untuk harian dan 365 hari untuk bulanan.
