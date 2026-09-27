# Spotify Search

Aplikasi web statis untuk mencari lagu Spotify, melihat detail lagu, memutar preview melalui Spotify Embed, dan mengunduh lagu melalui API NexRay.

## Fitur

- Pencarian lagu berdasarkan judul atau nama artis.
- Menampilkan thumbnail, judul, dan artis dari hasil pencarian.
- Dialog detail dengan album artwork, durasi, dan Spotify Embed.
- Preview musik langsung melalui Spotify Embed.
- Download melalui endpoint downloader Spotify NexRay.
- Tampilan transparan dengan aksen Spotify dan scrollbar bertema.
- Responsif untuk HP, tablet, laptop, PC, dan layar besar.
- Validasi URL HTTPS dan URL Spotify sebelum download.
- Perlindungan frontend dasar terhadap XSS melalui DOM API dan escaping data.
- Batas pencarian maksimal 100 karakter dan timeout request 15 detik.

## Struktur File

```text
.
├── index.html   # Struktur halaman dan dependency CDN
├── search.js    # Pencarian, detail, preview, dan download
├── style.css    # Tema visual dan responsive layout
└── image.png    # Asset favicon atau gambar lokal
```

## Menjalankan Lokal

Karena aplikasi ini tidak membutuhkan proses build, file dapat dibuka langsung melalui browser. Untuk hasil yang lebih konsisten, jalankan server lokal sederhana:

```powershell
python -m http.server 8000
```

Kemudian buka:

```text
http://localhost:8000
```

Alternatif menggunakan Node.js:

```powershell
npx serve .
```

## Endpoint API

Pencarian:

```text
GET https://api.nexray.eu.cc/search/spotify?q=usik
```

Download:

```text
GET https://api.nexray.eu.cc/downloader/spotify?url=<encoded-spotify-track-url>
```

Aplikasi mengharapkan respons pencarian dengan hasil pada `result`, dan respons downloader dengan URL audio pada `result.url`.

## Alur Penggunaan

1. Masukkan judul lagu atau nama artis.
2. Tekan tombol pencarian atau Enter.
3. Pilih `Detail` pada lagu yang diinginkan.
4. Putar preview melalui Spotify Embed.
5. Tekan `Download` jika ingin meminta URL download dari API.

## Catatan Keamanan

Aplikasi ini berjalan di sisi frontend, sehingga endpoint API tetap dapat dilihat oleh pengguna. Untuk deployment publik, disarankan:

- Gunakan HTTPS.
- Pasang Cloudflare WAF dan rate limiting.
- Gunakan backend proxy untuk menyembunyikan detail API dan membatasi request.
- Tambahkan Content Security Policy dan security headers di hosting.
- Jangan menyimpan API key atau token rahasia di file JavaScript.
- Jangan meng-host ulang atau mendistribusikan musik berhak cipta tanpa izin.

Validasi di frontend membantu mengurangi risiko, tetapi tidak menggantikan perlindungan server-side.

## Catatan Preview

Preview menggunakan Spotify Embed agar pemutaran tidak perlu menunggu proses downloader. Autoplay dapat tetap dibatasi oleh kebijakan browser; pengguna mungkin perlu menekan tombol Play pada player Spotify.

## Lisensi

Rafli
