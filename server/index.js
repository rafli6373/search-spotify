const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const fetch        = require('node-fetch');
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg       = require('fluent-ffmpeg');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app  = express();
const PORT = process.env.PORT || 3001;

const DOWNLOAD_DIR = path.join(os.tmpdir(), 'spotify-dl');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const FRONTEND_DIR = path.resolve(__dirname, '..');

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/search?q=<query>
// Cari lagu via iTunes Search API — 100% gratis, cepat, tanpa key / auth
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  if (!query)             return res.status(400).json({ error: 'Parameter q wajib diisi.' });
  if (query.length > 100) return res.status(400).json({ error: 'Query maksimal 100 karakter.' });

  try {
    const url  = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}&media=music`;
    const resp = await fetchWithTimeout(url, {}, 10_000);
    if (!resp.ok) throw new Error(`Search provider error: ${resp.status}`);
    const data = await resp.json();

    const tracks = (data.results || [])
      .filter(r => r.wrapperType === 'track')
      .map(t => ({
        id:           t.trackId,
        title:        t.trackName,
        artist:       t.artistName,
        album:        t.collectionName,
        genre:        t.primaryGenreName,
        duration:     msToTime(t.trackTimeMillis),
        durationMs:   t.trackTimeMillis,
        year:         t.releaseDate ? new Date(t.releaseDate).getFullYear() : null,
        thumbnail:    (t.artworkUrl100 || t.artworkUrl60 || '').replace('100x100bb', '600x600bb'),
        previewUrl:   t.previewUrl || null,
        trackViewUrl: t.trackViewUrl || null,
      }));

    res.json({ success: true, count: tracks.length, results: tracks });
  } catch (err) {
    console.error('[/api/search]', err.message);
    res.status(500).json({ error: 'Gagal mengambil data pencarian.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:      'ok',
    ffmpeg:      ffmpegStatic ? 'bundled ✅' : 'not found ❌',
    engine:      'iTunes Search Engine (100% Gratis)',
    downloadDir: DOWNLOAD_DIR,
    time:        new Date().toISOString(),
  });
});

// Fallback → index.html
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log('');
  console.log('🎵  Spotify Search Backend (100% Gratis)');
  console.log(`🚀  Server  : http://localhost:${PORT}`);
  console.log(`🔧  FFmpeg  : ${ffmpegStatic ? 'Ready' : 'Not bundled'}`);
  console.log('🎵  Search  : iTunes Search API (100% Gratis)');
  console.log('');
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function sanitizeFilename(name) {
  return String(name).replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}
