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
- debounce perubahan sekitar 3,5 detik;
- sync saat login, tab kembali aktif, koneksi pulih, atau tombol manual;
- fallback 10 menit hanya ketika halaman terlihat;
- akun gratis tidak menjalankan polling sync.

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
  "apiVersion": "2026-09-26.2"
}
```

`membershipPayments` akan `false` sampai `MIDTRANS_SERVER_KEY` dipasang.
