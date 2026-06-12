import express from 'express';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { badgesFromQuery, renderPoster, queryKey } from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '8080', 10);
const BTTTR_BASE = (process.env.BTTTR_BASE || 'https://btttr.cc').replace(/\/+$/, '');
const BTTTR_LAYOUT = process.env.BTTTR_LAYOUT || 'poster-default';
// poster-n = clean poster (no bottom genre/rating strip); tag=none = no trending pill.
const CLEAN_PREFIX = process.env.CLEAN_PREFIX || 'poster-n';
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), 'cache');
const UA = process.env.UPSTREAM_UA
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Optional: lets the service turn a TMDb id into an IMDb id (btttr.cc is IMDb-only).
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

fssync.mkdirSync(CACHE_DIR, { recursive: true });

// Resolve a TMDb id to an IMDb id via the TMDb API, cached in memory.
const tmdbCache = new Map();
async function resolveImdbFromTmdb(tmdbId, type) {
  if (!TMDB_API_KEY) {
    console.warn('[tmdb] TMDB_API_KEY not set — cannot resolve TMDb ids');
    return null;
  }
  const key = `${type}:${tmdbId}`;
  if (tmdbCache.has(key)) return tmdbCache.get(key);
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      console.warn(`[tmdb] ${r.status} resolving ${key}`);
      tmdbCache.set(key, null);
      return null;
    }
    const data = await r.json();
    const imdb = data && data.imdb_id ? String(data.imdb_id) : null;
    tmdbCache.set(key, imdb);
    return imdb;
  } catch (e) {
    console.error(`[tmdb] resolve failed for ${key}: ${e.message}`);
    return null;
  }
}

const app = express();
app.disable('x-powered-by');

// Web UI (preview site, btttr.cc-style) served from ./public
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/poster/:id.jpg', async (req, res) => {
  const rawId = String(req.params.id || '');
  const tmdbType = String(req.query.tmdb || '').toLowerCase(); // 'movie' | 'tv' | ''

  // Resolve the request id to an IMDb id (btttr.cc only understands IMDb).
  let imdb;
  if (/^tt\d+$/i.test(rawId)) {
    imdb = rawId.toLowerCase();
  } else if ((tmdbType === 'movie' || tmdbType === 'tv') && /^\d+$/.test(rawId)) {
    imdb = await resolveImdbFromTmdb(rawId, tmdbType);
    if (!imdb) {
      return res.status(404).send('No IMDb mapping for this TMDb id');
    }
  } else {
    return res.status(400).send('Invalid id (expected ttXXXXXXX, or a TMDb id with ?tmdb=movie|tv)');
  }

  const badges = badgesFromQuery(req.query);
  const cachePath = path.join(CACHE_DIR, `${imdb.toLowerCase()}__${queryKey(req.query)}.jpg`);

  // 1) Serve from disk cache if present.
  try {
    const cached = await fs.readFile(cachePath);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=604800');
    res.set('X-Cache', 'HIT');
    return res.send(cached);
  } catch { /* cache miss -> build it */ }

  // 2) Fetch the clean poster from btttr.cc.
  const cleanUrl = `${BTTTR_BASE}/${CLEAN_PREFIX}/imdb/${BTTTR_LAYOUT}/${imdb}.jpg?tag=none`;
  let baseBuffer;
  try {
    const r = await fetch(cleanUrl, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
    if (!r.ok) {
      console.warn(`[upstream] ${r.status} ${cleanUrl}`);
      return res.status(502).send('Upstream poster not available');
    }
    baseBuffer = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error(`[upstream] fetch failed: ${e.message}`);
    return res.status(502).send('Upstream fetch failed');
  }

  // 3) Composite the quality badges and cache the result.
  try {
    const out = await renderPoster(baseBuffer, badges);
    fs.writeFile(cachePath, out).catch((e) => console.warn(`[cache] write failed: ${e.message}`));
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=604800');
    res.set('X-Cache', 'MISS');
    return res.send(out);
  } catch (e) {
    console.error(`[render] failed for ${imdb}: ${e.message}`);
    return res.status(500).send('Render failed');
  }
});

app.listen(PORT, () => {
  console.log(`Better Poster service listening on :${PORT}`);
  console.log(`Clean source: ${BTTTR_BASE}/${CLEAN_PREFIX}/imdb/${BTTTR_LAYOUT}/{imdb}.jpg?tag=none`);
  console.log(`Cache dir: ${CACHE_DIR}`);
  console.log(`TMDb resolution: ${TMDB_API_KEY ? 'enabled' : 'disabled (set TMDB_API_KEY)'}`);
});
