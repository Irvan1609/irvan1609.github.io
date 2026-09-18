# Midtrans QRIS Sandbox backend

Backend ini disiapkan untuk model **1 kali analisis = Rp5.000**. Frontend GitHub Pages tidak menyimpan Server Key. Server Key hanya berada sebagai secret di Cloudflare Worker.

## Endpoint

- `POST /payments/create` membuat QRIS Midtrans.
- `GET /payments/status?order_id=...` memverifikasi status langsung ke Midtrans dan menerbitkan token kredit sekali pakai.
- `POST /credits/consume` menandai kredit sudah digunakan.
- `POST /midtrans/webhook` menerima notifikasi Midtrans lalu memverifikasi ulang transaksi ke API Midtrans.
- `GET /health` memeriksa mode dan harga tanpa membuka secret.

Harga tidak dipercaya dari browser. Worker membaca `ANALYSIS_PRICE_IDR` dan default-nya Rp5.000.

## Menyiapkan Cloudflare Worker + D1

1. Buat akun Midtrans Sandbox dan ambil **Sandbox Server Key**.
2. Instal/login Wrangler, lalu dari folder `payment-worker` buat database:
   ```bash
   npx wrangler@latest login
   npx wrangler@latest d1 create statistical-web-payments
   ```
3. Salin `wrangler.toml.example` menjadi `wrangler.toml`, lalu isi `database_id` hasil langkah sebelumnya dan `PUBLIC_BASE_URL` dengan URL Worker.
4. Terapkan skema:
   ```bash
   npx wrangler@latest d1 execute statistical-web-payments --remote --file=./schema.sql
   ```
5. Simpan Server Key sebagai secret. Jangan masukkan Server Key ke GitHub atau JavaScript frontend:
   ```bash
   npx wrangler@latest secret put MIDTRANS_SERVER_KEY
   ```
6. Deploy:
   ```bash
   npx wrangler@latest deploy
   ```
7. Pastikan `https://URL-WORKER/health` menampilkan `environment: "sandbox"` dan `priceIdr: 5000`.
8. Jika `PUBLIC_BASE_URL` benar, request charge memakai `X-Override-Notification` menuju `/midtrans/webhook`. Anda juga dapat memasang URL webhook yang sama pada dashboard Midtrans.
9. Setelah backend benar-benar aktif, edit `src/payment-config.js`:
   ```js
   enabled: true,
   mode: 'sandbox',
   apiBaseUrl: 'https://URL-WORKER',
   ```
   Jangan aktifkan frontend sebelum endpoint `/health` berhasil.

## Catatan keamanan

Gate pembayaran pada tahap ini membatasi UI dan memakai kredit server-side sekali pakai, tetapi mesin statistik masih berjalan di browser. Pengguna yang sengaja memodifikasi JavaScript melalui DevTools masih dapat mencoba melewati gate. Untuk monetisasi produksi yang lebih kuat, perhitungan statistik utama perlu dipindahkan ke backend dan hanya dijalankan setelah token kredit dikonsumsi.

Gunakan Sandbox sampai alur QRIS, webhook, pemulihan transaksi, dan konsumsi kredit teruji end-to-end. Baru setelah itu pindahkan Midtrans dan Worker ke mode produksi.
