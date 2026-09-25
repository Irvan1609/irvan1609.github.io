# Login Google + Cloudflare Worker + D1

Tahap ini menambahkan akun, login/logout, profil, tabel `users`, serta sesi. Dataset Statistical Web dan data Hitung Cabai **belum** dipindahkan ke akun; penyimpanan lokal tetap seperti sebelumnya.

## Arsitektur

1. Frontend GitHub Pages memanggil Worker `hitung-cabai-api`.
2. Worker membuat state OAuth di D1 lalu mengarahkan pengguna ke Google.
3. Google mengembalikan authorization code ke Worker.
4. Worker menukar code dengan token Google, membaca profil OpenID, lalu membuat/memperbarui baris `users`.
5. Worker membuat exchange code satu kali.
6. Frontend menukar exchange code dengan session token acak.
7. Session token disimpan di browser dan hanya hash SHA-256 yang disimpan di D1.
8. Logout mencabut session di D1.

## Endpoint

- `GET /v1/auth/google/start`
- `GET /v1/auth/google/callback`
- `POST /v1/auth/exchange`
- `GET /v1/auth/session`
- `GET /v1/auth/profile`
- `POST /v1/auth/logout`
- `GET /v1/health` mengembalikan `authConfigured`.

## Tabel D1

Worker membuat tabel auth otomatis saat endpoint `/v1/auth/*` pertama dipanggil. File `cloudflare/hitung-cabai-worker/auth-schema.sql` juga disediakan jika ingin menjalankan migrasi manual.

Tabel:
- `users`
- `oauth_states`
- `auth_exchange_codes`
- `sessions`

## Konfigurasi Google Cloud

Buat OAuth Client bertipe **Web application**.

Authorized redirect URI:

`https://hitung-cabai-api.andyirvan1609.workers.dev/v1/auth/google/callback`

Gunakan scope:
- `openid`
- `email`
- `profile`

Jika OAuth consent screen masih berstatus Testing, tambahkan akun Google yang akan dipakai sebagai test user.

## Secret Worker

Tambahkan ke Worker:

`GOOGLE_CLIENT_ID`

`GOOGLE_CLIENT_SECRET`

Dengan Wrangler:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Atau gunakan Cloudflare Dashboard → Workers & Pages → hitung-cabai-api → Settings → Variables and Secrets.

Tidak ada client secret Google yang boleh disimpan di repository.

## Deploy Worker

Kode Worker terbaru berada di:

`cloudflare/hitung-cabai-worker/src/index.js`

Jika Worker dikelola manual di Dashboard, salin kode terbaru lalu deploy. Jika dikelola dengan Wrangler, gunakan konfigurasi D1 yang sudah aktif kemudian:

```bash
npx wrangler deploy
```

Setelah deploy, buka:

`https://hitung-cabai-api.andyirvan1609.workers.dev/v1/health`

Target:

```json
{"ok":true,"service":"hitung-cabai-api","authConfigured":true}
```

Jika `authConfigured` masih `false`, periksa dua secret Google.

## Frontend

Komponen akun tersedia di:
- `/account.js`
- `/account.css`
- `/account-config.js`

Komponen dimuat di:
- Portofolio
- Statistical Web
- Hitung Cabai
- Kamera Pengukur
- Print Skripsi
- Mendeley

Saat belum login, tombol **Masuk dengan Google** ditampilkan. Setelah login, tombol berubah menjadi avatar/nama dan menu profil + keluar. Pada HP, kontrol otomatis menjadi avatar ringkas.

## Batas tahap 1

Belum ada sinkronisasi dataset, referensi, hasil analisis, atau foto ke akun. Itu tahap berikutnya setelah login/logout stabil di PC dan HP.
