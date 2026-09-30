// ─── Konfigurasi API NexRay ───────────────────────────────────────────────────
const SEARCH_API    = 'https://api.nexray.eu.cc/search/spotify';
const DOWNLOAD_API  = 'https://api.nexray.eu.cc/downloader/spotify';
const TIMEOUT_MS    = 20000;
const DOWNLOAD_URL_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Elemen DOM ──────────────────────────────────────────────────────────────
const fetchButton = document.getElementById('fetchButton');
const playlistDiv = document.getElementById('playlist');
const urlInput    = document.getElementById('urlInput');
const loadingDiv  = document.getElementById('loading');

let requestInProgress = false;
const downloadUrlCache = new Map();

// ─── Event Listeners ─────────────────────────────────────────────────────────
fetchButton.addEventListener('click', searchMusic);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchMusic(); });

// ─── Fungsi Utama: Search via NexRay ─────────────────────────────────────────
async function searchMusic() {
  const query = urlInput.value.trim();
  if (!query) return Swal.fire({ icon: 'warning', title: 'Kolom kosong!', text: 'Masukkan judul lagu atau nama artis.' });
  if (query.length > 100) return showToast('error', 'Teks pencarian maksimal 100 karakter.');
  if (requestInProgress) return;

  requestInProgress = true;
  setLoading(true);
  playlistDiv.classList.add('hidden');
  playlistDiv.replaceChildren();

  try {
    const tracks = await searchViaNexray(query);

    if (!tracks || tracks.length === 0) {
      showToast('error', 'Lagu tidak ditemukan. Coba kata kunci lain.');
    } else {
      renderPlaylist(tracks);
    }
  } catch (err) {
    console.error('[Search Error]', err);
    showToast('error', err.name === 'AbortError'
      ? 'Request timeout. Periksa koneksi internet.'
      : 'Gagal mengambil data dari NexRay. Coba lagi beberapa saat.'
    );
  } finally {
    requestInProgress = false;
    setLoading(false);
  }
}

async function searchViaNexray(query) {
  const resp = await fetchWithTimeout(`${SEARCH_API}?q=${encodeURIComponent(query)}`);
  if (!resp.ok) throw new Error(`NexRay HTTP ${resp.status}`);

  const data = await resp.json();
  if (!data || data.status === false) {
    throw new Error(data?.message || 'Pencarian gagal.');
  }

  const results = Array.isArray(data.result) ? data.result : [];

  return results.map((track, index) => {
    const rawTitle = track.title || 'Untitled';
    const artist = track.artist || 'Unknown Artist';
    const normalizedTitle = stripArtistPrefix(rawTitle, artist);

    return {
      id: track.url || `${rawTitle}-${index}`,
      title: normalizedTitle,
      artist,
      album: track.album || '-',
      genre: '-',
      duration: track.duration || '0:00',
      year: track.release_date ? new Date(track.release_date).getFullYear() : null,
      thumbnail: track.thumbnail || '',
      previewUrl: null,
      spotifyUrl: track.url || null,
      trackViewUrl: track.url || null,
      rawTitle,
    };
  });
}

// ─── Render Daftar Lagu ───────────────────────────────────────────────────────
function renderPlaylist(tracks) {
  tracks.forEach((track) => {
    const row = document.createElement('div');
    row.className = 'flex items-center py-2 border-b border-gray-700';
    row.setAttribute('role', 'listitem');

    const img = document.createElement('img');
    img.src = track.thumbnail || '';
    img.alt = `${track.title} cover`;
    img.className = 'w-12 h-12 rounded-md mr-4 flex-shrink-0 object-cover';
    img.loading = 'lazy';
    img.onerror = () => { img.style.display = 'none'; };

    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';

    const title = document.createElement('p');
    title.className = 'font-semibold truncate';
    title.textContent = track.title || 'Untitled';

    const artist = document.createElement('p');
    artist.className = 'text-sm truncate';
    artist.style.color = 'rgba(255,255,255,0.6)';
    artist.textContent = track.artist || 'Unknown Artist';

    info.append(title, artist);

    const btn = document.createElement('button');
    btn.className = 'ml-3 flex-shrink-0 font-semibold text-black px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 active:opacity-60 text-sm';
    btn.style.backgroundColor = '#1ED760';
    btn.textContent = 'Detail';
    btn.setAttribute('aria-label', `Detail lagu ${track.title}`);
    btn.addEventListener('click', () => showDetail(track));

    row.append(img, info, btn);
    playlistDiv.appendChild(row);
  });
  playlistDiv.classList.remove('hidden');
}

// ─── Modal Detail + Download ──────────────────────────────────────────────────
function showDetail(track) {
  const {
    title = 'Untitled',
    artist = 'Unknown Artist',
    album = '-',
    duration = '-',
    year = '-',
    spotifyUrl = null,
  } = track;

  if (spotifyUrl) getDownloadUrl(spotifyUrl).catch(() => {});

  const spotifyTrackId = extractSpotifyTrackId(spotifyUrl);
  const previewHtml = spotifyTrackId
    ? `
      <div class="spotify-preview">
        <iframe
          class="spotify-embed"
          src="https://open.spotify.com/embed/track/${spotifyTrackId}"
          width="100%"
          height="80"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Spotify preview for ${escapeHtml(title)}">
        </iframe>
      </div>
      `
    : `<p class="spotify-preview" style="font-size:0.82rem;color:rgba(255,255,255,0.45);text-align:center;">Preview tidak tersedia.</p>`;

  const spotifyLink = spotifyUrl
    ? `<p style="margin:10px 0 12px; text-align:center;">
         <a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(30,215,96,0.12);color:#1ED760;text-decoration:none;font-weight:600;">
           Buka di Spotify
         </a>
       </p>`
    : '';

  Swal.fire({
    title: escapeHtml(title),
    html: `
      ${previewHtml}
      ${spotifyLink}
      <table style="width:100%;text-align:left;font-size:0.85rem;border-collapse:collapse;margin-top:8px;">
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;white-space:nowrap;">Artis</td><td>${escapeHtml(artist)}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Album</td><td>${escapeHtml(album)}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Durasi</td><td>${escapeHtml(String(duration))}</td></tr>
        <tr><td style="color:rgba(255,255,255,0.5);padding:3px 10px 3px 0;">Tahun</td><td>${escapeHtml(String(year))}</td></tr>
      </table>
    `,
    showCancelButton: true,
    confirmButtonColor: '#1ED760',
    cancelButtonColor: 'rgba(255,255,255,0.16)',
    confirmButtonText: '⬇ Unduh Audio',
    cancelButtonText: 'Tutup',
    customClass: {
      popup: 'spotify-modal',
      title: 'spotify-modal-title',
      htmlContainer: 'spotify-modal-content',
      confirmButton: 'spotify-modal-confirm',
      cancelButton: 'spotify-modal-cancel',
    },
  }).then((result) => {
    if (!result.isConfirmed) return;
    downloadSong(track);
  });
}


// ─── Download via NexRay Downloader API ───────────────────────────────────────
async function downloadSong(track) {
  const spotifyUrl = track.spotifyUrl || track.trackViewUrl || null;
  if (!spotifyUrl) {
    showToast('error', 'URL Spotify tidak tersedia untuk diunduh.');
    return;
  }

  showToast('info', '⏳ Memproses unduhan audio...');
  setLoading(true);

  try {
    const audioUrl = await getDownloadUrl(spotifyUrl);
    const filename = `${sanitizeFilename(track.artist || 'Unknown')} - ${sanitizeFilename(track.title || 'Track')}.mp3`;
    triggerDownload(audioUrl, filename);
    showToast('success', `✅ Unduhan selesai: ${filename}`);
  } catch (err) {
    console.error('[Download Error]', err);
    showToast('error', 'Gagal mengambil URL download. Coba lagi beberapa saat.');
  } finally {
    setLoading(false);
  }
}

function getDownloadUrl(spotifyUrl) {
  if (!spotifyUrl) return Promise.reject(new Error('URL Spotify tidak tersedia.'));

  const cached = downloadUrlCache.get(spotifyUrl);
  if (cached && Date.now() - cached.createdAt < DOWNLOAD_URL_CACHE_TTL_MS) {
    return cached.promise;
  }

  const params = new URLSearchParams({ url: spotifyUrl });
  const promise = fetchWithTimeout(`${DOWNLOAD_API}?${params.toString()}`, {}, 60000)
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`);

      const data = await resp.json();
      const audioUrl = data?.result?.url || data?.url || null;
      if (!audioUrl) throw new Error('URL hasil download tidak ditemukan.');
      return audioUrl;
    });

  downloadUrlCache.set(spotifyUrl, { promise, createdAt: Date.now() });
  promise.catch(() => {
    if (downloadUrlCache.get(spotifyUrl)?.promise === promise) {
      downloadUrlCache.delete(spotifyUrl);
    }
  });

  return promise;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

function setLoading(show) { loadingDiv.classList.toggle('hidden', !show); }

function showToast(icon, text) {
  Swal.fire({
    icon,
    text,
    position: 'top-end',
    showConfirmButton: false,
    timer: icon === 'info' ? 10000 : 4000,
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
  return String(str ?? 'track').replace(/[\\/?:*|<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function extractSpotifyTrackId(url) {
  if (!url) return null;
  const match = String(url).match(/track[\/:]([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

function stripArtistPrefix(title, artist) {
  const artistPattern = new RegExp(`^${escapeRegExp(artist)}\\s*[-–:]\\s*`, 'i');
  return String(title || '').replace(artistPattern, '').trim() || String(title || 'Untitled');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}