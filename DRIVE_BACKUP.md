# Cadangan data mentah tanpa login situs

## Aktivasi satu kali oleh pemilik Drive

1. Buka https://script.google.com/ dengan akun pemilik folder, lalu buat proyek baru.
2. Salin seluruh isi `scripts/drive-receiver.gs` ke `Code.gs` dan simpan.
3. Pilih **Deploy / Terapkan → New deployment → Web app**.
4. Atur **Execute as: Me / Saya**, dan **Who has access: Anyone / Siapa saja**.
5. Izinkan akses Drive melalui layar persetujuan Google. Izin ini dilakukan pemilik sekali saat penyiapan, bukan pengguna situs pada setiap analisis. Kebijakan akun dapat membatasi deployment publik.
6. Salin URL web app berakhiran `/exec`, bukan `/dev`.
7. Pada situs, pilih **Cadangan Drive**, masukkan URL tersebut, aktifkan pengiriman, dan simpan.
8. Jalankan analisis dengan DATA CONTOH NONRAHASIA. Periksa langsung bahwa Excel muncul dan dapat dibuka di folder tujuan sebelum mengandalkan cadangan.

Pemilik sudah memasang penerima publik dan memberikan URL deployment pada 14 September 2026. Situs memakai URL tersebut secara bawaan pada browser yang belum menyimpan pengaturan. Pengaturan nonaktif yang pernah disimpan tetap dihormati. Langkah di atas diperlukan hanya jika memasang ulang atau mengganti penerima. Koneksi Google Drive dalam percakapan tidak memasang atau mengizinkan Apps Script untuk situs.

## Perilaku

- Satu workbook memuat seluruh kolom dan baris dataset aktif yang digunakan pada analisis berhasil; bukan dataset lain, hasil, grafik, atau riwayat. Nama lembar `Data mentah`.
- Semua sel disimpan sebagai teks literal untuk menjaga nol awal, pemisah desimal, dan teks yang menyerupai formula. Berkas dapat diimpor kembali dengan fitur impor Excel yang sudah ada; ini bukan pemulihan seluruh proyek/pengaturan.
- Pengiriman dimulai setelah hasil berhasil dihitung. Kesalahan validasi/analisis tidak memicu pengiriman. Pemrosesan analisis tidak menunggu jaringan; tutup tab dapat membatalkan unggahan.
- Endpoint bawaan aktif untuk browser tanpa pengaturan tersimpan sesuai instruksi pemilik. Pilihan nonaktif tetap dihormati, dan pengaturan rusak menonaktifkan pengiriman. Pengaturan khusus berlaku hanya di browser ini. Tidak ada password atau token Drive dalam kode situs.
- `no-cors` menghasilkan respons opaque. **Permintaan terkirim tidak sama dengan berkas tersimpan**; aplikasi tidak menampilkan klaim sukses yang tidak dapat diverifikasi. Gagal kuota/izin di penerima juga tidak terlihat dari respons opaque. Tidak ada retry otomatis.
- Tidak ada endpoint unduh/lista berkas. Penerima hanya membaca metadata nama untuk menghindari salinan workbook identik; tidak mengirim konten Drive ke browser.
- Berkas dinamai dengan SHA-256 isi workbook. Workbook byte-identik tidak dibuat ulang. Ini bukan deduplikasi semantik dataset jika bytes XLSX berbeda.
- Maksimal 2 MiB per berkas, 50 berkas baru dan 10 MiB per hari (WITA). Tidak menghapus atau menimpa berkas lama. Tidak ada batas total kumulatif; tetap pantau kuota Drive.
- Endpoint sengaja tanpa autentikasi sesuai pilihan pemilik. Batas ini bukan autentikasi, dan tidak mencegah penghabisan kuota eksekusi oleh pihak lain. Filter signature ZIP bukan validasi lengkap Excel. Jangan membuka berkas unggahan yang tidak dikenal.
- Folder tujuan tetap menggunakan izin berbagi yang dipilih pemilik; situs tidak mengubah izin folder/berkas. Menonaktifkan checkbox menghentikan pengiriman berikutnya, bukan permintaan yang sudah berjalan. Nonaktifkan deployment di Apps Script untuk menutup penerima publik.

Dokumentasi resmi: https://developers.google.com/apps-script/guides/web

## Verifikasi aktivasi — 14 September 2026

Endpoint bawaan memberi respons anonim `{"service":"raw-data-upload","download":false}`. Satu unggahan Excel sintetis 6.714 byte melalui POST tanpa cookie/akun memberi `{"ok":true}`. Pembacaan metadata folder melalui koneksi Drive pemilik memverifikasi berkas dengan MIME XLSX dan ukuran yang sama. Nama berkas uji: `data-mentah-71ce617307897885e56bd4bf643760873c20a3d7b78c57f8a9b1488f989fa723.xlsx`.

Ini memverifikasi penerima dan penyimpanan aktual. Pengiriman browser tetap memiliki respons opaque; situs tidak dapat menyatakan unggahan berikutnya berhasil hanya dari respons tersebut. Pengujian otomatis memakai jaringan tiruan agar tidak mengirim data pengujian ke Drive pada setiap build.
