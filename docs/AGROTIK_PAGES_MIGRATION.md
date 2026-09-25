# Agrotik: migrasi ke Cloudflare Pages

Status: persiapan sumber; proyek Pages dan ketersediaan subdomain belum dikonfirmasi.

## Hosting frontend

- Git provider: GitHub, repository `Irvan1609/irvan1609.github.io`.
- Project name: `agrotik` jika tersedia. Jika nama tidak tersedia, tentukan alternatif bersama pemilik.
- Untuk pengujian awal gunakan branch `migration/agrotik-pages-ready`; setelah perubahan digabung, ubah production branch menjadi `master`.
- Framework preset: Vite.
- Root directory: root repository (kosong).
- Build command: `npm run build`.
- Build output directory: `dist`.
- Node: 22, ditetapkan melalui `.node-version`.
- Upload hanya hasil `dist`, bukan root repository: root juga berisi kode Worker, skrip, dan skema database.
- Frontend tetap statis; tidak perlu memasang Pages Functions atau memindahkan database untuk migrasi ini.

## Konfigurasi layanan setelah alamat berhasil dimiliki

1. Pertahankan API `https://hitung-cabai-api.andyirvan1609.workers.dev` dan database/bucket yang ada.
2. Pada Worker tersebut, perbarui `ALLOWED_ORIGINS` menjadi daftar berisi alamat lama dan alamat baru yang sudah dikonfirmasi, misalnya `https://irvan1609.github.io,https://agrotik.pages.dev`.
3. Jangan menambahkan wildcard `*.pages.dev` atau alamat yang belum Anda miliki. Allowlist juga dipakai untuk memvalidasi tujuan kembali login.
4. Tambahkan hostname produksi yang sudah dimiliki ke widget Turnstile. Jangan menghapus hostname lama sebelum pengujian selesai.
5. OAuth memakai callback Worker yang tetap sama: `https://hitung-cabai-api.andyirvan1609.workers.dev/v1/auth/google/callback`. Periksa konfigurasi Google yang berlaku; jangan mengganti callback menjadi domain frontend. Uji login kembali ke origin baru.
6. Jika payment-worker terpisah digunakan, periksa `ALLOWED_ORIGIN` dan URL kembali pembayaran. Pertahankan kunci rahasia hanya di server.

## Data pengguna dan perpindahan

Penyimpanan browser terikat origin. Dataset lokal, foto, anotasi, dan sesi pada github.io tidak otomatis tersedia di pages.dev.

- Sebelum beralih, ekspor/cadangkan seluruh dataset lokal dan foto yang diperlukan melalui fitur yang tersedia. Verifikasi hasil cadangan.
- Pengguna dengan hak sinkronisasi: selesaikan sinkronisasi pada alamat lama, lalu login dan verifikasi data pada alamat baru.
- Pengguna tanpa hak sinkronisasi: gunakan ekspor/impor; jangan menganggap data lokal sudah ada di server.
- Jangan membuat redirect paksa atau menutup alamat lama sebelum pemulihan data telah diuji.

## Pemeriksaan sebelum cutover

- Buka /, /stat/, /hitung-cabai/, /kamera-pengukur/, /print-skripsi/, /mendeley/, /account/, /membership/, dan /develop/ langsung dari URL.
- Uji login/logout, hak admin/member, sinkronisasi, unggah foto dan Turnstile, ekspor serta alur pembayaran yang aktif.
- Pastikan pengguna biasa tidak mendapat akses admin dan dataset akun lain.
- Setelah lolos, gabungkan perubahan, jadikan master production branch, lalu ubah repository ke private apabila integrasi Cloudflare tetap memiliki akses.
- GitHub Pages dari repository privat membutuhkan paket GitHub yang mendukungnya; jangan bergantung pada alamat lama tetap hidup setelah repository menjadi private.

## Biaya

Paket Pages Free menyediakan hosting statis dan subdomain pages.dev tanpa biaya dalam ketentuannya; terdapat batas build, jumlah file, dan ukuran file. Worker, D1, R2, dan Workers AI mempunyai kuota serta penagihan tersendiri. Migrasi frontend tidak menghapus biaya backend yang sudah aktif.

Referensi: https://developers.cloudflare.com/pages/platform/limits/
https://developers.cloudflare.com/pages/functions/pricing/
https://developers.cloudflare.com/pages/get-started/git-integration/
