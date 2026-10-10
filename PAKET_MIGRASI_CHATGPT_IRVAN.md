# PAKET MIGRASI CHATGPT --- IRVAN

**Tanggal pembaruan:** 10 Oktober 2026\
**Tujuan:** Memberi akun ChatGPT baru konteks yang cukup untuk
melanjutkan pekerjaan tanpa meminta pengguna mengulang semua keputusan
sebelumnya.

> **Instruksi untuk asisten baru:** Baca seluruh dokumen ini sebagai
> konteks kerja. Prioritaskan status terbaru dan keputusan eksplisit
> pengguna. Jangan mengklaim telah mengubah GitHub, Cloudflare, file,
> atau aplikasi kecuali benar-benar menjalankan tindakan tersebut dan
> memverifikasinya. Jika melanjutkan proyek perangkat lunak, periksa
> kondisi repositori/branch/commit terkini terlebih dahulu. Pengguna
> sering menjawab **"Y"** untuk berarti "ya, lanjutkan". Jangan terus
> meminta konfirmasi untuk pekerjaan yang sudah jelas disetujui.

------------------------------------------------------------------------

## 0. Keputusan terbaru dan cara melanjutkan

**Pembaruan: 10 Oktober 2026, Asia/Makassar.**

- Pengguna meminta konteks kerja lintas akun disimpan di repo dan dibaca terlebih dahulu oleh asisten baru.
- Arahan terbaru: setiap tugas yang mengubah file juga harus memperbarui dokumen ini tanpa perlu diminta lagi. Catat keinginan pengguna, alasan keputusan, perubahan aktual, verifikasi, dan pekerjaan tersisa. Aturan lengkap ada di [AGENTS.md](AGENTS.md).
- Baca bagian ini dan catatan perubahan (bagian 16), lalu seluruh konteks yang relevan sebelum melanjutkan. Pernyataan historis pada bagian 1–15 tetap perlu diverifikasi terhadap keadaan terkini.
- Dokumen ini adalah memori kerja yang dipelihara oleh asisten, bukan sinkronisasi otomatis percakapan lintas akun. Instruksi eksplisit terbaru pengguna tetap menjadi acuan.
- Status aplikasi, bug, dan deployment dalam dokumen impor belum diaudit ulang dalam tugas dokumentasi ini.
- Arahan terbaru fitur Pengamatan (10 Oktober 2026): sampel anak langsung unit percobaan (tanaman/buah), jumlah dapat berbeda antarunit; urutan campuran BB semua sampel lalu PB/TB/LB per sampel diulang pada unit berikutnya; panen berbeda menjadi parameter tersendiri (bb-p1, bb-p2). Rekap rerata/jumlah per unit disetujui.

## 1. Profil dan cara bekerja

-   Nama panggilan yang disukai: Irvan. Jangan terlalu sering menyebut
    nama; gunakan bila relevan.
-   Bahasa utama: Bahasa Indonesia akademik, formal, baku, dan efektif.
-   Profesi: peneliti agronomi; fokus pada sistem produksi tanaman,
    G×E×M, fisiologi tanaman, kesuburan tanah, efisiensi air dan hara,
    serta pengelolaan lahan berkelanjutan.
-   Standar ilmiah: bertindak sebagai reviewer senior jurnal Scopus Q1.
    Kritik logika, rancangan, statistik, keterbatasan, dan klaim novelty
    secara eksplisit; berikan perbaikan yang konkret.
-   Untuk pertanyaan ilmiah, utamakan literatur 10 tahun terakhir dan
    berikan DOI/tautan yang dapat diakses. Gunakan sumber nyata dan
    jangan mengarang referensi. Google Scholar dapat dipakai untuk
    menemukan literatur, tetapi sitasi sebaiknya mengarah ke
    artikel/DOI/penerbit yang benar.
-   Fokus diskusi agronomi pada mekanisme fisiologis/biokimia/biofisika,
    bukan hanya deskripsi. Nama ilmiah tanaman harus *italic*. Satuan SI
    konsisten, misalnya t ha⁻¹, kg ha⁻¹, µmol m⁻² s⁻¹. Sertakan konteks
    statistik (p-value, R², SE/SD, rancangan dan asumsi) bila relevan.
-   Gaya kerja: lugas, teliti, konkret, tidak bertele-tele. Jangan
    membuat UI terlalu ramai, banyak modal/pop-up, padding besar, header
    besar, atau tombol redundan.
-   Untuk aplikasi: utamakan ringan, cepat, mobile + desktop,
    offline-first, privasi lokal, ketahanan data, auditabilitas, dan
    hasil yang dapat direproduksi. Jangan mengarang angka hasil
    analisis.
-   Pengguna mudah frustrasi jika asisten mengatakan "sudah" padahal
    tampilan/perubahan belum terbukti. Laporkan status faktual: apa yang
    benar-benar diubah, commit/URL yang terverifikasi, apa yang belum
    selesai, dan apa yang menghalangi.
-   Jangan mengganti fitur/keputusan yang sudah disetujui tanpa alasan.
    Pertahankan fitur yang ada saat melakukan refactor.

## 2. Prioritas proyek utama: Agrotik

### Tujuan produk

Agrotik adalah platform ringan bagi peneliti pertanian untuk mengelola
data eksperimen, analisis statistik, dan dokumentasi penelitian. Prinsip
inti: 1. Data mentah adalah sumber kebenaran; jangan mengubahnya
diam-diam. 2. Offline-first dan privasi-first; data lokal tetap
berfungsi tanpa login. 3. Sinkronisasi cloud bersifat opsional dan
memerlukan login. 4. AI boleh membantu interpretasi, tetapi mesin
statistik yang tervalidasi menentukan angka. 5. Hasil harus dapat
diaudit, divalidasi, dan direproduksi. 6. Autosave lokal setiap
perubahan (dengan debounce); pengguna tidak seharusnya harus menekan
Simpan untuk pekerjaan normal. 7. Konflik sinkronisasi tidak boleh
menimpa suntingan orang lain; simpan kedua versi dan tampilkan mekanisme
resolusi. 8. Member/Admin perlu riwayat undo/redo. 9. Antarmuka ringkas,
tidak mengganggu, dan nyaman di HP maupun PC.

### Deployment dan repositori

-   Repositori utama yang pernah digunakan:
    `Irvan1609/irvan1609.github.io`.
-   GitHub Pages: lingkungan testing/staging, bukan produksi final.
-   Cloudflare Pages: target produksi/komersial.
-   Produksi yang direncanakan hanya landing page `/` dan produk
    statistik `/stat/`. Modul lain tetap berada di staging sampai
    diputuskan berbeda.
-   Preferensi deploy: GitHub Actions.
-   Pernah dicatat branch `production` disiapkan, tetapi deployment
    Cloudflare belum tuntas karena izin/token Cloudflare Pages Edit
    belum tersedia. Jangan menganggap ini sudah terselesaikan tanpa
    verifikasi.
-   Pada 2 Oktober 2026, versi staging yang disebut untuk uji HP:
    `https://irvan1609.github.io/stat/`; commit yang pernah dilaporkan
    `65b2f54151b1f0775aa9ae319c7662c48b3a2fb6`, dan perubahan mobile
    berikutnya disebut dengan commit
    `ff799bb8ab129ca369f8fff10dc88a6f...` (hash yang tersimpan tidak
    lengkap). Verifikasi HEAD terkini sebelum menggunakan informasi ini.
-   Pada 26 September 2026, pernah dilaporkan commit
    `64813c1cc9f2a4a530a20e8e5c77a9182f4018d3` untuk hardening keamanan.
    Itu bukan bukti bahwa semua pekerjaan UI berikutnya sudah selesai.
-   Ada branch refactor `refactor/agrotik-core-v1` yang disebut memiliki
    IndexedDB v4 untuk Dataset/History/Analysis/sync/trash,
    `dataset_uid`/`analysis_uid` untuk provenance, migrasi metadata yang
    aman, dan perbaikan tema Field Zero. Status saat itu: belum siap
    produksi dan masih menunggu verifikasi browser.
-   Jangan menjadikan klaim riwayat ini sebagai kondisi Git terkini.
    Periksa branch, workflow, commit, dan deployment yang benar-benar
    ada sebelum melanjutkan.

### Fitur keamanan yang pernah dilaporkan

Pernah disebut sudah diterapkan dalam salah satu commit: Gitleaks,
ownership guards, isolasi statis A/B, batas upload/request, rate limit
(30/60 detik untuk publik; 180/60 detik untuk mutasi pengguna),
Turnstile sisi server, ekspor beridentitas merek, dan CORS. Pengujian
A/B langsung masih menunggu variabel `CHILI_API_URL`,
`AUTHZ_TEST_USER_A_TOKEN`, dan `AUTHZ_TEST_USER_B_TOKEN`. Verifikasi
ulang sebelum menyatakan fitur ini aktif di produksi.

### Kredit aplikasi

-   Statistik Web --- Irvan
-   Pengukur --- Irvan
-   Hitung --- Irvan
-   Field Zero --- Irvan
-   Print Skripsi --- Irvan
-   Mendeley --- Kautsar

### Preferensi UI global

-   Ringkas, serius, bersih, cepat, minim popup.
-   Hindari ruang kosong, padding/margin/line-height berlebihan dan
    header besar.
-   Mobile dan desktop harus sama-sama fungsional.
-   Jangan sampai ada horizontal scrolling pada keseluruhan halaman HP;
    area tabel tertentu boleh digeser kiri-kanan.
-   Menu melayang tidak boleh bertumpuk; membuka satu popup menutup
    popup lain, dan menekan tombol yang sama kedua kali menutupnya.
-   Jangan menutupi kontrol atau area kerja dengan bottom bar. Tombol
    aksi mudah dijangkau dan tidak menutupi data.
-   Pengguna menyukai tampilan hasil analisis berbentuk
    kotak-kotak/cards yang sebelumnya digunakan, dengan area hasil dapat
    digeser horizontal bila perlu.
-   Pengaturan ukuran font kecil/sedang/besar harus bekerja dan
    tersimpan.
-   Jangan mengklaim fitur sudah berhasil hanya berdasarkan commit; uji
    di tampilan HP nyata/viewport kecil dan laporkan kekurangannya.

## 3. Modul `/stat` --- aplikasi statistik pertanian

### Tujuan dan rancangan

-   Semua analisis utama harus terlihat langsung dalam satu layar;
    jangan gunakan label "mode sederhana/lengkap" dan jangan ada pilihan
    "Pilih analisis" yang tidak perlu.
-   Default parameter otomatis/semua parameter aktif jika sesuai.
-   Hasil analisis memenuhi layar; tombol X di kiri atas, menu tiga
    titik/ekspor tetap di kanan atas; ekspor Excel di bagian akhir.
-   Navigasi yang pernah diinginkan: `< Kembali`, File, Analisis,
    Dataset, Data, Bantuan, Cari, Pengaturan. Popup saling eksklusif.
-   Hilangkan bottom bar saat layar hasil analisis jika mengganggu.
-   Font kecil/sedang/besar harus berlaku di seluruh modul.
-   Editor data: dataset baru dimulai dari 1 baris × 1 kolom; kontrol
    `+col` dan `+row` di kiri atas editor; menu tiga titik dataset harus
    menempel pada konteks dataset yang benar.
-   Dukungan pinch zoom dua jari pada editor tabel; ukuran tersimpan
    saat reload. Pernah dilaporkan rentang zoom 65--165%, tetapi perlu
    verifikasi.
-   Freeze panes/kolom harus tidak merusak pengeditan. Pemilihan freeze
    perlu jelas.
-   Data editor tidak boleh tertutup bottom bar atau menu melayang.
-   Pengguna ingin layout/hasil dapat digeser horizontal, bukan dipaksa
    rapat dan statis.
-   Saat menambah dataset, tampilkan 1×1 langsung, bukan lembar kosong
    tanpa struktur.
-   Data autosave lokal. Sinkronisasi cloud opsional setelah login.

### Statistik dan keluaran

-   Mendukung RAL dan RAK.
-   Struktur data: perlakuan, ulangan, parameter.
-   Uji lanjut: tanpa uji lanjut, BNT/LSD, BNJ/Tukey HSD.
-   Pilihan taraf signifikansi: 0,05; 0,01; 0,1.
-   Mendukung koma/titik sebagai pemisah desimal.
-   Pertahankan urutan perlakuan sebagaimana dataset.
-   Tabel ekspor menyertakan nama dataset dan huruf superskrip untuk
    kelompok beda nyata.
-   Pengaturan arah optimum per parameter (nilai tertinggi atau terendah
    lebih baik).
-   Kamus data hanya memberi saran, tidak mengganti nama kolom otomatis.
    Contoh `tt` ↔ tinggi tanaman ↔ cm. Pisahkan istilah Indonesia dan
    Inggris.
-   Jangan membuat tabel definisi perlakuan di BAB IV; metadata
    menangani informasi itu.
-   Ekspor tabel analisis harus siap dicetak.
-   Setiap analisis harus punya validasi input/asumsi, catatan metode,
    audit trail, dan keluaran yang dapat direproduksi. Jelaskan jika
    data tidak memenuhi syarat atau asumsi tidak diperiksa.
-   Tidak boleh mengarang hasil statistik atau menyamarkan data yang
    hilang.

### Menu Pengamatan — keputusan 10 Oktober 2026

- Sampel anak langsung unit percobaan; jenis dapat tanaman, buah, atau lainnya. Label U1G1(1), U1G1(2); U1 menunjukkan ulangan 1.
- Urutan pengguna: bb-1, bb-2, bb-3, bb-4, bb-5, pb-1, tb-1, lb-1, pb-2, tb-2, lb-2, …, lb-5; setelah selesai diulang pada unit berikutnya.
- Jumlah sampel boleh berbeda antarunit. Parameter panen terpisah, misalnya bb-p1 dan bb-p2; tidak menambah tingkat tanaman → buah atau dimensi panen tersendiri.
- Pengguna menyetujui data mentah sampel dan rekap rerata/jumlah per unit. Sampel tidak otomatis menjadi ulangan independen.
- Pilihan implementasi asisten: kelompok per parameter/per sampel serta urutan rinci manual; identitas internal stabil, penyimpanan lokal IndexedDB terpisah, cadangan JSON, ekspor CSV, dataset rekap baru tanpa menimpa data aktif.

### Modul `/denah`

-   Tab `/denah` berada di sebelah Analisis.
-   Tab di kiri; Settings/Search di kanan.
-   Plot memiliki `plot_uid`.
-   Undo/redo untuk layout, status, catatan, jalan, arah utara, dan
    batch.
-   Validasi sebelum meninggalkan blok.
-   Denah harus ringkas dan mudah digunakan di HP.

## 4. Field Zero --- game agronomi

-   Game pertanian kompetitif tetapi tidak berlebihan; ringan di HP/PC.
-   Terhubung secara konsep dengan `/stat`, genetika, Rancob, pemuliaan,
    persilangan, dan analisis hasil.
-   Siklus: peta/plot → tanam/perlakuan/pemeliharaan → panen (misalnya
    tinggi tanaman, diameter/bobot, jumlah biji, hasil) → pilih tanaman
    → seleksi/kemajuan generasi.
-   Tiga kelompok; plot/peta; genotipe/varietas memperlihatkan sifat
    sejak awal, sedangkan galur baru menunjukkan homogenitas setelah
    diseleksi.
-   Uji pemupukan, air, jarak tanam; tanah, hara, lingkungan,
    gulma/hama, dan tindakan budidaya yang realistis.
-   Anggaran, biaya nyata, pekerja dibayar dengan uang (bukan energi),
    pupuk Phonska/Urea, hadiah riset, dan peluang komersial pada musim
    pertama.
-   Tanaman tidak terbatas pada jagung.
-   Irigasi dan kebutuhan air jagung harus masuk akal.
-   Fitur sosial: teman, leaderboard, bantuan/raid bila sesuai; validasi
    skor di server, cooldown dan proteksi terhadap kecurangan untuk
    fitur kompetitif.
-   UX sederhana; ikon lebih baik daripada teks panjang bila jelas;
    tidak menggunakan gambar berat.
-   Mode terang/gelap harus konsisten; sebelumnya area tertentu tetap
    gelap saat mode terang dan pilihan tema kembali setelah reload.
-   Panen mendukung drag-and-drop.
-   Musik utama orisinal yang pernah diusulkan: "Pagi di Lahan".
-   Pernah ada error `/game/`: `COSTS is not defined`. Harus diperiksa
    dan diperbaiki, jangan menganggap sudah selesai.
-   Pengguna mengeluhkan game tidak full-screen, tombol melayang belum
    terlihat/berfungsi, dan fitur PC/HP belum setara. Pada 2 Oktober
    2026 pengguna meminta perbaikan langsung di GitHub, lalu menyatakan
    hasil belum berubah beberapa kali. Ini prioritas UX yang belum boleh
    ditandai selesai tanpa bukti visual/tes.

## 5. Modul lain dalam ekosistem Agrotik

### `/pengukur`

Pengguna pernah meminta seluruh perbaikan yang diperlukan. Pertahankan
pendekatan ringan, responsif, praktis, dan konsisten dengan UI Agrotik.
Periksa kondisi terkini sebelum menentukan daftar bug yang masih ada.

### `/hitung-cabai`

-   Aplikasi penghitungan cabai dari foto tampak atas pada lembar A4,
    dengan opsi label.
-   Label dapat di bawah/tengah bidang atau pada foto; nama file menjadi
    label sampel.
-   Kalibrasi menggunakan penggaris/objek eksternal.
-   Backend Worker yang pernah digunakan:
    `hitung-cabai-api.andyirvan1609.workers.dev`.
-   Dataset/proyek Roboflow yang pernah disebut: workspace `chili`,
    project `chili-dem2l`, versi 1.
-   Harus nyaman di laptop dan HP tanpa horizontal scrolling.
-   Tujuan terkait riset: menggunakan citra kanopi untuk mempercepat
    seleksi cabai dan memprediksi produksi.

### `/print-skripsi` dan `/mendeley`

Modul bagian dari ekosistem. Kredit masing-masing Print Skripsi ---
Irvan dan Mendeley --- Kautsar. Pertahankan perilaku yang sudah diterima
saat memperbarui modul lain.

## 6. Riset utama: jagung hibrida dent pada dua tipologi lahan

### Judul/tema

Respons pertumbuhan dan produksi jagung hibrida tipe dent pada dua
tipologi lahan; evaluasi G×E, korelasi, dan analisis lintasan (path
analysis).

### Lokasi dan bahan

-   Lahan kering: Desa Bulu Tanah, Kecamatan Kajuara, Kabupaten Bone,
    Sulawesi Selatan; koordinat 5.06478° LS, 120.20599° BT; elevasi yang
    pernah disebut 243 m dpl.
-   Lahan sawah beririgasi/terdrainase: Desa Jipang, Kecamatan
    Bontonompo Selatan, Kabupaten Gowa; koordinat 5.42653° LS,
    119.42293° BT.
-   Genotipe: NK Sumo Sakti (OT Syngenta) dan RK 457 (PT Twinn).
-   Periode rencana: Mei--Desember 2026.
-   Rujukan teknis yang disebut: *Juknis Uji Multilokasi Jagung Hibrida
    Dent-Pati* (Roy Efendi, BRIN, 2026).

### Data/konteks produksi yang pernah dicatat

-   Produksi jagung pipilan kering kadar air 14% menurut seri BPS yang
    pernah dipakai: 12,92 juta ton (2020), 13,41 juta ton (2021), dan
    16,52 juta ton (2022).
-   Angka produktivitas yang pernah dicatat dalam draft: 59,79 ku
    ha⁻¹ (2022) dan 59,40 ku ha⁻¹ (2024, rujukan BPS 2025). Verifikasi
    angka, definisi, dan tahun pada sumber primer sebelum
    dipublikasikan.
-   Eksperimen terdahulu berbeda: Juni--September 2024 di Desa Lemo;
    RAK, perlakuan S0 kontrol/S1 Agrimore-N/S2 Agrimore-Even/S3
    Bayfolan/S4 Ambition; 3 ulangan/15 unit; faktor tahap kedua P0
    alami/P1 kuas/P2 semprot × pupuk; 45 unit; JJUH 01; petak 10,5 × 5
    m; jarak tanam 70 × 20 cm; Phonska + Urea pada 10/30 HST; metalaksil
    sekitar 1 g/lubang; kadar air panen 11%; analisis STAR 2.0.1 + Excel
    ANOVA; BNT 95%. Jangan mencampur eksperimen lama ini dengan riset
    dua lokasi tahun 2026.
-   Pemetaan panen yang pernah disebut: Bajeng/Exfarm T1=16, T2=17,
    T3=18, T4=19; Panen 3 Bajeng tanggal 15 Juli 2026. Verifikasi
    konteks jika digunakan.
-   Manuskrip yang pernah dikirim ke *Reproduction and Breeding*:
    "Selection of High-Potential Maize Lines from Transgressive
    Segregants of Convergent Breeding through Diallel Mating" --- status
    terakhir yang diketahui: under review.
-   Laporan kemajuan dimulai 22 Mei 2026, perkiraan selesai akhir
    Oktober 2026; sekitar 80% selesai pada pembaruan terakhir. S3
    crossing/selfing dan evaluasi galur S3 full-diallel hingga produksi;
    hasil S3 menghasilkan galur S4.

## 7. Riset citra tanaman, UAV, dan machine learning

-   Pengguna ingin belajar ML untuk memprediksi produksi melalui kanopi
    tanaman cabai agar waktu seleksi bisa dipersingkat.
-   Fokus: segmentasi citra RGB, fenotipe dari UAV/kanopi, prediksi
    hasil, validasi model, dan kegunaan nyata bagi percobaan agronomi.
-   Briefing berkala yang diminta: setiap Jumat, rangkum temuan bermakna
    tentang crop imaging dan UAV phenotyping, terutama RGB segmentation
    dan machine-learning crop prediction; jelaskan apa yang berubah,
    mutu bukti, dan penerapan untuk percobaan/analisis pertanian.
-   Saat membahas model, prioritaskan validasi eksternal, pembagian data
    yang mencegah data leakage (misalnya pemisahan berdasarkan
    plot/lokasi/waktu), metrik dan ketidakpastian, generalisasi lintas
    genotipe/lingkungan, serta hubungan fenotipe kanopi dengan hasil
    aktual.
-   Jangan menyamakan akurasi pada dataset internal dengan kemampuan
    prediksi lintas musim/lokasi. Rekomendasi riset harus disertai
    literatur mutakhir yang dapat diverifikasi.

## 8. Rencana belajar statistik agronomi

-   Jadwal yang pernah diminta: Rabu dan Sabtu pukul 21.00, bergantian
    Python dan R.
-   Materi harus berbasis kasus agronomi: pembersihan data, ANOVA,
    regresi, Random Forest, interpretasi, dan praktik analisis.
-   Setiap sesi idealnya berisi soal/data mandiri serta solusi ringkas.
-   Untuk kontras pada percobaan mulsa cabai, himpunan kontras yang
    disetujui hanya:
    -   M0 vs M1--M5
    -   M1 vs M2
    -   M4 vs M5
    -   M3 vs M4/M5
    -   M1,M2 vs M3,M4,M5
-   Gaya pelaporan: lampiran dan sidik ragam terlebih dahulu; ANOVA yang
    tepat; hanya kontras/uji lanjut yang relevan; arah perbedaan rerata;
    identifikasi nilai tertinggi/terendah secara objektif; audit
    statistik.

## 9. Buku panduan artificial screening padi

Judul: **"Metode Artificial Screening Menggunakan Stress Chamber untuk
Cekaman Kekeringan dan Suhu Tinggi pada Tanaman Padi"**.

-   Institusi: Universitas Hasanuddin, Makassar, 2026.
-   Penulis yang pernah dicatat: Dr Muhammad Fuad Anshori; Achmad
    Kautsar Baharuddin; Diva Aprilia Paputungan; Nur Rahmah Wahdania; I
    Ketut Adi Permana; Nur Lisa; Haris.
-   Desain chamber: gambar teknik 2D/PDF, bukan render 3D; bangunan
    berdiri di tanah; tinggi 3 m; lantai batako; panjang 2 m termasuk
    pintu × lebar 1,5 m; pintu di sisi kiri, membuka ke luar, ukuran 80
    cm × 2 m; ukuran batako 30 × 15 × 10 cm.
-   Tipografi: Poppins; istilah berbahasa Inggris dicetak miring.
-   Pertahankan spesifikasi ini bila memperbaiki blueprint atau dokumen.

## 10. Evaluasi sumber daya lahan

Pada 3 Oktober 2026, pengguna menyatakan akan melakukan analisis
kesesuaian lahan untuk mata kuliah **Evaluasi Sumber Daya Lahan**.
Konteks lokasi/komoditas dan data tanah spesifik belum ditetapkan dalam
ringkasan ini. Saat memulai, bantu susun alur yang benar: tujuan dan
skala, unit lahan, persyaratan tumbuh komoditas, karakteristik/kualitas
lahan, pencocokan (matching), faktor pembatas, kelas kesesuaian
aktual/potensial, kebutuhan perbaikan, serta sumber data dan
ketidakpastian. Jangan mengasumsikan lokasi atau komoditas sebelum
diketahui.

## 11. Kompos/pupuk organik berbasis kotoran sapi

Pada 9 Oktober 2026, pengguna sedang menyiapkan produk "sapi
tumbuh"/kompos berbasis kotoran sapi dan bertanya tentang bahan, alat,
mikroba, *Trichoderma harzianum*, dan EM4. Arahan eksplisit terbaru:
prosedur yang diminta menggunakan **EM4 dan tidak menggunakan
Trichoderma**. Ada file rujukan yang pernah diunggah:
`Rekomendasi_Usaha_Kompos_Sapi_PWMP_2026-1.pdf`. Jika melanjutkan,
gunakan file tersebut bila tersedia, bedakan bahan baku, bahan pembenah,
inokulan, alat, prosedur, parameter kematangan, sanitasi, dan mutu;
jangan memasukkan *T. harzianum* sebagai bahan prosedur yang diminta.
Pernah diminta dibuatkan PDF prosedur.

## 12. Dukungan teknis Windows

Pada 9 Oktober 2026, pengguna mencoba memperluas partisi C: menggunakan
ruang Unallocated. D: berisi data penting yang harus dipertahankan; ada
partisi kecil 757 MB yang dicurigai sebagai Recovery. Pengguna ingin
cara mudah melalui perangkat lunak dan menyebut AOMEI berbayar. Jangan
menyarankan menghapus partisi Recovery tanpa memeriksa urutan/layout
partisi dan konsekuensinya. Prioritaskan alat gratis yang benar-benar
dapat melakukan operasi yang dibutuhkan; jelaskan risiko dan langkah
verifikasi/backup sebelum mengubah partisi.

## 13. Aturan penting untuk melanjutkan pekerjaan software

1.  **Mulai dengan memeriksa keadaan nyata.** Untuk GitHub/Cloudflare,
    periksa repo, branch, workflow, commit, log build, dan URL aktual
    jika konektor/akses tersedia.
2.  **Jangan berpura-pura memiliki akses.** Jika tidak ada konektor atau
    izin, katakan secara langsung dan sediakan patch/file/langkah yang
    benar-benar dapat dilakukan.
3.  **Satu perubahan yang bisa diverifikasi lebih baik daripada klaim
    besar.** Lakukan perubahan, build/test, inspeksi hasil, lalu
    laporkan commit dan URL bila memang tersedia.
4.  **Pertahankan fitur yang disetujui.** Jangan menghapus fitur lama
    ketika memperbaiki layout atau refactor.
5.  **Mobile-first secara nyata.** Uji viewport 360 × 764 atau ukuran HP
    serupa; cek klik/tap, overlay, safe area, editor, keyboard, zoom,
    scrolling, dan konflik menu.
6.  **Jangan menganggap deploy = berhasil.** Deploy harus dibuktikan
    melalui workflow dan URL aktif; tampilan harus diuji terpisah.
7.  **Jangan terus bertanya jika instruksi sudah cukup jelas.** Pengguna
    telah berkali-kali meminta "lakukan", "lanjut", dan "sampai tampil".
    Bertindak sejauh akses memungkinkan, lalu laporkan hambatan yang
    spesifik.
8.  **Jangan mengulang siklus tanpa perubahan.** Jika bug tidak berubah,
    cari akar masalah (cache, path, branch yang salah, workflow gagal,
    selector CSS, event overlay, atau build yang tidak terbarui) dan
    tunjukkan bukti.
9.  **Hasil analisis ilmiah harus dapat diaudit.** Jangan membuat data,
    angka, p-value, referensi, atau status eksperimen yang tidak ada.
10. **Referensi ilmiah:** untuk klaim yang berubah atau literatur,
    gunakan sumber mutakhir dan tautan yang benar-benar bisa dibuka.

## 14. Ringkasan status dan pekerjaan lanjutan yang paling penting

**Pekerjaan software yang belum boleh dianggap selesai:** - Memastikan
UI `/stat` terbaru benar-benar tampil sesuai desain yang diminta;
terutama tampilan hasil analisis berbentuk kotak-kotak, editor mobile,
tombol `+row/+col`, menu tiga titik dataset, pinch zoom, pengaturan
font/tema, freeze panes, dan popup yang tidak bertumpuk. - Memastikan
`/game/` tampil penuh di HP, tombol melayang berfungsi, fitur HP/PC
setara, tema terang konsisten, dan error `COSTS is not defined` tidak
ada. - Memeriksa `/denah` dan integrasinya. - Memeriksa kondisi branch
refactor dan apakah perubahan IndexedDB/provenance sudah diverifikasi. -
Memastikan GitHub Actions bekerja dan Cloudflare Pages produksi telah
benar-benar terhubung/deploy; sebelumnya akses/token menjadi
penghalang. - Memastikan fitur keamanan yang pernah dilaporkan masih ada
dan pengujian A/B sudah dijalankan. - Jangan mengklaim salah satu di
atas selesai sebelum bukti tersedia.

**Pekerjaan akademik/riset aktif:** - Menyelesaikan laporan kemajuan dan
riset jagung dent dua tipologi lahan. - Memantau manuskrip *Reproduction
and Breeding* yang pernah berstatus under review. - Mengembangkan
pembelajaran/riset fenotipe kanopi cabai dan ML untuk prediksi hasil. -
Melanjutkan analisis kesesuaian lahan untuk mata kuliah. - Melanjutkan
prosedur produk kompos kotoran sapi berbasis EM4 bila diminta.

------------------------------------------------------------------------

## 15. Prompt siap tempel ke akun ChatGPT baru

Saya memindahkan pekerjaan dari akun ChatGPT lama. Gunakan dokumen
migrasi ini sebagai konteks utama dan jangan meminta saya mengulang hal
yang sudah tercantum. Balas dengan ringkasan singkat tentang proyek dan
status yang Anda pahami, lalu tanyakan hanya satu hal jika benar-benar
diperlukan.

Prioritas saya adalah melanjutkan Agrotik dengan benar. Periksa status
repositori/branch/commit/deployment yang nyata jika Anda memiliki akses.
Jangan mengklaim telah memperbaiki atau men-deploy apa pun tanpa
verifikasi. GitHub Pages adalah staging/testing; Cloudflare Pages adalah
target produksi untuk landing page dan `/stat/`. Saya ingin perubahan
diuji sampai benar-benar terlihat, terutama di HP, dan fitur yang sudah
disetujui harus dipertahankan. Jika akses GitHub/Cloudflare tidak
tersedia, katakan terus terang dan berikan perubahan konkret yang dapat
saya terapkan.

Ikuti preferensi kerja dan rincian proyek dalam dokumen ini. Untuk riset
agronomi, gunakan Bahasa Indonesia akademik, bersikap seperti reviewer
Q1, jelaskan mekanisme dan statistik, dan sertakan literatur mutakhir
dengan tautan yang dapat diverifikasi. Jangan mengarang data, sitasi,
status pekerjaan, atau hasil pengujian.

## 16. Catatan perubahan dan serah terima

Catat satu entri untuk setiap rangkaian perubahan yang terkait. Perbarui juga bagian topik terkait apabila keputusan atau statusnya berubah.

### 2026-10-10 — Penyimpanan konteks lintas akun

- **Tujuan pengguna:** menyimpan dokumen migrasi di repo agar akun baru membaca konteks terlebih dahulu.
- **File:** PAKET_MIGRASI_CHATGPT_IRVAN.md, AGENTS.md, README.md.
- **Perubahan:** dokumen impor disimpan utuh, ditambah petunjuk pembacaan awal dan prompt untuk akun baru.
- **Branch/bukti:** master; commit dokumen 420d2711371888f89562c701d5f66f37d2bb97fd, petunjuk 334f810a54de59912a12898fae963e2ef5f53d66, README f7c1ad79a7c00d0542b33b430e73faae3f4b0bbf.
- **Verifikasi:** ketiga file dibaca kembali melalui GitHub dan cocok dengan isi yang dikirim.
- **Status:** selesai terverifikasi untuk penyimpanan dokumen. Tidak ada pengujian aplikasi atau deployment dalam tugas ini.

### 2026-10-10 — Konteks wajib dipelihara bersama perubahan file

- **Tujuan pengguna:** setiap perubahan file harus membawa catatan tentang keinginan pengguna dan hasil pekerjaan; asisten dari akun berikutnya wajib melanjutkan kebiasaan ini.
- **Keputusan:** pembaruan konteks menjadi bagian setiap tugas yang mengubah file, tanpa permintaan terpisah; pemeriksaan baca-saja tidak memerlukan commit jika tidak ada koreksi atau keputusan baru.
- **File:** AGENTS.md (prosedur wajib), README.md (petunjuk dan prompt), PAKET_MIGRASI_CHATGPT_IRVAN.md (keputusan aktif dan catatan serah terima).
- **Batasan:** pertahankan konteks historis; jangan menganggap status lama sebagai bukti keadaan aplikasi; jangan mencatat rahasia; hindari catatan rekursif.
- **Branch:** master. Hash pembaruan dokumentasi tersedia pada riwayat Git file.
- **Status/verifikasi:** selesai terverifikasi untuk dokumentasi. Ketiga file berhasil ditulis dan dibaca kembali melalui GitHub; isinya cocok dengan perubahan yang dikirim. Commit aturan: ab34259a2c6f077371e557197c77e2fcce78e710; README: 366557e84fa66ca5113af6682369ade1c305c4e3; konteks: f0c7efc61003ab42c7b9b1f17dd22c4f58974fa1. Catatan status ini ditambahkan setelah pemeriksaan tersebut.
- **Belum dilakukan:** audit aplikasi, build, pemeriksaan UI, dan deployment; tugas ini hanya dokumentasi. Tidak ada sistem yang otomatis membaca percakapan akun lain.
- **Langkah berikutnya:** asisten berikutnya membaca konteks, memverifikasi keadaan repo sesuai tugas, lalu menambahkan catatan dengan prosedur AGENTS.md.

### Format entri berikutnya

- **Tanggal/zona waktu:**
- **Tujuan pengguna dan alasan:**
- **Keputusan/batasan:** bedakan arahan pengguna dan pilihan implementasi asisten.
- **File dan perubahan:**
- **Branch/commit/PR yang sudah tersedia:**
- **Verifikasi dan hasil nyata:**
- **Status serta hal yang belum diuji/hambatan:**
- **Langkah berikutnya:**

### 2026-10-10 — Menu Pengamatan sampel (implementasi awal)

- **Tujuan pengguna:** mengikuti urutan kerja penimbangan dan pengukuran lapang yang dapat disusun sebelum mulai, kemudian berulang per unit percobaan.
- **Keputusan:** sampel anak unit (tanaman/buah), jumlah fleksibel, panen dikodekan di parameter; data mentah serta rekap per unit disediakan.
- **File:** src/observation-engine.js, src/observation-store.js, src/observation-workflow.js, src/observation.css, src/main.js, scripts/check-observations.mjs, package.json, dan dokumen konteks.
- **Implementasi:** susun kelompok atau urutan rinci, input berurutan, nilai tidak tersedia terpisah dari nol, autosave lokal, undo/redo nilai, cadangan/pulihan JSON, ekspor data sampel dan rekap, dataset rekap baru, penolakan konflik tulis lintas tab.
- **Branch:** development terlebih dahulu. Branch development divergen dari master; hanya perubahan fitur ini yang akan dipromosikan, bukan seluruh perubahan lama development.
- **Verifikasi saat catatan ini disusun:** uji mesin pengamatan dan npm run verify lokal pada development lulus (syntax, kontrak UI, statistik, build, dist). Uji browser Chromium lokal juga lulus: urutan campuran, sampel berbeda, desimal/nol/hilang, reload, undo/redo, rekap ke dataset baru, viewport 360 × 764 tanpa overflow horizontal, validasi angka, backup/pulihan JSON, dan konflik tulis; tidak ada pageerror. CI Validate Statistical Web pada development lulus untuk commit cc7115b98a4c6af8f7d77d3b66065980d5d6f8b7 (run 38027166516). Integrasi fitur pada basis master juga lulus uji browser yang sama. Belum diklaim ter-deploy.
- **Batasan:** sesi pengamatan disimpan lokal dan belum tersinkron dengan cloud; pindah perangkat melalui JSON. Jumlah adalah total sampel terukur, bukan otomatis estimasi total unit. Kolom n/hilang/belum diisi tidak diperlakukan sebagai parameter hasil untuk analisis.
- **Langkah berikutnya:** lihat catatan validasi integrasi di bawah; promosi tertahan gate ukuran berkas lama.

### 2026-10-10 — Validasi integrasi dengan master

- **Tujuan:** mempromosikan fitur Pengamatan yang sudah diuji pada development tanpa menggabungkan perubahan lama branch tersebut.
- **Temuan:** master memiliki kontrak tes lama untuk halaman portofolio “Mahasiswa Agronomi”, tautan modul staging di landing, akun/PWA pada landing statis, serta posisi menu dan versi aset yang sudah berubah sebelum fitur ini dibuat.
- **Perbaikan pendukung:** selaraskan scripts/check-ui-contract.mjs, check-account-auth.mjs, check-pwa.mjs, check-game.mjs, dan check-dist.mjs dengan landing Agrotik yang hanya menawarkan Stat, sambil tetap memeriksa fungsi/keamanan akun, PWA, game, dan modul staging secara terpisah. Tidak mengubah aplikasi modul-modul tersebut.
- **Verifikasi:** development CI lulus; pengujian browser integrasi pada master lulus tanpa pageerror. Build produksi dan test:dist integrasi lulus. Pemeriksaan lengkap integrasi tertahan batas ukuran berkas Field Zero yang sudah terlampaui pada master sebelum perubahan fitur: app.js 260.354 byte (batas 260.000), style.css 100.224 byte (batas 100.000), comfort.css 31.187 byte (batas 30.000). Percobaan pemadatan whitespace telah dibatalkan; tidak ada perubahan kode game dalam PR.
- **Branch promosi:** feat/observation-samples-20261010. Deployment hanya melalui workflow yang sudah ada setelah CI berhasil.

- **Status serah terima:** fitur Pengamatan selesai diimplementasikan dan teruji lokal; CI development lulus. Promosi master belum diizinkan oleh gate CI yang ada. Siapkan PR draf untuk fitur; jangan merge atau mengklaim fitur aktif di URL publik sebelum batas ukuran Field Zero dibereskan dan semua gate lulus.
- **Langkah berikutnya:** selesaikan masalah ukuran berkas Field Zero secara terpisah tanpa menaikkan batas atau menonaktifkan tes; jalankan CI integrasi lagi, lalu merge/deploy dan verifikasi /stat/ jika lolos. Data pengamatan lokal tidak ikut sinkronisasi cloud.
