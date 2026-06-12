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

fssync.mkdirSync(CACHE_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

// Web UI (preview site, btttr.cc-style) served from ./public
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/poster/:imdb.jpg', async (req, res) => {
  const imdb = String(req.params.imdb || '');
  if (!/^tt\d+$/i.test(imdb)) {
    return res.status(400).send('Invalid IMDb id (expected ttXXXXXXX)');
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
});
