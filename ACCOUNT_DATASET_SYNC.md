# Sinkronisasi Dataset Statistical Web dengan Akun

Tahap ini menambahkan sinkronisasi dataset Statistical Web per akun Google melalui Cloudflare Worker + D1.

## Yang disinkronkan

- file dataset CSV;
- metadata Tanaman dan Perlakuan;
- metadata kategori kolom;
- metadata perlakuan/faktor yang digunakan analisis;
- nama dataset;
- penghapusan dataset;
- revisi dataset untuk mendeteksi perubahan antarperangkat.

Riwayat editor lokal tidak disinkronkan pada tahap ini.

## Perilaku

- Login tetap opsional.
- Jika belum login, Statistical Web tetap memakai penyimpanan browser seperti sebelumnya.
- Setelah login, dataset lokal pertama kali diunggah ke akun.
- Jika akun sudah memiliki dataset cloud, dataset tersebut diterima ke browser.
- Perubahan lokal dijadwalkan untuk sinkron otomatis.
- Sinkron juga dijalankan ketika tab kembali aktif, koneksi kembali online, dan setiap 60 detik.
- Tombol **Sinkronkan** tersedia pada panel Dataset untuk sinkron manual.
- Status sinkronisasi muncul langsung di panel Dataset.
- Jika kedua perangkat mengubah dataset yang sama sebelum saling sinkron, kedua versi dipertahankan. Versi konflik diberi nama dengan penanda **Lokal** atau **Cloud** agar tidak ada data yang hilang.
- Dataset kosong bawaan `dataset.csv` tidak dibuat menjadi konflik ketika cloud sudah memiliki dataset dengan nama yang sama.
- Satu browser dikaitkan dengan akun pertama yang menyinkronkan workspace tersebut. Login dengan akun Google lain tidak otomatis mengunggah dataset akun sebelumnya ke akun baru.

## API Worker

- `GET /v1/datasets?include_deleted=1` — daftar metadata dataset milik user.
- `GET /v1/datasets/:id` — ambil isi satu dataset.
- `PUT /v1/datasets/:id` — buat/perbarui dataset.
- `DELETE /v1/datasets/:id` — tombstone dataset.

Semua endpoint membutuhkan Bearer session token dari login Google.

Update memakai `expectedRevision`. Jika revisi server berubah terlebih dahulu, Worker mengembalikan HTTP 409 dan frontend menyelesaikannya sebagai konflik tanpa menimpa data diam-diam.

## D1

Tabel:

`user_datasets`

Kolom utama:

- `id`
- `user_id`
- `name`
- `content`
- `meta_json`
- `revision`
- `created_at`
- `updated_at`
- `deleted_at`

Worker membuat tabel/index otomatis saat endpoint dataset pertama digunakan. SQL juga tersedia di `cloudflare/hitung-cabai-worker/schema.sql`.

## Deploy Worker

Frontend GitHub Pages tidak dapat menambahkan endpoint ke Worker yang sudah berjalan. Setelah kode repository diperbarui, deploy ulang:

`cloudflare/hitung-cabai-worker/src/index.js`

ke Worker:

`hitung-cabai-api`

Tidak perlu mengubah `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET`, atau `ADMIN_TOKEN`.

Setelah deploy, buka:

`https://hitung-cabai-api.andyirvan1609.workers.dev/v1/health`

Worker terbaru menampilkan:

```json
{
  "ok": true,
  "service": "hitung-cabai-api",
  "authConfigured": true,
  "datasetSync": true,
  "apiVersion": "2026-09-25.2"
}
```

## Uji dua perangkat

1. Login akun Google yang sama pada PC.
2. Buka Statistical Web dan tekan **Sinkronkan**.
3. Pastikan status menjadi **Tersinkron**.
4. Login akun yang sama pada HP.
5. Buka Statistical Web.
6. Dataset dari PC harus muncul di HP.
7. Ubah satu nilai di HP.
8. Tunggu sinkron atau tekan **Sinkronkan**.
9. Buka kembali PC/fokuskan tab, lalu nilai terbaru harus diterima.

Untuk menguji konflik, ubah dataset yang sama pada PC dan HP ketika salah satu perangkat offline, lalu online-kan keduanya. Statistical Web harus menyimpan kedua versi, bukan membuang salah satunya.
