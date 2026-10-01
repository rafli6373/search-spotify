const DOWNLOAD_API = 'https://api.nexray.eu.cc/downloader/spotify';
const TURNSTILE_VERIFY_API = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RATE_LIMIT_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 4096;
const lastRequestByIp = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Ukuran request terlalu besar.' });
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  const lastRequestAt = lastRequestByIp.get(clientIp) || 0;
  if (now - lastRequestAt < RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_MS - (now - lastRequestAt)) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Tunggu sebentar sebelum mencoba lagi.' });
  }
  lastRequestByIp.set(clientIp, now);

  const body = parseBody(req.body);
  const spotifyUrl = typeof body?.spotifyUrl === 'string' ? body.spotifyUrl.trim() : '';
  const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken : '';

  if (spotifyUrl.length > 512
    || !isSpotifyTrackUrl(spotifyUrl)
    || turnstileToken.length < 1
    || turnstileToken.length > 2048) {
    return res.status(400).json({ error: 'Data download tidak valid.' });
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Download API] TURNSTILE_SECRET_KEY belum dikonfigurasi.');
    return res.status(500).json({ error: 'Konfigurasi verifikasi belum tersedia.' });
  }

  try {
    const { response: verification, data: verificationData } = await fetchJsonWithTimeout(TURNSTILE_VERIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: turnstileToken,
        remoteip: clientIp,
      }),
    }, REQUEST_TIMEOUT_MS);

    if (!verification.ok
      || !verificationData.success
      || verificationData.action !== 'download'
      || !isAllowedTurnstileHostname(verificationData.hostname)) {
      return res.status(403).json({ error: 'Verifikasi Turnstile gagal.' });
    }

    const { response: upstream, data: upstreamData } = await fetchJsonWithTimeout(
      `${DOWNLOAD_API}?${new URLSearchParams({ url: spotifyUrl })}`,
      {},
      REQUEST_TIMEOUT_MS,
    );
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Layanan download sedang bermasalah.' });
    }

    const audioUrl = upstreamData?.result?.url || upstreamData?.url || null;
    if (!isSafeAudioUrl(audioUrl)) {
      return res.status(502).json({ error: 'URL hasil download tidak ditemukan.' });
    }

    return res.status(200).json({ url: audioUrl });
  } catch (error) {
    console.error('[Download API]', error);
    return res.status(502).json({ error: 'Gagal menghubungi layanan download.' });
  }
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isAllowedTurnstileHostname(hostname) {
  const configuredHostnames = [
    'search-sporify.vercel.app',
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    ...(process.env.TURNSTILE_ALLOWED_HOSTNAMES || '').split(','),
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return configuredHostnames.includes(String(hostname || '').toLowerCase());
}

function isSafeAudioUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSpotifyTrackUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname === 'open.spotify.com' || url.hostname === 'www.open.spotify.com')
      && /^\/track\/[A-Za-z0-9]+/.test(url.pathname);
  } catch {
    return false;
  }
}
