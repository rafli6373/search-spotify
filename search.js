// ─── Konfigurasi ─────────────────────────────────────────────────────────────
// Backend Railway → Spotify Web API (search asli) + spottydl (download MP3)
// Fallback → iTunes Search API (jika backend tidak aktif)
const RAILWAY_URL  = 'https://search-spotify-production.up.railway.app';

const isLocal      = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const isRailway    = location.hostname.includes('railway.app');
const BACKEND_URL  = isLocal   ? `${location.protocol}//${location.hostname}:3001`
                   : isRailway ? ''           // Railway: same-origin
                   :             RAILWAY_URL;  // Vercel: panggil Railway API

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const TIMEOUT_MS    = 20000;

// ─── Elemen DOM ──────────────────────────────────────────────────────────────
const fetchButton = document.getElementById('fetchButton');
const playlistDiv = document.getElementById('playlist');
const urlInput    = document.getElementById('urlInput');
const loadingDiv  = document.getElementById('loading');

let requestInProgress = false;
let backendAvailable  = false;   // dicek saat halaman pertama dibuka

// ─── Cek Ketersediaan Backend ────────────────────────────────────────────────
async function checkBackend() {
  if (!BACKEND_URL) return false;
  try {
    const resp = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    backendAvailable = resp.ok;
  } catch {
    backendAvailable = false;
  }
  console.log(`[Backend] ${backendAvailable ? '✅ Aktif' : '⚠️ Tidak aktif — menggunakan iTunes API'}`);
  return backendAvailable;
}
checkBackend();

// ─── Event Listeners ─────────────────────────────────────────────────────────
fetchButton.addEventListener('click', searchMusic);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchMusic();
});

// ─── Fungsi Utama: Search ─────────────────────────────────────────────────────
async function searchMusic() {
  const query = urlInput.value.trim();

  if (!query) {
    return Swal.fire({
      icon: 'warning',
      title: 'Kolom kosong!',
      text: 'Masukkan judul lagu atau nama artis terlebih dahulu.',
    });
  }
  if (query.length > 100) return showToast('error', 'Teks pencarian maksimal 100 karakter.');
  if (requestInProgress)  return;

  requestInProgress = true;
  setLoading(true);
  playlistDiv.classList.add('hidden');
  playlistDiv.replaceChildren();

  try {
    let tracks;

    // Gunakan backend jika aktif, fallback iTunes
    if (backendAvailable && BACKEND_URL) {
      tracks = await searchViaBackend(query);
    } else {
      tracks = await searchViaiTunes(query);
    }

    if (!tracks || tracks.length === 0) {
      showToast('error', 'Lagu tidak ditemukan. Coba kata kunci lain.');
    } else {
      renderPlaylist(tracks);
    }
  } catch (err) {
    console.error('[Search Error]', err);
    showToast('error', err.name === 'AbortError'
      ? 'Request timeout. Periksa koneksi internet.'
      : 'Gagal mengambil data. Coba lagi beberapa saat.'
    );
  } finally {
    requestInProgress = false;
    setLoading(false);
  }
}

// ─── Search via Backend (/api/search) ─────────────────────────────────────────
async function searchViaBackend(query) {
  const resp = await fetchWithTimeout(`${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}`);
  if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
  const data = await resp.json();
  return data.results || [];
}

// ─── Search via iTunes API (fallback, tanpa backend) ─────────────────────────
async function searchViaiTunes(query) {
  const url  = `${ITUNES_SEARCH}?term=${encodeURIComponent(query)}&entity=song&limit=20&media=music`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`iTunes error: ${resp.status}`);
  const data = await resp.json();
  return (data.results || [])
    .filter(r => r.wrapperType === 'track')
    .map(t => ({
      id:           t.trackId,
      title:        t.trackName,
      artist:       t.artistName,
      album:        t.collectionName,
      genre:        t.primaryGenreName,
      duration:     msToTime(t.trackTimeMillis),
      year:         t.releaseDate ? new Date(t.releaseDate).getFullYear() : null,
      thumbnail:    (t.artworkUrl100 || t.artworkUrl60 || '').replace('100x100bb', '300x300bb'),
      previewUrl:   t.previewUrl || null,
      trackViewUrl: t.trackViewUrl || null,
      spotifyUrl:   null,   // tidak tersedia via iTunes
    }));
}

// ─── Render Daftar Lagu ───────────────────────────────────────────────────────
function renderPlaylist(tracks) {
  tracks.forEach((track) => {
    const row = document.createElement('div');
    row.className = 'flex items-center py-2 border-b border-gray-700';
    row.setAttribute('role', 'listitem');

    // Thumbnail
    const img = document.createElement('img');
    img.src       = track.thumbnail || '';
    img.alt       = `${track.title} cover`;
    img.className = 'w-12 h-12 rounded-md mr-4 flex-shrink-0 object-cover';
    img.loading   = 'lazy';
    img.onerror   = () => { img.style.display = 'none'; };

    // Info
    const info     = document.createElement('div');
    info.className = 'flex-1 min-w-0';
    const title    = document.createElement('p');
    title.className   = 'font-semibold truncate';
    title.textContent = track.title || 'Untitled';
    const artist      = document.createElement('p');
    artist.className  = 'text-sm truncate';
    artist.style.color = 'rgba(255,255,255,0.6)';
    artist.textContent = track.artist || 'Unknown Artist';
    info.append(title, artist);

    // Tombol Detail
    const btn         = document.createElement('button');
    btn.className     = 'ml-3 flex-shrink-0 font-semibold text-black px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 active:opacity-60 text-sm';
    btn.style.backgroundColor = '#1ED760';
    btn.textContent   = 'Detail';
    btn.setAttribute('aria-label', `Detail lagu ${track.title}`);
    btn.addEventListener('click', () => showDetail(track));

    row.append(img, info, btn);
    playlistDiv.appendChild(row);
  });

  playlistDiv.classList.remove('hidden');
}

// ─── Modal Detail + Preview + Download ───────────────────────────────────────
function showDetail(track) {
  const {
    title        = 'Untitled',
    artist       = 'Unknown Artist',
    album        = '-',
    genre        = '-',
    duration     = '-',
    year         = '-',
    thumbnail    = '',
    previewUrl   = null,
    spotifyUrl   = null,
    trackViewUrl = null,
  } = track;

  const artwork = thumbnail || '';

  // Bagian preview audio
  const audioHtml = previewUrl
    ? `<div class="spotify-preview">
        <audio controls class="w-full rounded-lg" style="height:40px;outline:none;">
          <source src="${escapeHtml(previewUrl)}" type="audio/mp4">
        </audio>
        <p style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px;text-align:center;">
          🎵 Preview 30 detik
        </p>
       </div>`
    : `<p class="spotify-preview" style="font-size:0.82rem;color:rgba(255,255,255,0.45);text-align:center;">Preview tidak tersedia.</p>`;

  // Teks tombol berdasarkan kemampuan
  let confirmText;
  if (spotifyUrl && backendAvailable) {
    confirmText = '⬇ Download MP3';
  } else if (previewUrl) {
    confirmText = '⬇ Download Preview';
  } else {
    confirmText = '🎵 Buka Apple Music';
  }

  Swal.fire({
    title: escapeHtml(title),
    html: `
      ${artwork ? `<img src="${escapeHtml(artwork)}" alt="${escapeHtml(title)}" class="mb-3">` : ''}
      ${audioHtml}
      <table style="width:100%;text-align:left;font-size:0.85rem;border-collapse:collapse;margin-top:8px;">
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;white-space:nowrap;">Artis</td><td>${escapeHtml(artist)}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Album</td><td>${escapeHtml(album)}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Genre</td><td>${escapeHtml(genre)}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Durasi</td><td>${escapeHtml(String(duration))}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Tahun</td><td>${escapeHtml(String(year))}</td></tr>
      </table>
      ${!backendAvailable
        ? `<p style="font-size:0.72rem;color:rgba(255,200,0,0.7);margin-top:10px;">
            ⚠️ Backend tidak aktif. Download terbatas pada preview 30 detik.
           </p>`
        : ''}
    `,
    showCancelButton: true,
    confirmButtonColor: '#1ED760',
    cancelButtonColor: 'rgba(255,255,255,0.16)',
    confirmButtonText: confirmText,
    cancelButtonText: 'Tutup',
    customClass: {
      popup:         'spotify-modal',
      title:         'spotify-modal-title',
      htmlContainer: 'spotify-modal-content',
      confirmButton: 'spotify-modal-confirm',
      cancelButton:  'spotify-modal-cancel',
    },
  }).then((result) => {
    if (!result.isConfirmed) return;

    if (spotifyUrl && backendAvailable) {
      downloadFullMP3(spotifyUrl, title, artist);
    } else if (previewUrl) {
      triggerDownload(previewUrl, `${artist} - ${title} (preview).m4a`);
      showToast('success', 'Download preview dimulai!');
    } else if (trackViewUrl) {
      window.open(trackViewUrl, '_blank', 'noopener,noreferrer');
    }
  });
}

// ─── Download Full MP3 via Backend ───────────────────────────────────────────
async function downloadFullMP3(spotifyUrl, title, artist) {
  showToast('info', '⏳ Mengunduh MP3... Mohon tunggu beberapa detik.');
  setLoading(true);

  try {
    const resp = await fetchWithTimeout(
      `${BACKEND_URL}/api/download?url=${encodeURIComponent(spotifyUrl)}`,
      { method: 'GET' },
      60000   // download bisa butuh waktu lebih lama
    );

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    // Ambil blob dari response
    const blob     = await resp.blob();
    const filename = `${sanitizeFilename(artist)} - ${sanitizeFilename(title)}.mp3`;
    const blobUrl  = URL.createObjectURL(blob);

    triggerDownload(blobUrl, filename);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    showToast('success', `✅ Download selesai: ${filename}`);
  } catch (err) {
    console.error('[Download MP3 Error]', err);
    showToast('error', `Gagal download: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function triggerDownload(url, filename) {
  const a  = document.createElement('a');
  a.href   = url;
  a.download = filename;
  a.target = '_blank';
  a.rel    = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(tid));
}

function setLoading(show) {
  loadingDiv.classList.toggle('hidden', !show);
}

function showToast(icon, text) {
  Swal.fire({
    icon,
    text,
    position: 'top-end',
    showConfirmButton: false,
    timer: icon === 'info' ? 8000 : 3500,
    timerProgressBar: true,
    toast: true,
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFilename(str) {
  return String(str ?? 'track').replace(/[/\\?%*:|"<>]/g, '-').trim();
}

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}