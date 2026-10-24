import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const { Pool } = pg;
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'links.json');
const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
const dbPool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
}) : null;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SAFE_BROWSING_API_KEY = process.env.SAFE_BROWSING_API_KEY?.trim() || '';
const RESERVED_CODES = new Set(['api', 'assets', 'favicon.ico', 'robots.txt', 'health', 'about', 'preview', 'continue']);
const SCAN_CACHE = new Map();

function normalizeBaseUrl(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('BASE_URL must be a full URL, for example https://linkcraft.example.com');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('BASE_URL must be an origin only, with no path, username, password, query, or fragment.');
  }
  if (IS_PRODUCTION && parsed.protocol !== 'https:') {
    throw new Error('BASE_URL must start with https:// when NODE_ENV=production.');
  }
  if (isLoopbackHost(parsed.hostname)) {
    throw new Error('BASE_URL cannot use localhost or 127.0.0.1 because other devices cannot reach those addresses. Leave BASE_URL blank for local development, or set it to a public HTTPS URL after deployment.');
  }
  if (IS_PRODUCTION && (isPrivateIPv4(parsed.hostname) || parsed.hostname.endsWith('.local'))) {
    throw new Error('Production BASE_URL must use a public hostname, not a private LAN address.');
  }
  return parsed.origin;
}

// On Render, RENDER_EXTERNAL_URL is assigned automatically by the hosting platform.
// This makes generated short links use the public hostname after deployment without
// hardcoding localhost or requiring the user to guess the final hostname.
const configuredBaseUrl = process.env.BASE_URL?.trim() || (IS_PRODUCTION ? process.env.RENDER_EXTERNAL_URL?.trim() : '');
const BASE_URL = normalizeBaseUrl(configuredBaseUrl);
if (IS_PRODUCTION && !BASE_URL) {
  throw new Error('Set BASE_URL to your public HTTPS address, or deploy on Render so RENDER_EXTERNAL_URL is provided automatically.');
}
if (IS_PRODUCTION && !DATABASE_URL) {
  throw new Error('DATABASE_URL is required in production. Connect a PostgreSQL database (such as Neon Free) so short links survive restarts and spin-downs.');
}

function initializeLocalFileStorage() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readLinksFromFile() {
  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read local links file:', error.message);
    return [];
  }
}

function writeLinksToFile(links) {
  const tempFile = `${DATA_FILE}.tmp`;
  writeFileSync(tempFile, JSON.stringify(links, null, 2), 'utf8');
  renameSync(tempFile, DATA_FILE);
}

async function initializeStorage() {
  if (!dbPool) {
    initializeLocalFileStorage();
    console.log(`Local development storage: ${DATA_FILE}`);
    return;
  }
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS linkcraft_links (
      code TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
  console.log('Persistent short-link storage: PostgreSQL database');
}

async function readLinks() {
  if (!dbPool) return readLinksFromFile();
  const result = await dbPool.query('SELECT data FROM linkcraft_links');
  return result.rows.map((row) => typeof row.data === 'string' ? JSON.parse(row.data) : row.data);
}

async function createStoredLink(link) {
  if (dbPool) {
    await dbPool.query('INSERT INTO linkcraft_links (code, data) VALUES ($1, $2::jsonb)', [link.code, JSON.stringify(link)]);
    return;
  }
  const links = readLinksFromFile();
  if (links.some((item) => item.code.toLowerCase() === link.code.toLowerCase())) {
    const error = new Error('Short code already exists.');
    error.code = '23505';
    throw error;
  }
  links.push(link);
  writeLinksToFile(links);
}

async function saveLinkUpdate(link) {
  if (dbPool) {
    await dbPool.query('UPDATE linkcraft_links SET data = $2::jsonb WHERE code = $1', [link.code, JSON.stringify(link)]);
    return;
  }
  const links = readLinksFromFile();
  const index = links.findIndex((item) => item.code === link.code);
  if (index === -1) return;
  links[index] = link;
  writeLinksToFile(links);
}

function validateDestination(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: 'Enter a URL first.' };
  }
  if (value.trim().length > 2048) {
    return { ok: false, message: 'That URL is too long. Use a URL under 2,048 characters.' };
  }
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, message: 'Only HTTP and HTTPS links can be shortened.' };
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return { ok: false, message: 'Enter a URL with a valid hostname and no embedded username or password.' };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, message: 'Enter a valid URL including https:// or http://.' };
  }
}

function generateCode(links) {
  let code;
  do {
    code = randomBytes(6).toString('base64url').slice(0, 7);
  } while (links.some((link) => link.code.toLowerCase() === code.toLowerCase()));
  return code;
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

function isPrivateIPv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

function getLinkScope(baseUrl) {
  const parsed = new URL(baseUrl);
  if (isLoopbackHost(parsed.hostname) || isPrivateIPv4(parsed.hostname) || parsed.hostname.endsWith('.local') || !parsed.hostname.includes('.')) {
    return 'local-network';
  }
  return 'public';
}

function getBaseUrl(req) {
  // The hosting provider's canonical URL is authoritative in production.
  if (BASE_URL && IS_PRODUCTION) return BASE_URL;

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0];
  const protocol = forwardedProtocol || req.protocol || 'http';
  const requestHost = req.get('host');
  if (!requestHost) throw new Error('Unable to determine the website address. Deploy LinkCraft publicly and configure BASE_URL.');

  let requestUrl;
  try {
    requestUrl = new URL(`${protocol}://${requestHost}`);
  } catch {
    throw new Error('Unable to determine the website address. Deploy LinkCraft publicly and configure BASE_URL.');
  }

  const host = requestUrl.hostname.toLowerCase();
  const looksLikeLanHostname = !host.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(host);
  const isLocalOrPrivate = isLoopbackHost(host) || isPrivateIPv4(host) || host.endsWith('.local') || host.endsWith('.localhost') || looksLikeLanHostname;

  // Do not issue localhost/LAN links: they cannot work from arbitrary networks.
  // A stale BASE_URL in a local .env file must not override this check.
  if (isLocalOrPrivate) {
    throw new Error('LinkCraft is running locally, so it cannot create a public short link for this destination yet. Deploy LinkCraft to a public HTTPS host first. YouTube video URLs can use the official youtu.be link without deploying LinkCraft.');
  }

  if (BASE_URL && requestUrl.origin !== BASE_URL) {
    throw new Error('LinkCraft is not running at the configured BASE_URL. Create custom links from the public deployment, not from a local development server.');
  }
  if (IS_PRODUCTION && requestUrl.protocol !== 'https:') {
    throw new Error('Public LinkCraft URLs must use HTTPS. Set BASE_URL to your public HTTPS address.');
  }
  return BASE_URL || requestUrl.origin;
}

function getYouTubeVideoId(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let candidate = null;

  if (hostname === 'youtu.be') {
    candidate = parsed.pathname.split('/').filter(Boolean)[0] || null;
  } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)) {
    if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
    else {
      const match = parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      if (match) candidate = match[1];
    }
  }

  return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

function parseDurationMs(value, fallbackMs = 60_000) {
  if (typeof value !== 'string') return fallbackMs;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return fallbackMs;
  const ms = Number(match[1]) * 1000;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 24 * 60 * 60 * 1000) : fallbackMs;
}

/**
 * Uses Google Safe Browsing v5 when SAFE_BROWSING_API_KEY is configured.
 * No key means "not_configured", never a claim that the URL is safe.
 */
async function scanUrl(url) {
  if (!SAFE_BROWSING_API_KEY) {
    return { status: 'not_configured', checkedAt: null, threatTypes: [] };
  }

  const now = Date.now();
  const cached = SCAN_CACHE.get(url);
  if (cached && cached.expiresAt > now) return cached.result;
  if (cached) SCAN_CACHE.delete(url);

  const endpoint = new URL('https://safebrowsing.googleapis.com/v5/urls:search');
  endpoint.searchParams.set('key', SAFE_BROWSING_API_KEY);
  endpoint.searchParams.append('urls', url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Safe Browsing check timed out.' : 'Safe Browsing could not be reached.';
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Do not log the request URL: it includes a secret API key.
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error('Safe Browsing rejected the API request. Check your API key and API activation.');
    }
    throw new Error('Safe Browsing is temporarily unavailable. Please try again.');
  }

  const data = await response.json();
  const threats = Array.isArray(data.threats) ? data.threats : [];
  const threatTypes = [...new Set(threats.flatMap((item) => Array.isArray(item.threatTypes) ? item.threatTypes : []))];
  const result = {
    status: threats.length > 0 ? 'unsafe' : 'clear',
    checkedAt: new Date().toISOString(),
    threatTypes
  };
  SCAN_CACHE.set(url, {
    result,
    expiresAt: now + parseDurationMs(data.cacheDuration)
  });
  return result;
}

function applyScanResult(link, scan) {
  // Never remove a known block when the scanner has not actually checked the URL.
  if (scan.status === 'not_configured') {
    if (link.scanStatus !== 'unsafe') {
      link.scanStatus = 'not_configured';
      link.scanCheckedAt = null;
      link.threatTypes = [];
      link.blocked = false;
    }
    return;
  }
  link.scanStatus = scan.status;
  link.scanCheckedAt = scan.checkedAt || null;
  link.threatTypes = Array.isArray(scan.threatTypes) ? scan.threatTypes : [];
  link.blocked = scan.status === 'unsafe';
}

function previewPayload(link, scanStatus = link.scanStatus, scanCheckedAt = link.scanCheckedAt, threatTypes = link.threatTypes || []) {
  const isUnsafe = link.blocked === true || scanStatus === 'unsafe';
  const unavailable = scanStatus === 'unavailable';
  return {
    code: link.code,
    originalUrl: link.url,
    createdAt: link.createdAt,
    scanStatus: isUnsafe ? 'unsafe' : scanStatus,
    scanCheckedAt,
    threatTypes,
    clicks: link.clicks || 0,
    canContinue: !isUnsafe && !unavailable,
    scannerConfigured: Boolean(SAFE_BROWSING_API_KEY)
  };
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: IS_PRODUCTION ? { maxAge: 15_552_000, includeSubDomains: false, preload: false } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));

// In production, redirect all non-HTTPS requests to the one configured canonical origin.
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(308, `${BASE_URL}${req.originalUrl}`);
  });
}

app.use(express.json({ limit: '10kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a little and try again.' }
});
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', scannerConfigured: Boolean(SAFE_BROWSING_API_KEY) }));

app.get('/api/config', (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    return res.json({ baseUrl, linkScope: getLinkScope(baseUrl) });
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
});

app.post('/api/shorten', async (req, res) => {
  const destination = validateDestination(req.body?.url);
  if (!destination.ok) return res.status(400).json({ error: destination.message });

  const requestedCode = typeof req.body?.customCode === 'string' ? req.body.customCode.trim() : '';
  if (requestedCode && !/^[a-zA-Z0-9_-]{3,24}$/.test(requestedCode)) {
    return res.status(400).json({ error: 'Custom alias must be 3–24 characters: letters, numbers, hyphens, or underscores.' });
  }
  if (requestedCode && RESERVED_CODES.has(requestedCode.toLowerCase())) {
    return res.status(400).json({ error: 'That alias is reserved. Please choose another one.' });
  }

  let scan;
  try {
    scan = await scanUrl(destination.url);
  } catch (error) {
    // When the scanner is configured but unavailable, fail closed instead of creating an unchecked link.
    return res.status(503).json({
      error: `${error.message} No short link was created. Try again later.`,
      scanStatus: 'unavailable'
    });
  }
  if (scan.status === 'unsafe') {
    const categories = scan.threatTypes.length ? ` Detected category: ${scan.threatTypes.join(', ')}.` : '';
    return res.status(400).json({
      error: `Google Safe Browsing identified this destination as potentially unsafe, so LinkCraft did not create the link.${categories} See the Google Safe Browsing Advisory for details.`,
      scanStatus: 'unsafe',
      threatTypes: scan.threatTypes
    });
  }

  const youtubeVideoId = getYouTubeVideoId(destination.url);
  let baseUrl;
  try {
    baseUrl = getBaseUrl(req);
  } catch (error) {
    // For a YouTube URL without a custom alias, local development can still return
    // YouTube's official globally reachable URL. A custom alias must be hosted on
    // LinkCraft's public domain, so it must never fall back to localhost.
    if (youtubeVideoId && !requestedCode) {
      const parsedDestination = new URL(destination.url);
      const start = parsedDestination.searchParams.get('t') || parsedDestination.searchParams.get('start');
      const officialUrl = new URL(`https://youtu.be/${youtubeVideoId}`);
      if (start && /^(?:\d+|(?:(?:\d+h)?(?:\d+m)?(?:\d+s)?))$/.test(start)) {
        officialUrl.searchParams.set('t', start);
      }
      return res.status(201).json({
        code: `yt_${youtubeVideoId}`,
        directLink: true,
        linkKind: 'youtube-official',
        originalUrl: destination.url,
        shortUrl: officialUrl.toString(),
        linkScope: 'public',
        createdAt: new Date().toISOString(),
        clicks: null,
        scanStatus: scan.status,
        scannerConfigured: Boolean(SAFE_BROWSING_API_KEY),
        message: 'This uses YouTube’s official youtu.be link. To use a custom name such as /rish, deploy LinkCraft publicly and select “Customize your link”.'
      });
    }
    return res.status(503).json({ error: `${error.message} No short link was created.` });
  }

  const links = await readLinks();
  let code;
  if (requestedCode) {
    if (links.some((link) => link.code.toLowerCase() === requestedCode.toLowerCase())) {
      return res.status(409).json({ error: 'That alias is already taken. Try another one.' });
    }
    code = requestedCode;
  } else {
    code = generateCode(links);
  }

  const link = {
    code,
    url: destination.url,
    createdAt: new Date().toISOString(),
    clicks: 0,
    lastClickedAt: null,
    scanStatus: scan.status,
    scanCheckedAt: scan.checkedAt || null,
    threatTypes: scan.threatTypes || [],
    blocked: false
  };
  try {
    await createStoredLink(link);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: requestedCode ? 'That alias is already taken. Try another one.' : 'A short-code collision occurred. Please try again.' });
    }
    console.error('Could not save short link:', error.message);
    return res.status(500).json({ error: 'Could not save this link right now. Please try again.' });
  }

  return res.status(201).json({
    code: link.code,
    originalUrl: link.url,
    shortUrl: `${baseUrl}/${encodeURIComponent(link.code)}`,
    linkScope: getLinkScope(baseUrl),
    createdAt: link.createdAt,
    clicks: link.clicks,
    scanStatus: link.scanStatus,
    scanCheckedAt: link.scanCheckedAt,
    scannerConfigured: Boolean(SAFE_BROWSING_API_KEY)
  });
});

app.get('/api/stats/:code', async (req, res) => {
  const code = req.params.code;
  const link = (await readLinks()).find((item) => item.code === code);
  if (!link) return res.status(404).json({ error: 'Short link not found.' });
  let baseUrl;
  try {
    baseUrl = getBaseUrl(req);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({
    code: link.code,
    originalUrl: link.url,
    shortUrl: `${baseUrl}/${encodeURIComponent(link.code)}`,
    linkScope: getLinkScope(baseUrl),
    createdAt: link.createdAt,
    clicks: link.clicks,
    lastClickedAt: link.lastClickedAt,
    scanStatus: link.scanStatus || 'not_configured',
    scanCheckedAt: link.scanCheckedAt || null,
    blocked: link.blocked === true
  });
});

app.get('/api/preview/:code', async (req, res) => {
  const link = (await readLinks()).find((item) => item.code === req.params.code);
  if (!link) return res.status(404).json({ error: 'Short link not found.' });

  try {
    const scan = await scanUrl(link.url);
    applyScanResult(link, scan);
    await saveLinkUpdate(link);
    return res.json(previewPayload(link));
  } catch (error) {
    return res.status(503).json({
      ...previewPayload(link, 'unavailable', link.scanCheckedAt, link.threatTypes || []),
      canContinue: false,
      message: error.message || 'The destination could not be checked right now.'
    });
  }
});

// Each generated link shows a destination preview first. This route is the explicit continue action.
app.get('/:code/continue', async (req, res) => {
  const code = req.params.code;
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  const links = await readLinks();
  const link = links.find((item) => item.code === code);
  if (!link) return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));

  try {
    const scan = await scanUrl(link.url);
    applyScanResult(link, scan);
    await saveLinkUpdate(link);
    if (link.blocked || scan.status === 'unsafe') {
      return res.status(403).sendFile(path.join(PUBLIC_DIR, 'preview.html'));
    }
  } catch {
    // If scanning has been configured but fails, don't open the destination unchecked.
    return res.status(503).sendFile(path.join(PUBLIC_DIR, 'preview.html'));
  }

  link.clicks = (link.clicks || 0) + 1;
  link.lastClickedAt = new Date().toISOString();
  try {
    await saveLinkUpdate(link);
  } catch (error) {
    console.error('Could not update click count:', error.message);
  }
  return res.redirect(302, link.url);
});

app.get('/:code', async (req, res, next) => {
  const code = req.params.code;
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) return next();
  const link = (await readLinks()).find((item) => item.code === code);
  if (!link) return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  res.set('Cache-Control', 'no-store');
  return res.sendFile(path.join(PUBLIC_DIR, 'preview.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found.' });
  return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

async function startServer() {
  await initializeStorage();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LinkCraft server listening on port ${PORT}`);
    if (BASE_URL && IS_PRODUCTION) console.log(`Public short-link URL: ${BASE_URL}`);
    console.log('Custom short links require a public deployment; localhost and LAN links are not generated.');
    console.log(`Storage backend: ${dbPool ? 'PostgreSQL (persistent)' : `local JSON file (${DATA_FILE})`}`);
    console.log(`Google Safe Browsing URL scanning: ${SAFE_BROWSING_API_KEY ? 'configured' : 'NOT configured (links will be marked unscanned)'}`);
  });
}

startServer().catch((error) => {
  console.error('LinkCraft failed to start:', error.message);
  process.exitCode = 1;
});
