# Korelasi dan sidik lintas

Menu Analyze menyediakan Korelasi (Pearson/Spearman) dan Sidik lintas satu respons Y dengan satu atau beberapa X. Satu baris harus mewakili satu unit pengamatan independen. Kolom terpilih harus lengkap dan numerik. Tidak ada agregasi ulangan/kelompok atau pembuangan nilai hilang otomatis.

Matriks segitiga atas memakai dua desimal dan superscript ns/*/** berdasarkan p dua sisi individual sebelum pembulatan. Diagonal adalah identitas, tanpa uji signifikansi. Nilai r kritis 5%/1% dihitung dari distribusi t dengan db N−2. Spearman menggunakan midranks dan p pendekatan t; r kritisnya juga pendekatan, bukan tabel eksak/permutasi. Tabel pasangan tambahan menyajikan koreksi Holm secara terpisah. Korelasi tidak membuktikan kausalitas.

Sidik lintas menggunakan regresi terstandar, QR dengan ortogonalisasi ulang. Menghasilkan beta, SE/t/p, VIF, R²/adjusted R² dan sqrt(1−R²). Dekomposisi r(Xi,Y) = beta_i + sum_j r(Xi,Xj) beta_j bukan estimasi mediasi kausal. Ini bukan SEM multirespons atau korelasi genotipik. Prediktor singular/hampir singular ditolak; VIF > 5 ditandai. Inferensi mengasumsikan residual independen, normal dan homogen; p koefisien belum dikoreksi multipel.

Hasil memiliki salin dan ekspor Excel dengan nama dataset. Hasil korelasi/lintas belum masuk riwayat ANOVA; simpan menggunakan ekspor. Pengiriman data mentah mengikuti pengaturan Cadangan Drive yang sudah ada.

Verifikasi: `scripts/generate-association-reference.py` membuat fixture independen NumPy/SciPy. `scripts/check-association.mjs` dijalankan melalui `npm run verify`, termasuk N=27 (r kritis 0.3809 dan 0.4869), nilai seri Spearman, kolom konstan/kolinear, serta koefisien/SE/p/VIF.

Rujukan: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html dan https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.OLS.html
