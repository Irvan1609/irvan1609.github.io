# Hitung Cabai — Machine Learning

## Smoke test yang aman

Workflow `.github/workflows/smoke-test-hitung-cabai.yml` digunakan hanya untuk memastikan rantai dataset → YOLO → validasi → ONNX bekerja. Workflow ini **tidak pernah** mengubah `public/hitung-cabai/model-manifest.json`, tidak mengubah `cabai-latest.onnx`, dan tidak melakukan commit otomatis.

Sumber smoke test:
- `cloudflare`: minimal 5 kontribusi tervalidasi dari D1.
- `roboflow`: satu Dataset Version Roboflow dalam format object detection.

Smoke test dibatasi 1–3 epoch dan menyimpan `smoke-report.json`, `smoke-model.onnx`, dan `results.csv` sebagai GitHub Actions artifact selama 14 hari.

## Menghubungkan dataset Roboflow

Di GitHub Repository → Settings → Secrets and variables → Actions:

### Secret
- `ROBOFLOW_API_KEY` = API key workspace Roboflow. Jangan simpan nilai ini di repository.

### Variable
- `ROBOFLOW_DATASET_ID` = `workspace/project/version`

Contoh bentuk:
`nama-workspace/hitung-cabai/3`

Kemudian buka Actions → **Smoke Test Hitung Cabai ML** → Run workflow:
- source = `roboflow`
- epochs = `2`

## Setelah smoke test lulus

Jangan langsung mempromosikan model hanya karena training berhasil. Periksa:
1. kelas dataset sesuai objek cabai yang ingin dihitung;
2. train/validation split tidak kosong;
3. bounding box rapat dan konsisten;
4. metrik validasi masuk akal;
5. ONNX berhasil dibuat.

Setelah itu dataset Roboflow dapat digunakan sebagai bootstrap model produksi pertama, lalu kontribusi D1 menjadi sumber continual-learning berikutnya.
