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

Koneksi Google Drive dalam percakapan tidak memasang atau mengizinkan Apps Script untuk situs. Integrasi belum aktif sampai langkah di atas selesai.

## Perilaku

- Satu workbook memuat seluruh kolom dan baris dataset aktif yang digunakan pada analisis berhasil; bukan dataset lain, hasil, grafik, atau riwayat. Nama lembar `Data mentah`.
- Semua sel disimpan sebagai teks literal untuk menjaga nol awal, pemisah desimal, dan teks yang menyerupai formula. Berkas dapat diimpor kembali dengan fitur impor Excel yang sudah ada; ini bukan pemulihan seluruh proyek/pengaturan.
- Pengiriman dimulai setelah hasil berhasil dihitung. Kesalahan validasi/analisis tidak memicu pengiriman. Pemrosesan analisis tidak menunggu jaringan; tutup tab dapat membatalkan unggahan.
- Pengaturan hanya berlaku di browser ini, dan nonaktif secara bawaan sampai pemilik memasang endpoint. Tidak ada password atau token Drive dalam kode situs.
- `no-cors` menghasilkan respons opaque. **Permintaan terkirim tidak sama dengan berkas tersimpan**; aplikasi tidak menampilkan klaim sukses yang tidak dapat diverifikasi. Gagal kuota/izin di penerima juga tidak terlihat dari respons opaque. Tidak ada retry otomatis.
- Tidak ada endpoint unduh/lista berkas. Penerima hanya membaca metadata nama untuk menghindari salinan workbook identik; tidak mengirim konten Drive ke browser.
- Berkas dinamai dengan SHA-256 isi workbook. Workbook byte-identik tidak dibuat ulang. Ini bukan deduplikasi semantik dataset jika bytes XLSX berbeda.
- Maksimal 2 MiB per berkas, 50 berkas baru dan 10 MiB per hari (WITA). Tidak menghapus atau menimpa berkas lama. Tidak ada batas total kumulatif; tetap pantau kuota Drive.
- Endpoint sengaja tanpa autentikasi sesuai pilihan pemilik. Batas ini bukan autentikasi, dan tidak mencegah penghabisan kuota eksekusi oleh pihak lain. Filter signature ZIP bukan validasi lengkap Excel. Jangan membuka berkas unggahan yang tidak dikenal.
- Folder tujuan tetap menggunakan izin berbagi yang dipilih pemilik; situs tidak mengubah izin folder/berkas. Menonaktifkan checkbox menghentikan pengiriman berikutnya, bukan permintaan yang sudah berjalan. Nonaktifkan deployment di Apps Script untuk menutup penerima publik.

Dokumentasi resmi: https://developers.google.com/apps-script/guides/web
