# Spotify Search

Aplikasi web statis bertema Y2K Mixtape untuk mencari lagu, melihat detail, memutar preview Spotify, dan meminta URL unduhan melalui NexRay. Repo ini tidak membutuhkan backend atau proses build.

**Live demo:** [search-sporify.vercel.app](https://search-sporify.vercel.app/)

## Fitur

- Cari lagu berdasarkan judul atau nama artis.
- Lihat cover, artis, album, durasi, dan tahun rilis.
- Putar preview melalui Spotify Embed.
- Siapkan URL unduhan saat detail lagu dibuka, lalu gunakan kembali selama lima menit.
- Tampilkan status loading, hasil kosong, dan pesan error.
- Cari dengan tombol Enter dan gunakan layout responsif di berbagai ukuran layar.

## Struktur File

```text
.
├── index.html   # Halaman dan dependensi CDN
├── search.js    # Pencarian, detail, preview, dan unduhan
├── style.css    # Tema Y2K Mixtape dan layout responsif
└── image.png    # Favicon
```

## Menjalankan Lokal

Tidak perlu instalasi dependensi atau build. Jalankan server statis dari folder proyek:

```bash
python -m http.server 8000
```

Kemudian buka <http://localhost:8000> di browser. Alternatifnya, gunakan server statis seperti `npx serve .`.

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
- URL unduhan diminta saat detail lagu dibuka dan disimpan sementara di memori browser selama lima menit.
- Browser dapat membatasi autoplay; pengguna mungkin perlu menekan tombol Play pada player Spotify.
- Unduh hanya konten yang berhak kamu akses. Musik dan merek Spotify adalah milik pemegang hak masing-masing.

© 2026 [Rafli](https://github.com/rafli6373). All rights reserved.
