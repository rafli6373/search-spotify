const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const fetch        = require('node-fetch');

// ── ffmpeg via ffmpeg-static (tidak perlu install manual) ─────────────────────
const ffmpegStatic = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegStatic;

const SpottyDL = require('spottydl');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Spotify Credentials (dari environment variable Railway) ───────────────────
const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID     || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

// ── Cache token Spotify (berlaku 1 jam) ──────────────────────────────────────
let spotifyToken       = null;
let spotifyTokenExpiry = 0;

// ── Direktori temp download ───────────────────────────────────────────────────
const DOWNLOAD_DIR = path.join(os.tmpdir(), 'spotify-dl');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Serve frontend statis ──────────────────────────────────────────────────────
const FRONTEND_DIR = path.resolve(__dirname, '..');
app.use(express.static(FRONTEND_DIR));

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Ambil Spotify Access Token (Client Credentials — tanpa login user)
// ─────────────────────────────────────────────────────────────────────────────
async function getSpotifyToken() {
  // Gunakan cache jika token masih valid (sisa > 60 detik)
  if (spotifyToken && Date.now() < spotifyTokenExpiry - 60_000) {
    return spotifyToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('SPOTIFY_CLIENT_ID dan SPOTIFY_CLIENT_SECRET belum diset di environment variable.');
  }

  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gagal ambil Spotify token: ${resp.status} — ${err}`);
  }

  const data         = await resp.json();
  spotifyToken       = data.access_token;
  spotifyTokenExpiry = Date.now() + data.expires_in * 1000;

  console.log('[Spotify] Token berhasil diambil, berlaku', data.expires_in, 'detik');
  return spotifyToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/search?q=<query>&limit=20
// Cari lagu via Spotify Web API (resmi, gratis, hasil asli Spotify)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  if (!query)             return res.status(400).json({ error: 'Parameter q wajib diisi.' });
  if (query.length > 100) return res.status(400).json({ error: 'Query maksimal 100 karakter.' });

  try {
    const token = await getSpotifyToken();

    const url  = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=ID`;
    const resp = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    }, 10_000);

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Spotify API error ${resp.status}: ${errBody}`);
    }

    const data   = await resp.json();
    const tracks = (data.tracks?.items || []).map(t => ({
      id:         t.id,
      title:      t.name,
      artist:     t.artists.map(a => a.name).join(', '),
      album:      t.album.name,
      year:       t.album.release_date ? new Date(t.album.release_date).getFullYear() : null,
      duration:   msToTime(t.duration_ms),
      thumbnail:  t.album.images?.[0]?.url || '',          // gambar album Spotify HD
      previewUrl: t.preview_url || null,                    // preview 30 detik Spotify
      spotifyUrl: t.external_urls?.spotify || null,         // link Spotify → untuk download
      trackViewUrl: t.external_urls?.spotify || null,
    }));

    res.json({ success: true, count: tracks.length, results: tracks });
  } catch (err) {
    console.error('[/api/search]', err.message);
    res.status(500).json({ error: 'Gagal mengambil data dari Spotify.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/download?url=<spotify_track_url>
// Download full MP3 via spottydl (Spotify metadata → YouTube Music → MP3)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
  const spotifyUrl = String(req.query.url || '').trim();

  if (!isValidSpotifyTrackUrl(spotifyUrl)) {
    return res.status(400).json({
      error: 'URL Spotify tidak valid.',
      tip: 'Gunakan format: https://open.spotify.com/track/TRACK_ID'
    });
  }

  console.log(`[Download] Request: ${spotifyUrl}`);

  try {
    console.log('[Download] Mengambil metadata dari Spotify...');
    const trackInfo = await SpottyDL.getTrack(spotifyUrl);

    if (!trackInfo || !trackInfo.title) {
      return res.status(404).json({ error: 'Track tidak ditemukan.' });
    }

    console.log(`[Download] Track: ${trackInfo.title} - ${trackInfo.artist}`);
    console.log('[Download] Mengunduh audio dari YouTube Music...');

    const results = await SpottyDL.downloadTrack(trackInfo, DOWNLOAD_DIR);

    if (!results?.length || results[0].status !== 'Success') {
      throw new Error('SpottyDL gagal mengunduh. Track mungkin tidak tersedia di YouTube Music.');
    }

    const filePath = results[0].filename;
    if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);

    const safeName = sanitizeFilename(`${trackInfo.artist} - ${trackInfo.title}.mp3`);
    console.log(`[Download] Mengirim: ${safeName}`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('end',   () => { fs.unlink(filePath, () => {}); console.log('[Download] ✅ Selesai:', safeName); });
    stream.on('error', (e) => { if (!res.headersSent) res.status(500).json({ error: 'Gagal mengirim file.' }); });

  } catch (err) {
    console.error('[/api/download]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal mendownload.', detail: err.message });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/info?url=<spotify_track_url>
// Ambil metadata dari Spotify tanpa download
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  const spotifyUrl = String(req.query.url || '').trim();
  if (!isValidSpotifyTrackUrl(spotifyUrl)) return res.status(400).json({ error: 'URL Spotify tidak valid.' });

  try {
    const trackInfo = await SpottyDL.getTrack(spotifyUrl);
    res.json({ success: true, track: trackInfo });
  } catch (err) {
    res.status(500).json({ error: 'Gagal ambil info.', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:      'ok',
    ffmpeg:      ffmpegStatic ? 'bundled ✅' : 'not found ❌',
    spotify:     SPOTIFY_CLIENT_ID ? 'configured ✅' : 'not configured ❌',
    downloadDir: DOWNLOAD_DIR,
    time:        new Date().toISOString(),
  });
});

// ── Fallback ke index.html ─────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// ── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🎵  Spotify Search Backend');
  console.log(`🚀  Server  : http://localhost:${PORT}`);
  console.log(`🔧  FFmpeg  : ${ffmpegStatic || 'NOT FOUND'}`);
  console.log(`🎧  Spotify : ${SPOTIFY_CLIENT_ID ? '✅ Client ID tersedia' : '❌ Belum dikonfigurasi'}`);
  console.log(`📁  Temp    : ${DOWNLOAD_DIR}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET /api/search?q=<judul>');
  console.log('  GET /api/download?url=<spotify_url>');
  console.log('  GET /api/info?url=<spotify_url>');
  console.log('  GET /api/health');
  console.log('');

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn('⚠️  PERINGATAN: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET belum diset!');
    console.warn('   Set di Railway: Settings → Variables');
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function isValidSpotifyTrackUrl(url) {
  try {
    const p = new URL(url);
    return p.protocol === 'https:' && p.hostname === 'open.spotify.com' && /^\/track\/[a-zA-Z0-9]+$/.test(p.pathname);
  } catch { return false; }
}

function sanitizeFilename(name) {
  return String(name).replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}
