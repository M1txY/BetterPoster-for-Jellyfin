import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.join(__dirname, 'public', 'img');

const FONT = "'Liberation Sans','DejaVu Sans','Arial',sans-serif";
// Display face used for the resolution labels (shipped in ./fonts).
// Override with RES_FONT env (e.g. RES_FONT="Inter") and a matching weight via RES_WEIGHT.
const RES_FONT = process.env.RES_FONT || 'Inter ExtraBold';
const RES_WEIGHT = process.env.RES_WEIGHT || '800';
const FONT_BLACK = `'${RES_FONT}','Liberation Sans',sans-serif`;

function f(n) { return Math.round(n * 100) / 100; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// --- White logo assets loaded from public/img -------------------------------
// Each feature maps to candidate file names; the first that exists is used and
// recolored white. Drop a Dolby_Atmos*.svg in that folder to enable an Atmos logo.
const LOGO_FILES = {
  dv: ['Dolby_Vision_2021_logo.svg', 'dolby_vision.svg', 'DolbyVision.svg'],
};
const logoCache = {};

function loadLogo(feature) {
  if (feature in logoCache) return logoCache[feature];
  let result = null;
  for (const name of (LOGO_FILES[feature] || [])) {
    const p = path.join(IMG_DIR, name);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const start = raw.indexOf('<g');
      const end = raw.lastIndexOf('</g>');
      if (start === -1 || end === -1) break;
      let group = raw.slice(start, end + 4)
        .replace(/fill="#000000"/gi, 'fill="#ffffff"')
        .replace(/fill="#000"/gi, 'fill="#ffffff"')
        .replace(/fill="black"/gi, 'fill="#ffffff"');
      const vb = raw.match(/viewBox="([-\d.\s]+)"/);
      let vw = 1051, vh = 393;
      if (vb) {
        const parts = vb[1].trim().split(/\s+/).map(Number);
        if (parts.length === 4) { vw = parts[2]; vh = parts[3]; }
      }
      result = { group, vw, vh };
      break;
    } catch { /* ignore and fall back */ }
  }
  logoCache[feature] = result;
  return result;
}

// Stable cache key derived from the request query (used by the server).
export function queryKey(q) {
  const quality = (q.quality || '').toString().toLowerCase().trim();
  const hdr = (q.hdr || '').toString().toLowerCase().trim();
  return [quality, hdr].filter(Boolean).join('_') || 'none';
}

// Translate the raw query into an ordered list of badge specs.
//   { kind: 'quality', label }            -> white translucent pill, knockout text
//   { kind: 'logo', feature, fallback }   -> white logo, no background
//   { kind: 'word', label }               -> white text, no background
export function badgesFromQuery(q) {
  const badges = [];

  const quality = (q.quality || '').toString().toLowerCase().trim();
  const RES = {
    '4k': '4K', '2160p': '4K', 'uhd': '4K',
    '1080p': '1080p', 'fhd': '1080p',
    '720p': '720p', 'hd': '720p',
    '480p': 'SD', 'sd': 'SD',
  };
  if (RES[quality]) badges.push({ kind: 'quality', label: RES[quality] });

  const hdr = (q.hdr || '').toString().toLowerCase().trim();
  if (hdr === 'dv' || hdr === 'dovi' || hdr === 'dolbyvision') {
    badges.push({ kind: 'logo', feature: 'dv', fallback: ['DOLBY', 'VISION'] });
  } else if (['hdr', 'hdr10', 'hdr10+', 'hdr10plus', 'hlg'].includes(hdr)) {
    badges.push({ kind: 'word', label: 'HDR' });
  }

  return badges;
}

// The Dolby "double-D" mark (used as a fallback when no logo file is present).
function dolbyMark(cx, topY, lh) {
  const w = lh * 0.5;
  const sw = lh * 0.17;
  const gap = lh * 0.12;
  const rsx = cx + gap / 2;
  const lsx = cx - gap / 2;
  const y0 = topY;
  const y1 = topY + lh;
  const right = `M ${f(rsx)} ${f(y0)} L ${f(rsx)} ${f(y1)} `
    + `M ${f(rsx)} ${f(y0)} C ${f(rsx + w * 1.12)} ${f(y0)} ${f(rsx + w * 1.12)} ${f(y1)} ${f(rsx)} ${f(y1)}`;
  const left = `M ${f(lsx)} ${f(y0)} L ${f(lsx)} ${f(y1)} `
    + `M ${f(lsx)} ${f(y0)} C ${f(lsx - w * 1.12)} ${f(y0)} ${f(lsx - w * 1.12)} ${f(y1)} ${f(lsx)} ${f(y1)}`;
  return `<path d="${right} ${left}" fill="none" stroke="#fff"
            stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// White translucent pill with the label KNOCKED OUT (poster shows through).
function drawQuality(b, H, idx) {
  const padX = Math.round(H * 0.42);
  const fontSize = Math.round(H * 0.50);
  const labelW = Math.ceil(b.label.length * fontSize * 0.62);
  const w = Math.round(labelW + 2 * padX);
  const r = Math.round(H * 0.24);
  const cx = w / 2;
  const ty = H * 0.5 + fontSize * 0.35;
  const maskId = `qmask${idx}`;

  // Knockout text in a heavy display face -> uniformly bold across all glyphs.
  const def = `<mask id="${maskId}">
      <rect x="0" y="0" width="${w}" height="${H}" rx="${r}" ry="${r}" fill="#fff"/>
      <text x="${f(cx)}" y="${f(ty)}" font-family="${FONT_BLACK}" font-weight="${RES_WEIGHT}"
            font-size="${fontSize}" text-anchor="middle" fill="#000">${escapeXml(b.label)}</text>
    </mask>`;
  const body = `<rect x="0" y="0" width="${w}" height="${H}" rx="${r}" ry="${r}"
      fill="rgba(255,255,255,0.85)" mask="url(#${maskId})" filter="url(#soft)"/>`;
  return { w, def, body };
}

// White logo with no background (uses the loaded SVG, else a text fallback).
function drawLogo(b, H) {
  const logo = loadLogo(b.feature);
  if (logo) {
    const scale = H / logo.vh;
    const w = Math.round(logo.vw * scale);
    const body = `<g transform="scale(${f(scale)})" filter="url(#soft)">${logo.group}</g>`;
    return { w, def: '', body };
  }
  // Fallback: recreated double-D mark + two stacked white words.
  const padR = Math.round(H * 0.05);
  const gap = Math.round(H * 0.22);
  const logoH = Math.round(H * 0.52);
  const logoTop = (H - logoH) / 2;
  const logoW = Math.round(logoH * 0.95);
  const fsize = Math.round(H * 0.30);
  const [l1, l2] = b.fallback;
  const textW = Math.ceil(Math.max(l1.length, l2.length) * fsize * 0.62);
  const w = Math.round(logoW + gap + textW + padR);
  const tx = logoW + gap;
  const body = `<g filter="url(#soft)">`
    + dolbyMark(logoW / 2, logoTop, logoH)
    + `<text x="${f(tx)}" y="${f(H * 0.46)}" font-family="${FONT}" font-weight="700"
         font-size="${fsize}" letter-spacing="${f(fsize * 0.03)}" fill="#fff">${escapeXml(l1)}</text>`
    + `<text x="${f(tx)}" y="${f(H * 0.80)}" font-family="${FONT}" font-weight="400"
         font-size="${fsize}" letter-spacing="${f(fsize * 0.03)}" fill="rgba(255,255,255,0.85)">${escapeXml(l2)}</text>`
    + `</g>`;
  return { w, def: '', body };
}

// Plain white word, no background (e.g. HDR).
function drawWord(b, H) {
  const fontSize = Math.round(H * 0.56);
  const w = Math.ceil(b.label.length * fontSize * 0.62);
  const ty = H * 0.5 + fontSize * 0.34;
  const body = `<text x="0" y="${f(ty)}" font-family="${FONT}" font-weight="800"
      font-size="${fontSize}" fill="#fff" filter="url(#soft)">${escapeXml(b.label)}</text>`;
  return { w, def: '', body };
}

function drawBadge(b, H, idx) {
  if (b.kind === 'quality') return drawQuality(b, H, idx);
  if (b.kind === 'logo') return drawLogo(b, H);
  return drawWord(b, H);
}

// Full-poster overlay: badges in a single horizontal row, centered at the top.
function buildOverlaySvg(W, H, specs) {
  const marginX = Math.round(W * 0.03);
  const maxW = W - 2 * marginX;
  const marginTop = Math.round(H * 0.028);

  // Size the row to fit: shrink the badge height if the row is too wide.
  let badgeH = clamp(Math.round(H * 0.060), 22, 120);
  let drawn = [];
  let gap = 0;
  let total = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    gap = Math.round(badgeH * 0.45);
    drawn = specs.map((s, i) => drawBadge(s, badgeH, i));
    total = drawn.reduce((acc, d) => acc + d.w, 0) + gap * (drawn.length - 1);
    if (total <= maxW || badgeH <= 22) break;
    badgeH = Math.floor(badgeH * (maxW / total) * 0.99);
  }

  let defs = '';
  let groups = '';
  let x = (W - total) / 2;
  drawn.forEach((d) => {
    if (d.def) defs += d.def;
    groups += `<g transform="translate(${f(x)},${f(marginTop)})">${d.body}</g>`;
    x += d.w + gap;
  });

  const sd = Math.max(0.6, badgeH * 0.05);
  const soft = `<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="${f(badgeH * 0.03)}" stdDeviation="${f(sd)}"
                    flood-color="#000000" flood-opacity="0.55"/>
    </filter>`;

  // Subtle dark gradient along the top edge so badges stay readable.
  const topShade = `<linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>`;
  const shadeRect = `<rect x="0" y="0" width="${W}" height="${Math.round(H * 0.15)}" fill="url(#topShade)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs>${soft}${topShade}${defs}</defs>${shadeRect}${groups}</svg>`;
}

// Composite the badges onto the clean poster and return a JPEG buffer.
// `baseBuffer` may be WebP, PNG or JPEG (btttr.cc currently serves WebP).
export async function renderPoster(baseBuffer, badges) {
  const img = sharp(baseBuffer, { failOn: 'none' });
  const meta = await img.metadata();
  const W = meta.width || 500;
  const H = meta.height || 750;

  if (!badges.length) {
    return img.jpeg({ quality: 90, progressive: true }).toBuffer();
  }

  const svg = buildOverlaySvg(W, H, badges);
  return img
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
}
