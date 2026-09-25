# Admin, Membership, Sinkronisasi, dan Develop Console

## Admin utama

Akun admin bawaan:

`andyirvan1609@gmail.com`

Worker mempromosikan email ini menjadi role `admin` hanya setelah Google mengembalikan email terverifikasi. Admin memperoleh membership permanen, sinkronisasi dataset, akses analisis tanpa QRIS per analisis, dan Develop Console.

Variabel Worker opsional:

`ADMIN_EMAILS = "andyirvan1609@gmail.com"`

Jika variabel tidak diisi, email di atas tetap menjadi default.

## Membership

Field akses disimpan pada tabel `users`:

- `role`: `user` atau `admin`
- `membership_status`: `inactive` atau `active`
- `membership_expires_at`: tanggal berakhir opsional
- `membership_source`: `none`, `manual`, `admin`, dan dapat diperluas ke `qris`
- `access_updated_at`

Akun admin selalu dianggap aktif tanpa tanggal berakhir.

Membership aktif memperoleh:

- sinkronisasi dataset cloud;
- bypass pembayaran QRIS per analisis ketika payment gate diaktifkan nanti.

Akun gratis tetap dapat memakai fungsi lokal yang memang tidak dikunci, tetapi tidak mendapat sinkronisasi cloud.

## Optimasi Cloudflare

Sinkronisasi tidak lagi melakukan polling setiap 60 detik.

Trigger sinkronisasi:

- setelah perubahan dataset dengan debounce 3,5 detik;
- login admin/membership;
- tab kembali aktif;
- koneksi internet kembali;
- tombol Sinkronkan;
- fallback setiap 10 menit hanya ketika halaman terlihat.

`sessions.last_seen_at` hanya diperbarui maksimal sekali setiap 15 menit per sesi, bukan pada setiap request.

Pembersihan state OAuth/session lama hanya dicoba saat login Google baru dimulai dan dibatasi oleh interval cleanup Worker.

## Develop Console

URL:

`https://irvan1609.github.io/develop/`

Halaman sengaja tidak dimasukkan ke navigasi publik dan memakai `noindex,nofollow,noarchive`, tetapi keamanan tidak bergantung pada URL rahasia. Semua endpoint develop memverifikasi session dan role admin di Worker.

Fitur awal:

- total pengguna;
- jumlah admin + membership aktif;
- total dataset cloud;
- total kontribusi AI;
- sesi aktif 24 jam;
- pengguna baru 7 hari;
- daftar akun dan login terakhir;
- jumlah dataset per pengguna;
- daftar dataset cloud per pengguna;
- aktivasi/nonaktivasi membership;
- tanggal berakhir membership opsional.

Endpoint admin:

- `GET /v1/develop/overview`
- `GET /v1/develop/users`
- `GET /v1/develop/users/:id/datasets`
- `POST /v1/develop/users/:id/access`

User biasa atau membership tidak dapat memakai endpoint ini.

## QRIS

Payment gate sudah mengenali entitlement dari akun. Ketika QRIS diaktifkan nanti:

- akun gratis mengikuti aturan pembayaran;
- membership aktif melewati pembayaran per analisis;
- admin melewati pembayaran per analisis.

Pembelian membership melalui QRIS belum diaktifkan pada tahap ini. Struktur `membership_source` sudah disiapkan agar status yang berasal dari pembayaran dapat ditandai sebagai `qris` pada tahap berikutnya.

## Deploy

Perubahan role, membership, dataset gate, dan Develop Console membutuhkan deploy ulang Worker:

`cloudflare/hitung-cabai-worker/src/index.js`

Tidak ada secret baru yang wajib ditambahkan. `ADMIN_EMAILS` hanya override opsional.

Setelah deploy, health Worker terbaru menampilkan:

```json
{
  "ok": true,
  "service": "hitung-cabai-api",
  "authConfigured": true,
  "datasetSync": true,
  "membershipAccess": true,
  "developConsole": true,
  "apiVersion": "2026-09-26.1"
}
```

Setelah Worker aktif, refresh halaman. Session admin yang sudah ada akan dibaca ulang dan akun admin akan mendapat role `admin`.
