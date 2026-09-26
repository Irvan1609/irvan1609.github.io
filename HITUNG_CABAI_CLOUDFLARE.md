# Hitung Cabai — Cloudflare Free + GitHub Actions

Arsitektur ini mempertahankan GitHub Pages sebagai frontend. Deteksi berjalan di browser. Cloudflare Worker menerima foto yang sudah diperkecil dan bounding box yang telah diperiksa pengguna, kemudian menyimpannya di D1. GitHub Actions mengecek dataset setiap hari dan hanya melatih model jika minimal 100 sampel tervalidasi tersedia.

## 1. Buat D1

Di Cloudflare Dashboard, buat database D1 bernama `hitung-cabai`. Jalankan isi `cloudflare/hitung-cabai-worker/schema.sql` melalui D1 Console.

Catat **Database ID**.

## 2. Buat Worker

Buat Worker bernama `hitung-cabai-api` dengan kode dari `cloudflare/hitung-cabai-worker/src/index.js`.

Tambahkan binding D1:
- Variable name: `DB`
- D1 database: `hitung-cabai`

Tambahkan variable:
- `ALLOWED_ORIGINS=https://irvan1609.github.io`

Tambahkan secret:
- `ADMIN_TOKEN`: string acak panjang, minimal 32 karakter.
- `TURNSTILE_SECRET`: secret key Turnstile.

Jangan pernah menaruh kedua secret tersebut di repository.

## 3. Buat Turnstile

Buat widget Turnstile untuk hostname `irvan1609.github.io`. Mode Managed direkomendasikan. Salin **Site Key** untuk frontend dan **Secret Key** untuk Worker.

## 4. Hubungkan frontend

Edit `public/hitung-cabai/cloud-config.js`:

```js
export const CHILI_CLOUD_CONFIG={
  enabled:true,
  endpoint:'https://hitung-cabai-api.<subdomain-anda>.workers.dev',
  turnstileSiteKey:'SITE_KEY_ANDA',
  modelVersion:'heuristic-color-v1',
  maxUploadBytes:850000
};
```

Site Key boleh berada di frontend. Secret Key tidak boleh.

## 5. Hubungkan GitHub Actions

Di repository Settings → Secrets and variables → Actions:

**Variable**
- `CHILI_API_URL` = URL Worker tanpa garis miring terakhir.

**Secret**
- `CHILI_ADMIN_TOKEN` = nilai yang sama dengan secret `ADMIN_TOKEN` pada Worker.

Workflow `.github/workflows/train-hitung-cabai.yml` berjalan setiap hari pukul 18:30 UTC (02:30 WITA) dan juga dapat dijalankan manual.

## 6. Mekanisme pengamanan model

Model baru tidak langsung dipromosikan. Training hanya dimulai pada minimal 100 sampel. Model pertama harus mencapai mAP50 ≥ 0,55 dan recall ≥ 0,50 pada validation split deterministik. Setelah ada model produksi, kandidat berikutnya harus mempertahankan mAP50 dan recall serta menunjukkan peningkatan pada setidaknya salah satu metrik.

## 7. Batas Free dan strategi storage

Worker dan D1 memiliki batas Free. Aplikasi memakai pola **local-first**: analisis dan data kerja tetap tersedia di perangkat, sedangkan cloud digunakan untuk autentikasi, sinkronisasi, metadata, dan fungsi daring. Sinkronisasi memakai operasi delta/idempoten serta circuit breaker; saat Worker/D1 mengembalikan 429/503 atau koneksi berulang kali gagal, retry dijeda dan data lokal tetap dipertahankan.

Foto kontribusi tetap diperkecil menjadi maksimum 1.280 px dan sekitar 850 kB. Jika binding R2 `IMAGES` tersedia, objek gambar baru disimpan di R2 dan D1 hanya menyimpan metadata serta object key. Jika R2 belum tersedia, Worker tetap kompatibel dengan fallback BLOB D1. Data lama yang masih berupa BLOB tetap dapat dibaca.

Maintenance terjadwal membersihkan state OAuth/sesi kedaluwarsa, operasi idempoten lama, audit log lama, dan dataset yang sudah lama berstatus terhapus. Nilai default: idempotency 14 hari, audit 90 hari, dan dataset terhapus 30 hari; semuanya dapat diubah melalui Worker vars.
