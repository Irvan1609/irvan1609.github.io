# Aktivasi Membership QRIS

Implementasi membership sudah tersedia pada:

- Frontend: `/membership/`
- Account Center: `/account/`
- Admin: `/develop/`
- Backend: `cloudflare/hitung-cabai-worker/src/index.js`

## 1. Deploy Worker terbaru

Deploy ulang Worker `hitung-cabai-api` dengan kode terbaru.

Health target:

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

Jika `membershipPayments` masih `false`, secret Midtrans belum tersedia pada Worker ini.

## 2. Tambahkan Midtrans Server Key ke Worker akun

Cloudflare Dashboard → Workers & Pages → `hitung-cabai-api` → Settings → Variables and Secrets.

Secret:

`MIDTRANS_SERVER_KEY`

Vars:

`MIDTRANS_ENV = "sandbox"`

`MEMBERSHIP_PUBLIC_BASE_URL = "https://hitung-cabai-api.andyirvan1609.workers.dev"`

Gunakan Sandbox Server Key saat `MIDTRANS_ENV=sandbox`. Jangan menyimpan Server Key di repository atau frontend.

## 3. Atur paket di Develop

Buka:

`https://irvan1609.github.io/develop/`

Tab **Membership**.

Paket seed awal sengaja dibuat nonaktif dan harga Rp0. Isi harga yang Anda inginkan, durasi, batas dataset, batas storage, lalu aktifkan paket.

Setelah paket aktif dan `MIDTRANS_SERVER_KEY` tersedia, paket muncul pada:

`https://irvan1609.github.io/membership/`

## 4. Alur pembayaran

1. User login Google.
2. User membuka Membership.
3. User memilih paket.
4. Worker membuat transaksi QRIS Midtrans.
5. Browser menampilkan QR.
6. Browser memeriksa status transaksi.
7. Midtrans juga mengirim notification ke Worker.
8. Worker mengambil ulang status dari Midtrans dan mencocokkan nominal.
9. Hanya status `settlement` yang mengaktifkan membership.
10. Membership memperpanjang tanggal aktif dan menyimpan `membership_source=qris`.

Admin tidak dapat membeli membership karena akses admin bersifat permanen.

## 5. Backup R2

Untuk logical backup eksternal, buat bucket R2, contoh:

`irvan-backups`

Binding Worker:

`BACKUPS`

Contoh Wrangler sudah tersedia. Cron contoh berjalan pukul 18:00 UTC = 02:00 WITA.

Snapshot menyimpan akun, dataset cloud, konfigurasi paket, transaksi membership, audit log, dan metadata kontribusi AI. Blob foto kontribusi AI tidak dimasukkan ke logical snapshot ini.

Tanpa R2, admin tetap dapat mengunduh logical backup manual dari Develop → Backups.
