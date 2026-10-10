# Petunjuk awal untuk asisten

## Baca konteks terlebih dahulu

Sebelum menganalisis, mengubah, atau melanjutkan pekerjaan di repositori ini, baca seluruh [PAKET_MIGRASI_CHATGPT_IRVAN.md](PAKET_MIGRASI_CHATGPT_IRVAN.md). Dokumen tersebut memuat preferensi pengguna, keputusan proyek, konteks riset, serta status historis dan pekerjaan yang perlu diverifikasi.

Urutan awal:
1. Baca dokumen migrasi sampai selesai. Jika akses atau batas konteks menghalangi, nyatakan bagian yang belum terbaca.
2. Ikuti permintaan eksplisit terbaru pengguna; gunakan dokumen migrasi sebagai konteks, bukan bukti keadaan aplikasi saat ini.
3. Untuk pekerjaan software, periksa branch, HEAD, file, workflow, dan deployment yang relevan. Baca UPDATE_POLICY.md sebelum mengubah aplikasi. Bedakan peran branch Git dengan tujuan lingkungan staging/produksi yang dinyatakan pengguna.
4. Baca dokumentasi dan petunjuk lokal pada direktori yang akan dikerjakan.
5. Berikan ringkasan pemahaman singkat, lalu kerjakan permintaan yang sudah jelas tanpa meminta pengguna mengulang informasi yang tersedia.

## Prinsip kerja

- Bahasa utama: Bahasa Indonesia. Nama panggilan pengguna: Irvan.
- Pertahankan fitur yang telah disetujui; utamakan aplikasi ringan, offline-first, ketahanan data, serta kenyamanan HP dan desktop.
- Jangan mengarang data, referensi, hasil uji, commit, atau status deployment.
- Pisahkan pekerjaan selesai dan terverifikasi dari rencana, klaim historis, dan hambatan.
- Daftar pekerjaan dan jadwal lama dalam dokumen migrasi bukan perintah untuk langsung menjalankan semuanya atau membuat otomatisasi baru.
- Jangan menyalin token, kata sandi, atau rahasia ke dokumen konteks.

## Pemeliharaan konteks wajib pada setiap perubahan

Arahan pengguna, 10 Oktober 2026 (Asia/Makassar): setiap perubahan file harus disertai pembaruan konteks agar tujuan pengguna dan hasil pekerjaan dapat diteruskan ke akun/asisten berikutnya. Ini bagian dari tugas, bukan pekerjaan opsional yang harus diminta lagi.

### Awal sesi dan pemeriksaan repo
- Baca dokumen migrasi, terutama bagian 0 (keputusan terbaru) dan bagian 16 (catatan perubahan), sebelum menyimpulkan status atau mengedit file.
- Bandingkan catatan dengan branch/HEAD dan perubahan aktual yang relevan. Jika ada perubahan yang belum tercatat, jangan menebak maksud pengguna dari diff: pisahkan fakta kode, tujuan yang dinyatakan pengguna, dan dugaan yang belum dikonfirmasi.
- Pemeriksaan baca-saja tidak memerlukan commit baru bila tidak ada keputusan atau koreksi status yang perlu disimpan.

### Setiap tugas yang mengubah file
1. Catat tujuan dan hasil yang diinginkan pengguna dari percakapan, batasan yang harus dipertahankan, serta keputusan baru. Bedakan instruksi pengguna dari pilihan implementasi asisten.
2. Setelah satu rangkaian perubahan yang terkait, perbarui PAKET_MIGRASI_CHATGPT_IRVAN.md pada branch pekerjaan yang sama, sebelum mengakhiri tugas atau menyerahkan PR. Tidak perlu memperbarui untuk setiap penekanan tombol atau file sementara.
3. Perbarui bagian topik terkait dan bagian 0 bila keputusan/status aktif berubah; tambahkan catatan ringkas di bagian 16 berisi tanggal/zona waktu, tujuan, file yang diubah, perubahan, verifikasi yang benar-benar dilakukan, status, dan langkah berikutnya.
4. Sertakan konteks dalam commit/PR yang sama bila memungkinkan. Jika API menulis satu file per commit, gunakan commit dokumentasi pendamping dalam tugas yang sama. Jangan menggabungkan perubahan aplikasi lain hanya untuk memperbarui konteks di branch default; ikuti UPDATE_POLICY.md untuk perubahan aplikasi.
5. Catat branch dan hash commit implementasi yang sudah tersedia. Jangan mengarang hash commit yang belum dibuat atau membuat siklus commit hanya untuk mencantumkan hash commit dokumen itu sendiri; riwayat Git menjadi buktinya.
6. Baca kembali file yang tersimpan untuk memverifikasi pembaruan. Bila ada perubahan bersamaan, baca versi terbaru dan gabungkan catatan tanpa menimpa pekerjaan orang lain.
7. Di jawaban akhir, laporkan hasil dan bahwa konteks telah diperbarui, beserta tautan/commit yang tersedia. Jika akses tulis tidak tersedia atau gagal, berikan teks pembaruan yang siap diterapkan dan nyatakan bahwa repo belum diperbarui.

### Mutu catatan
- Simpan tujuan dan alasan keputusan, bukan hanya daftar nama file.
- Gunakan status yang jujur: direncanakan, dikerjakan, terhambat, selesai terverifikasi, atau digantikan.
- Tulis pengujian yang belum dilakukan secara eksplisit. Commit bukan bukti build/deployment/UI berhasil.
- Bila tujuan berubah, tandai keputusan lama sebagai digantikan, dengan tanggal dan alasan; pertahankan riwayat yang masih relevan.
- Simpan ringkasan yang ringkas dan dapat ditindaklanjuti, bukan seluruh percakapan. Jangan memasukkan kredensial atau data pribadi baru yang tidak diperlukan ke repo publik.
- Pembaruan dokumentasi ini sendiri cukup dicatat satu kali; tidak memerlukan catatan rekursif untuk setiap perubahan catatan.
- Aturan ini berlaku juga bagi ChatGPT di akun berikutnya yang membaca repo. Markdown tidak memperbarui dirinya sendiri dan tidak dapat mengakses percakapan akun lain; asisten yang memiliki konteks dan akses tulis harus menjalankannya.
