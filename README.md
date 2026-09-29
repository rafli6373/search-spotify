# 🎵 Spotify Search

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)

Aplikasi web statis untuk mencari lagu Spotify, melihat detail lagu, memutar preview melalui Spotify Embed, dan mengunduh lagu melalui API NexRay.

🔗 **Live Demo:** [search-sporify.vercel.app](https://search-sporify.vercel.app/)

---

## ✨ Fitur

- 🔍 Pencarian lagu berdasarkan judul atau nama artis
- 🖼️ Menampilkan thumbnail, judul, dan artis dari hasil pencarian
- 🎵 Dialog detail dengan album artwork, durasi, dan Spotify Embed
- ▶️ Preview musik langsung melalui Spotify Embed (30 detik)
- ⬇️ Download melalui endpoint downloader Spotify NexRay
- 🎨 Tampilan transparan dengan aksen Spotify green dan scrollbar bertema
- 📱 Responsif untuk HP, tablet, laptop, PC, dan layar besar
- ⌨️ Keyboard shortcut — tekan **Enter** untuk langsung mencari
- 🔒 Validasi URL HTTPS dan URL Spotify sebelum download
- 🛡️ Perlindungan frontend dasar terhadap XSS melalui DOM API dan escaping data
- ⏱️ Batas pencarian maksimal 100 karakter dan timeout request 15 detik

---

## 🗂️ Struktur File

```text
.
├── index.html   # Struktur halaman dan dependency CDN
├── search.js    # Pencarian, detail, preview, dan download
├── style.css    # Tema visual dan responsive layout
└── image.png    # Asset favicon
```

---

## 🚀 Menjalankan Lokal

Karena aplikasi ini tidak membutuhkan proses build, file dapat dibuka langsung melalui browser. Untuk hasil yang lebih konsisten, jalankan server lokal sederhana:

**Menggunakan Python:**
```bash
python -m http.server 8000
```

**Menggunakan Node.js:**
```bash
npx serve .
```

Kemudian buka di browser:
```
http://localhost:8000
```

---

## 🛠️ Tech Stack

| Teknologi | Keterangan |
|---|---|
| HTML5 | Struktur halaman |
| CSS3 + Tailwind 2 | Styling dan responsive layout |
| Vanilla JavaScript | Logic pencarian dan download |
| SweetAlert2 | Modal dialog & notifikasi toast |
| Poppins (Google Fonts) | Tipografi |
| Vercel | Hosting & deployment |

---

## 🔌 Endpoint API

**Pencarian:**
```
GET https://api.nexray.eu.cc/search/spotify?q=<judul lagu>
```

**Download:**
```
GET https://api.nexray.eu.cc/downloader/spotify?url=<encoded-spotify-track-url>
```

Aplikasi mengharapkan respons pencarian dengan hasil pada `result`, dan respons downloader dengan URL audio pada `result.url`.

---

## 📖 Alur Penggunaan

1. Masukkan judul lagu atau nama artis pada kolom pencarian
2. Tekan **Enter** atau klik tombol 🔍 untuk mencari
3. Pilih **Detail** pada lagu yang diinginkan
4. Putar preview melalui Spotify Embed
5. Tekan **Download** jika ingin meminta URL download dari API

---

## 🔐 Catatan Keamanan

Aplikasi ini berjalan di sisi frontend, sehingga endpoint API tetap dapat dilihat oleh pengguna. Untuk deployment publik, disarankan:

- ✅ Gunakan HTTPS
- ✅ Pasang Cloudflare WAF dan rate limiting
- ✅ Gunakan backend proxy untuk menyembunyikan detail API dan membatasi request
- ✅ Tambahkan Content Security Policy dan security headers di hosting
- ❌ Jangan menyimpan API key atau token rahasia di file JavaScript
- ❌ Jangan meng-host ulang atau mendistribusikan musik berhak cipta tanpa izin

Validasi di frontend membantu mengurangi risiko, tetapi tidak menggantikan perlindungan server-side.

---

## 📝 Catatan Preview

Preview menggunakan Spotify Embed agar pemutaran tidak perlu menunggu proses downloader. Autoplay dapat tetap dibatasi oleh kebijakan browser; pengguna mungkin perlu menekan tombol Play pada player Spotify.

---

## 📄 Lisensi

© 2026 [Rafli](https://github.com/rafli6373). All rights reserved.
