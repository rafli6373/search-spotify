# Spotify Search

Aplikasi web bertema Y2K Mixtape untuk mencari lagu, melihat detail, memutar preview Spotify, dan meminta URL unduhan melalui NexRay. Pencarian dapat berjalan dari halaman statis, tetapi fitur unduhan membutuhkan Vercel Function di `api/download.js`.

**Live demo:** [paymira.my.id](https://www.paymira.my.id)

## Fitur

- Cari lagu berdasarkan judul atau nama artis.
- Lihat cover, artis, album, durasi, dan tahun rilis.
- Putar preview melalui Spotify Embed.
- Minta URL unduhan hanya setelah tombol Unduh Audio dipilih, dengan verifikasi Cloudflare Turnstile dan rate limit satu detik.
- Tampilkan status loading, hasil kosong, dan pesan error.
- Cari dengan tombol Enter dan gunakan layout responsif di berbagai ukuran layar.

## Struktur File

```text
.
├── index.html   # Halaman dan dependensi CDN
├── api/download.js # Verifikasi Turnstile dan proxy download
├── search.js    # Pencarian, detail, preview, dan unduhan
├── style.css    # Tema Y2K Mixtape dan layout responsif
└── image.png    # Favicon
```

## Konfigurasi Turnstile

Deployment unduhan harus menggunakan Vercel agar function di `api/download.js` aktif. Tambahkan environment variable berikut di Vercel:

```text
TURNSTILE_SECRET_KEY=<Secret Key dari Cloudflare Turnstile>
```

Site Key memang digunakan di frontend dan boleh terlihat oleh pengguna. Secret Key hanya boleh disimpan sebagai environment variable. Setelah menambahkan atau mengganti variable, lakukan redeploy.

Untuk domain kustom, tambahkan hostname situs ke `TURNSTILE_ALLOWED_HOSTNAMES`. Pisahkan beberapa hostname dengan koma, tanpa skema `https://`. Hostname deployment produksi dan preview Vercel juga dikenali dari environment variable bawaan Vercel.

## Teknologi

- HTML, CSS, dan vanilla JavaScript
- Tailwind CSS 2.2 melalui CDN
- SweetAlert2 untuk dialog dan notifikasi
- Space Grotesk melalui Google Fonts
- Vercel untuk hosting statis

## Endpoint API

Pencarian lagu:

```text
GET https://api.nexray.eu.cc/search/spotify?q=<query>
```

Pengambilan URL unduhan:

```text
GET https://api.nexray.eu.cc/downloader/spotify?url=<encoded-spotify-track-url>
```

Frontend membaca daftar lagu dari `result` pada respons pencarian dan URL audio dari `result.url` pada respons downloader. Timeout pencarian adalah 20 detik, sedangkan timeout downloader 60 detik.

## Alur Penggunaan

1. Masukkan judul lagu atau nama artis.
2. Tekan Enter atau tombol pencarian.
3. Pilih Detail untuk melihat metadata dan membuka preview Spotify.
4. Tekan Unduh Audio untuk memulai unduhan.

## Catatan

- Browser harus dapat mengakses NexRay, Spotify Embed, dan CDN yang digunakan. Gangguan atau keterlambatan layanan eksternal dapat memengaruhi fitur terkait.
- API dipanggil langsung dari browser, sehingga endpoint dapat dilihat pengguna. Jangan menaruh API key atau rahasia di file frontend.
- URL unduhan hanya diminta setelah pengguna memilih Unduh Audio; URL disimpan sementara di memori browser selama lima menit.
- Browser dapat membatasi autoplay; pengguna mungkin perlu menekan tombol Play pada player Spotify.
- Unduh hanya konten yang berhak kamu akses. Musik dan merek Spotify adalah milik pemegang hak masing-masing.

© 2026 [Rafli](https://github.com/rafli6373). All rights reserved.
