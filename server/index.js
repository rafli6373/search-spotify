const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const fetch        = require('node-fetch');
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg       = require('fluent-ffmpeg');

const { execFile }  = require('child_process');

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app  = express();
const PORT = process.env.PORT || 3001;

const DOWNLOAD_DIR = path.join(os.tmpdir(), 'spotify-dl');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const YT_DLP_PATH = path.join(__dirname, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
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
// GET /api/download?title=<judul>&artist=<artis>
// Download Full MP3 durasi penuh via yt-dlp + ffmpeg — 100% gratis
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/download', (req, res) => {
  const title  = String(req.query.title  || '').trim();
  const artist = String(req.query.artist || '').trim();

  if (!title) return res.status(400).json({ error: 'Parameter title wajib diisi.' });

  const query      = artist ? `${artist} - ${title}` : title;
  const safeName   = sanitizeFilename(`${artist || 'Unknown'} - ${title}.mp3`);
  const outputPath = path.join(DOWNLOAD_DIR, `${Date.now()}_${safeName}`);

  console.log(`[Download] Memulai pencarian & download audio: "${query}"`);

  const args = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--no-playlist',
    `ytsearch1:${query}`,
    '-o', outputPath
  ];

  if (ffmpegStatic) {
    args.push('--ffmpeg-location', ffmpegStatic);
  }

  // Jika user menaruh cookies.txt di server/cookies.txt
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }

  execFile(YT_DLP_PATH, args, (error, stdout, stderr) => {
    if (error) {
      console.error('[yt-dlp error]', stderr || error.message);
      return res.status(500).json({ error: 'Gagal mendownload lagu.', detail: error.message });
    }

    if (!fs.existsSync(outputPath)) {
      console.error('[Download] File MP3 tidak ditemukan:', outputPath);
      return res.status(500).json({ error: 'File audio gagal diproses.' });
    }

    console.log(`[Download] Selesai! Mengirim file: ${safeName}`);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(outputPath, () => {}));
    stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  });
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
