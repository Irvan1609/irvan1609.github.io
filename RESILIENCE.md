# Agrotik Resilience & Mobile Safety

Fitur ini sengaja tidak menambah banyak kontrol di layar utama.

## Akses

- Desktop: Ctrl/Cmd + K membuka command palette.
- HP: buka panel status ☁, lalu pilih Cari alat / perintah.
- Pemeriksaan lengkap: /diagnostic/.
- Admin: /develop/ → Diagnostic.

## Prinsip

- Data penelitian tidak pernah dihapus otomatis saat storage browser tinggi.
- Warning storage baru muncul mulai sekitar 85%; kondisi kritis sekitar 95%.
- Safe Mode menonaktifkan animasi dan cloud sync berat. Hitung Cabai tetap dapat memakai deteksi warna lokal tanpa memuat model AI.
- Service Worker mempertahankan maksimal satu build sebelumnya untuk rollback eksplisit.
- /stat tetap memakai riwayat/snapshot lokal yang sudah ada; Field Zero tetap memakai checkpoint lokal.
- Queue inspector hanya menyimpan metadata antrean, bukan isi dataset.
- Error report menyimpan pesan error, path, waktu, browser, status storage/queue; bukan data penelitian.

## Performance budget

Build produksi gagal jika melewati batas ukuran distribusi/JavaScript yang ditetapkan di scripts/check-performance-budget.mjs.

## Schema lokal

IndexedDB Statistical Web menggunakan migrasi versioned. Schema v2 menambahkan store metadata untuk mencatat versi migrasi tanpa mengubah data dataset/snapshot yang sudah ada.
