const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const fetch    = require('node-fetch');

// ── Patch ffmpeg path dari ffmpeg-static ──────────────────────────────────────
const ffmpegStatic = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegStatic;

const SpottyDL = require('spottydl');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Direktori temp untuk file download ───────────────────────────────────────
const DOWNLOAD_DIR = path.join(os.tmpdir(), 'spotify-dl');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve frontend statis ─────────────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/search?q=<query>
// Cari lagu via iTunes Search API (gratis, tanpa key, CORS OK)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query)          return res.status(400).json({ error: 'Parameter q wajib diisi.' });
  if (query.length > 100) return res.status(400).json({ error: 'Query maksimal 100 karakter.' });

  try {
    const url  = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20&media=music`;
    const resp = await fetchWithTimeout(url, 10_000);
    if (!resp.ok) throw new Error(`iTunes API error: ${resp.status}`);

    const data   = await resp.json();
    const tracks = (data.results || [])
      .filter(r => r.wrapperType === 'track')
      .map(t => ({
        id:         t.trackId,
        title:      t.trackName,
        artist:     t.artistName,
        album:      t.collectionName,
        genre:      t.primaryGenreName,
        duration:   msToTime(t.trackTimeMillis),
        year:       t.releaseDate ? new Date(t.releaseDate).getFullYear() : null,
        thumbnail:  (t.artworkUrl100 || t.artworkUrl60 || '').replace('100x100bb', '300x300bb'),
        previewUrl: t.previewUrl || null,   // preview 30 detik dari Apple
        trackViewUrl: t.trackViewUrl || null,
      }));

    res.json({ success: true, count: tracks.length, results: tracks });
  } catch (err) {
    console.error('[/api/search]', err.message);
    res.status(500).json({ error: 'Gagal mengambil data pencarian.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/download?url=<spotify_track_url>
// Download full MP3 via spottydl (Spotify metadata → YouTube Music → MP3)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
  const spotifyUrl = String(req.query.url || '').trim();

  // Validasi URL Spotify
  if (!isValidSpotifyTrackUrl(spotifyUrl)) {
    return res.status(400).json({ error: 'URL Spotify tidak valid. Gunakan format: https://open.spotify.com/track/...' });
  }

  console.log(`[Download] Request: ${spotifyUrl}`);

  try {
    // 1. Ambil metadata track dari Spotify via spottydl
    console.log('[Download] Mengambil metadata...');
    const trackInfo = await SpottyDL.getTrack(spotifyUrl);

    if (!trackInfo || !trackInfo.title) {
      return res.status(404).json({ error: 'Track tidak ditemukan di Spotify.' });
    }

    console.log(`[Download] Track: ${trackInfo.title} - ${trackInfo.artist}`);

    // 2. Download ke temp dir
    console.log('[Download] Mengunduh audio...');
    const results = await SpottyDL.downloadTrack(trackInfo, DOWNLOAD_DIR);

    if (!results || results.length === 0 || results[0].status !== 'Success') {
      throw new Error('SpottyDL gagal mengunduh track.');
    }

    const filePath = results[0].filename;

    if (!fs.existsSync(filePath)) {
      throw new Error(`File tidak ditemukan: ${filePath}`);
    }

    // 3. Kirim file ke client
    const safeName = sanitizeFilename(`${trackInfo.artist} - ${trackInfo.title}.mp3`);
    console.log(`[Download] Mengirim file: ${safeName}`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    // Hapus file temp setelah selesai dikirim
    stream.on('end', () => {
      fs.unlink(filePath, () => {});
      console.log(`[Download] Selesai: ${safeName}`);
    });

    stream.on('error', (err) => {
      console.error('[Download] Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Gagal mengirim file.' });
      }
    });

  } catch (err) {
    console.error('[/api/download]', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Gagal mendownload track.',
        detail: err.message,
        tip: 'Pastikan URL Spotify valid dan spottydl bisa mengakses YouTube Music.'
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/info?url=<spotify_track_url>
// Ambil metadata track dari Spotify tanpa download
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  const spotifyUrl = String(req.query.url || '').trim();

  if (!isValidSpotifyTrackUrl(spotifyUrl)) {
    return res.status(400).json({ error: 'URL Spotify tidak valid.' });
  }

  try {
    const trackInfo = await SpottyDL.getTrack(spotifyUrl);
    res.json({ success: true, track: trackInfo });
  } catch (err) {
    console.error('[/api/info]', err.message);
    res.status(500).json({ error: 'Gagal mengambil info track.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health  — cek status server
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ffmpeg: ffmpegStatic ? 'bundled ✅' : 'not found ❌',
    downloadDir: DOWNLOAD_DIR,
    time: new Date().toISOString(),
  });
});

// ── Fallback: semua route lain → index.html ───────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🎵  Spotify Search Backend');
  console.log(`🚀  Server: http://localhost:${PORT}`);
  console.log(`📁  Temp dir: ${DOWNLOAD_DIR}`);
  console.log(`🔧  FFmpeg: ${ffmpegStatic || 'NOT FOUND'}`);
  console.log('');
  console.log('Endpoint tersedia:');
  console.log(`  GET /api/search?q=<judul lagu>`);
  console.log(`  GET /api/download?url=<spotify track url>`);
  console.log(`  GET /api/info?url=<spotify track url>`);
  console.log(`  GET /api/health`);
  console.log('');
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function isValidSpotifyTrackUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'open.spotify.com' &&
      /^\/track\/[a-zA-Z0-9]+$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function fetchWithTimeout(url, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
}
