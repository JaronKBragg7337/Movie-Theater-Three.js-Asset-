import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Procedural CC0 texture authoring.
 *  Every map is generated in-browser: no external files, no licences.
 *  Maps are authored at a fixed texel-per-metre budget so that texel
 *  density stays consistent between a seat cushion and a 20 m wall.
 * ------------------------------------------------------------------ */

export const TEXELS_PER_METRE = 256;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Periodic value-noise field — wraps exactly, so tiles never seam. */
function tileNoise(w, h, freq, rand) {
  const g = new Float32Array(freq * freq);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * freq;
    const y0 = Math.floor(fy) % freq;
    const y1 = (y0 + 1) % freq;
    const ty = smooth(fy - Math.floor(fy));
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * freq;
      const x0 = Math.floor(fx) % freq;
      const x1 = (x0 + 1) % freq;
      const tx = smooth(fx - Math.floor(fx));
      const a = g[y0 * freq + x0], b = g[y0 * freq + x1];
      const c = g[y1 * freq + x0], d = g[y1 * freq + x1];
      out[y * w + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    }
  }
  return out;
}

function fbm(w, h, octaves, baseFreq, rand, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const layer = tileNoise(w, h, freq, rand);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= gain;
    freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ---------- canvas helpers ---------- */

function newCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Grayscale field -> single-channel-ish RGB canvas (roughness / metalness). */
function fieldToCanvas(field, size, mapFn) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(clamp01(mapFn(field[i], i % size, (i / size) | 0)) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Derive a tangent-space normal map from a height field via Sobel. */
function heightToNormalCanvas(height, size, strength = 2.0) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Read painted canvas luminance back out as a height field. */
function canvasHeight(canvas) {
  const size = canvas.width;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++)
    out[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return out;
}

/* ================================================================== *
 *  CARPET — classic cinema damask/geometric, burgundy + gold + teal
 * ================================================================== */
export function makeCarpet(size = 1024, tileMetres = 2.2) {
  const rand = mulberry32(7331);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#3a0d16';
  ctx.fillRect(0, 0, size, size);

  // Under-weave: broad diagonal weft so the base never reads as flat colour.
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#5c1a24';
  ctx.lineWidth = 3;
  for (let i = -size; i < size * 2; i += 9) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Motif grid — 4 repeats across the tile so the pattern is legible at walking distance.
  const cells = 4;
  const cs = size / cells;
  const drawMotif = (cx, cy, s, flip) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flip ? -1 : 1, 1);

    // Gold ogee outline
    ctx.strokeStyle = '#b8912f';
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.42);
    ctx.bezierCurveTo(s * 0.34, -s * 0.3, s * 0.4, s * 0.06, 0, s * 0.42);
    ctx.bezierCurveTo(-s * 0.4, s * 0.06, -s * 0.34, -s * 0.3, 0, -s * 0.42);
    ctx.stroke();

    // Inner teal fill
    ctx.fillStyle = 'rgba(20,72,74,0.55)';
    ctx.fill();

    // Fleur centre
    ctx.fillStyle = '#c9a24a';
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.ellipse(Math.cos(a) * s * 0.11, Math.sin(a) * s * 0.11, s * 0.06, s * 0.1, a, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = '#e0c070';
    ctx.fill();

    // Corner scroll ticks — tertiary detail that survives mip-down as texture grain
    ctx.strokeStyle = 'rgba(184,145,47,0.7)';
    ctx.lineWidth = s * 0.02;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * s * 0.36, sy * s * 0.36, s * 0.1, 0, Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  };

  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++)
      drawMotif(cs * (x + 0.5), cs * (y + 0.5), cs * 0.92, (x + y) % 2 === 0);

  // Interstitial lattice
  ctx.strokeStyle = 'rgba(140,105,40,0.35)';
  ctx.lineWidth = size * 0.004;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(0, cs * i); ctx.lineTo(size, cs * i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cs * i, 0); ctx.lineTo(cs * i, size); ctx.stroke();
  }

  // Fibre / pile noise + macro variation (anti-tiling: two very different scales)
  const fibre = fbm(size, size, 4, 128, rand);
  const macro = fbm(size, size, 3, 3, rand);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const f = (fibre[i] - 0.5) * 46;
    const m = (macro[i] - 0.5) * 30;
    img.data[i * 4] = clamp01((img.data[i * 4] + f + m) / 255) * 255;
    img.data[i * 4 + 1] = clamp01((img.data[i * 4 + 1] + f + m * 0.7) / 255) * 255;
    img.data[i * 4 + 2] = clamp01((img.data[i * 4 + 2] + f + m * 0.5) / 255) * 255;
  }
  ctx.putImageData(img, 0, 0);

  const h = fbm(size, size, 5, 96, rand);
  const painted = canvasHeight(c);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = h[i] * 0.65 + painted[i] * 0.35;

  const rough = fieldToCanvas(macro, size, (v, x, y) => 0.86 + (fibre[y * size + x] - 0.5) * 0.14 - v * 0.06);
  const repeat = 1;
  return {
    map: toTexture(c, { srgb: true, repeat, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 1.6), { repeat }),
    roughnessMap: toTexture(rough, { repeat }),
    tileMetres,
  };
}

/* ================================================================== *
 *  SEAT VELOUR — directional weave, seam wear, sit-polish
 * ================================================================== */
export function makeVelour(size = 1024, base = [0.42, 0.06, 0.10]) {
  const rand = mulberry32(2024);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);

  const weftN = fbm(size, size, 3, 64, rand);
  const macro = fbm(size, size, 4, 4, rand);
  const wear = fbm(size, size, 3, 6, rand);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Twill weave: two interleaved thread directions
      const warp = Math.sin((x / size) * Math.PI * 2 * 220) * 0.5 + 0.5;
      const weft = Math.sin((y / size) * Math.PI * 2 * 200 + weftN[i] * 4) * 0.5 + 0.5;
      const weave = 0.82 + warp * 0.10 + weft * 0.12;
      // Pile sheen varies over big blobs — this is what sells velvet
      const sheen = 0.86 + macro[i] * 0.34;
      // Polished / lighter patches where thousands of people have sat
      const polish = clamp01((wear[i] - 0.58) * 3.2) * 0.22;

      const k = weave * sheen;
      const o = i * 4;
      img.data[o]     = clamp01(base[0] * k + polish * 0.9) * 255;
      img.data[o + 1] = clamp01(base[1] * k + polish * 0.55) * 255;
      img.data[o + 2] = clamp01(base[2] * k + polish * 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      height[i] =
        (Math.sin((x / size) * Math.PI * 2 * 220) * 0.25 +
          Math.sin((y / size) * Math.PI * 2 * 200) * 0.25) * 0.5 + 0.5;
      height[i] = height[i] * 0.55 + weftN[i] * 0.45;
    }

  const rough = fieldToCanvas(wear, size, (v, x, y) => 0.94 - clamp01((v - 0.55) * 3) * 0.30 + (macro[y * size + x] - 0.5) * 0.06);

  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.9), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 0.9,
  };
}

/* ================================================================== *
 *  LEATHER — armrest caps, headrest crowns
 * ================================================================== */
export function makeLeather(size = 512) {
  const rand = mulberry32(515);
  const cells = fbm(size, size, 2, 34, rand);
  const fine = fbm(size, size, 4, 150, rand);
  const macro = fbm(size, size, 3, 5, rand);

  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const grain = 1 - Math.abs(cells[i] - 0.5) * 1.5;
    const k = 0.55 + grain * 0.35 + (fine[i] - 0.5) * 0.18 + (macro[i] - 0.5) * 0.2;
    const o = i * 4;
    img.data[o] = clamp01(0.20 * k * 2.1) * 255;
    img.data[o + 1] = clamp01(0.075 * k * 2.1) * 255;
    img.data[o + 2] = clamp01(0.055 * k * 2.1) * 255;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = cells[i] * 0.7 + fine[i] * 0.3;

  // Burnished where hands rest: lower roughness in the macro highs
  const rough = fieldToCanvas(macro, size, (v, x, y) => 0.62 - clamp01((v - 0.5) * 2.4) * 0.26 + (fine[y * size + x] - 0.5) * 0.1);

  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 1.5), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 0.5,
  };
}

/* ================================================================== *
 *  WALNUT — trim, wainscot, armrest tops
 * ================================================================== */
export function makeWood(size = 512) {
  const rand = mulberry32(90210);
  const warp = fbm(size, size, 4, 8, rand);
  const fine = fbm(size, size, 3, 90, rand);
  const pore = fbm(size, size, 2, 200, rand);

  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const rings = Math.sin((u * 15 + warp[i] * 3.6) * Math.PI * 2) * 0.5 + 0.5;
      const grain = Math.pow(rings, 1.7);
      const k = 0.54 + grain * 0.26 + (fine[i] - 0.5) * 0.10;
      const p = pore[i] > 0.72 ? 0.84 : 1.0;
      const o = i * 4;
      img.data[o] = clamp01(0.30 * k * p * 1.30) * 255;
      img.data[o + 1] = clamp01(0.166 * k * p * 1.30) * 255;
      img.data[o + 2] = clamp01(0.092 * k * p * 1.30) * 255;
      img.data[o + 3] = 255;
      height[i] = grain * 0.6 + (pore[i] > 0.72 ? 0 : 0.4) + fine[i] * 0.1;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rough = fieldToCanvas(fine, size, (v, x, y) => 0.30 + v * 0.18 + (pore[y * size + x] > 0.72 ? 0.22 : 0));

  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.8), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 2.6,
  };
}

/* ================================================================== *
 *  ACOUSTIC WALL FABRIC — deep red, stretched over frames
 * ================================================================== */
export function makeAcousticFabric(size = 512) {
  const rand = mulberry32(4242);
  const macro = fbm(size, size, 4, 5, rand);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const wv = (Math.sin(x * 0.8) * 0.5 + 0.5) * (Math.sin(y * 0.8) * 0.5 + 0.5);
      const k = 0.62 + wv * 0.36 + (macro[i] - 0.5) * 0.26;
      const o = i * 4;
      img.data[o] = clamp01(0.255 * k * 2.0) * 255;
      img.data[o + 1] = clamp01(0.05 * k * 2.0) * 255;
      img.data[o + 2] = clamp01(0.075 * k * 2.0) * 255;
      img.data[o + 3] = 255;
      height[i] = wv * 0.7 + macro[i] * 0.3;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rough = fieldToCanvas(macro, size, (v) => 0.93 + (v - 0.5) * 0.08);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.7), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 1.5,
  };
}

/* ================================================================== *
 *  PLASTER — ceiling, coffers, ornamental relief backing
 * ================================================================== */
export function makePlaster(size = 512) {
  const rand = mulberry32(1717);
  const coarse = fbm(size, size, 4, 12, rand);
  const fine = fbm(size, size, 3, 110, rand);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const k = 0.80 + (coarse[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.09;
    const o = i * 4;
    img.data[o] = clamp01(0.34 * k * 2.2) * 255;
    img.data[o + 1] = clamp01(0.30 * k * 2.2) * 255;
    img.data[o + 2] = clamp01(0.265 * k * 2.2) * 255;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = coarse[i] * 0.6 + fine[i] * 0.4;
  const rough = fieldToCanvas(coarse, size, (v) => 0.88 + (v - 0.5) * 0.12);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.55), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 2.5,
  };
}

/* ================================================================== *
 *  CONCRETE — riser faces, service areas
 * ================================================================== */
export function makeConcrete(size = 512) {
  const rand = mulberry32(31337);
  const coarse = fbm(size, size, 4, 9, rand);
  const agg = fbm(size, size, 3, 70, rand);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const blot = agg[i] > 0.68 ? 0.9 : 1;
    const k = (0.62 + (coarse[i] - 0.5) * 0.3 + (agg[i] - 0.5) * 0.16) * blot;
    const o = i * 4;
    const v = clamp01(k) * 255;
    img.data[o] = v * 0.98; img.data[o + 1] = v * 0.96; img.data[o + 2] = v * 0.93;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = coarse[i] * 0.55 + agg[i] * 0.45;
  const rough = fieldToCanvas(agg, size, (v) => 0.90 + (v - 0.5) * 0.1);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 1.1), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 2,
  };
}

/* ================================================================== *
 *  BRUSHED / CAST METAL — frames, rails, cupholders, rivets
 * ================================================================== */
export function makeMetal(size = 512, tint = [0.62, 0.60, 0.58]) {
  const rand = mulberry32(8080);
  const brush = fbm(size, size, 3, 220, rand);
  const macro = fbm(size, size, 4, 6, rand);
  const pit = fbm(size, size, 2, 130, rand);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Brushing runs along U
      const b = brush[y * size + ((x * 7) % size)];
      const k = 0.78 + (b - 0.5) * 0.22 + (macro[i] - 0.5) * 0.14;
      const corrode = pit[i] > 0.79 ? 0.72 : 1;
      const o = i * 4;
      img.data[o] = clamp01(tint[0] * k * corrode) * 255;
      img.data[o + 1] = clamp01(tint[1] * k * corrode) * 255;
      img.data[o + 2] = clamp01(tint[2] * k * corrode * 0.98) * 255;
      img.data[o + 3] = 255;
      height[i] = b * 0.5 + (pit[i] > 0.79 ? 0 : 0.5);
    }
  }
  ctx.putImageData(img, 0, 0);
  // Edge wear = polished; recesses = oxidised
  const rough = fieldToCanvas(macro, size, (v, x, y) => 0.34 + (1 - v) * 0.30 + (pit[y * size + x] > 0.79 ? 0.28 : 0));
  const metal = fieldToCanvas(pit, size, (v) => (v > 0.79 ? 0.55 : 1.0));
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.6), {}),
    roughnessMap: toTexture(rough, {}),
    metalnessMap: toTexture(metal, {}),
    tileMetres: 0.6,
  };
}

/* ================================================================== *
 *  SCREEN FABRIC — perforated matte-white gain surface
 * ================================================================== */
export function makeScreenFabric(size = 512) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#d8d8d6';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#2a2a2c';
  const step = size / 64;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      ctx.beginPath();
      ctx.arc((x + 0.5) * step, (y + 0.5) * step, step * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  const height = canvasHeight(c);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.5), {}),
    tileMetres: 0.35,
  };
}

/* ================================================================== *
 *  TERRAZZO — lobby floor, polished aggregate in a cement matrix
 * ================================================================== */
export function makeTerrazzo(size = 1024, tileMetres = 3.0) {
  const rand = mulberry32(6060);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#6d6a66';
  ctx.fillRect(0, 0, size, size);

  const chipCols = ['#cfcac0', '#a9a297', '#84868c', '#ddd7ca', '#63656b', '#b39a70', '#e8e4da'];
  const draw = (cx, cy, r, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (0.62 + rand() * 0.55);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  // Wrap each chip across the tile edges so the pattern is seamless.
  // Chips run 4–30 mm across, matching a real poured terrazzo mix.
  for (let i = 0; i < 9000; i++) {
    const cx = rand() * size, cy = rand() * size;
    const r = (1.2 + Math.pow(rand(), 2.6) * 6.5) * (size / 1024);
    const col = chipCols[(rand() * chipCols.length) | 0];
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      if (Math.abs(dx) + Math.abs(dy) > size * 1.1) continue;
      draw(cx + dx, cy + dy, r, col);
    }
  }

  const grime = fbm(size, size, 4, 5, rand);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const g = (grime[i] - 0.5) * 34;
    img.data[i * 4] += g; img.data[i * 4 + 1] += g; img.data[i * 4 + 2] += g;
  }
  ctx.putImageData(img, 0, 0);

  const height = canvasHeight(c);
  // Polished stone: low roughness overall, with traffic-worn dull patches.
  // Polished, but not a mirror: below ~0.28 every point light burns a
  // blown specular hole in the floor.
  const rough = fieldToCanvas(grime, size, (v, x, y) => 0.30 + clamp01(v - 0.45) * 0.34 + height[y * size + x] * 0.06);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(height, size, 0.35), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres,
  };
}

/* ================================================================== *
 *  ACM PANEL — the flat composite cladding of a modern cinema box
 * ================================================================== */
export function makeACM(size = 512, base = [0.30, 0.305, 0.325]) {
  const rand = mulberry32(1212);
  const peel = fbm(size, size, 4, 40, rand);
  const macro = fbm(size, size, 3, 4, rand);
  const streak = fbm(size, size, 2, 90, rand);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Rain-streak weathering runs down the panel
      const rain = clamp01(streak[((y * 3) % size) * size + x] - 0.62) * 0.5;
      const k = 1 + (peel[i] - 0.5) * 0.10 + (macro[i] - 0.5) * 0.13 - rain * 0.16;
      const o = i * 4;
      img.data[o] = clamp01(base[0] * k) * 255;
      img.data[o + 1] = clamp01(base[1] * k) * 255;
      img.data[o + 2] = clamp01(base[2] * k) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rough = fieldToCanvas(macro, size, (v, x, y) => 0.44 + (peel[y * size + x] - 0.5) * 0.16 + (v - 0.5) * 0.12);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(peel, size, 0.25), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 1.5,
  };
}

/* ================================================================== *
 *  ASPHALT — the test-environment forecourt
 * ================================================================== */
export function makeAsphalt(size = 512) {
  const rand = mulberry32(777);
  const agg = fbm(size, size, 4, 90, rand);
  const macro = fbm(size, size, 4, 6, rand);
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const chip = agg[i] > 0.66 ? 1.5 : 1.0;
    const k = (0.16 + (agg[i] - 0.5) * 0.13 + (macro[i] - 0.5) * 0.09) * chip;
    const o = i * 4;
    const v = clamp01(k) * 255;
    img.data[o] = v; img.data[o + 1] = v * 1.01; img.data[o + 2] = v * 1.05;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rough = fieldToCanvas(agg, size, (v) => 0.86 + (v - 0.5) * 0.12);
  return {
    map: toTexture(c, { srgb: true, aniso: 16 }),
    normalMap: toTexture(heightToNormalCanvas(agg, size, 1.2), {}),
    roughnessMap: toTexture(rough, {}),
    tileMetres: 2.0,
  };
}

/** Backlit concession menu board. */
export function makeMenuBoard(panel = 0) {
  const W = 512, H = 384;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141822'); g.addColorStop(1, '#0b0e15');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const menus = [
    ['CONCESSIONS', [['Popcorn — Small', '5.50'], ['Popcorn — Large', '8.00'], ['Nachos', '7.25'], ['Pretzel Bites', '6.50'], ['Candy', '4.75']]],
    ['DRINKS', [['Fountain — Reg', '4.95'], ['Fountain — Large', '6.25'], ['Bottled Water', '3.50'], ['Coffee', '3.95'], ['Slush', '5.50']]],
    ['COMBOS', [['The Matinee', '12.50'], ['Double Feature', '18.00'], ['Family Bundle', '26.00'], ['Refill Bucket', '9.75'], ['Kids Pack', '8.50']]],
  ];
  const [title, rows] = menus[panel % menus.length];

  ctx.fillStyle = '#e8c26a';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, W / 2, 56);
  ctx.strokeStyle = 'rgba(232,194,106,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(48, 74); ctx.lineTo(W - 48, 74); ctx.stroke();

  ctx.font = '26px Arial';
  rows.forEach(([name, price], i) => {
    const y = 122 + i * 50;
    ctx.textAlign = 'left'; ctx.fillStyle = '#e6ecf5';
    ctx.fillText(name, 54, y);
    ctx.textAlign = 'right'; ctx.fillStyle = '#9fd0ff';
    ctx.fillText(price, W - 54, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(54, y + 14); ctx.lineTo(W - 54, y + 14); ctx.stroke();
  });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Channel-letter fascia sign face. */
export function makeSignFace(text = 'GRAND PALACE', sub = 'CINEMA') {
  const W = 2048, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  ctx.shadowColor = '#ffca6a';
  ctx.shadowBlur = 46;
  ctx.fillStyle = '#fff2d4';
  ctx.font = 'bold 210px Georgia, serif';
  ctx.fillText(text, W / 2, 250);

  ctx.shadowColor = '#7fd4ff';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#dff3ff';
  ctx.font = '96px Arial';
  ctx.letterSpacing = '28px';
  ctx.fillText(sub, W / 2, 400);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/** Backlit auditorium identifier over each house door. */
export function makeScreenSign(label = 'SCREEN 1') {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e9f4ff';
  ctx.font = 'bold 64px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = '10px';
  ctx.fillText(label, W / 2, H / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ================================================================== *
 *  DECALS & SIGNAGE
 * ================================================================== */
export function makeRowPlate(letter) {
  const c = newCanvas(128);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#8d6c2a'); g.addColorStop(0.45, '#d8b25c'); g.addColorStop(1, '#6f5320');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(60,42,12,0.8)'; ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.fillStyle = '#2b1e08';
  ctx.font = 'bold 78px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  // engraving highlight
  ctx.fillStyle = 'rgba(255,235,180,0.35)';
  ctx.fillText(letter, 63, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeExitSign() {
  const c = newCanvas(256);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#12ff5a'; ctx.fillRect(8, 78, 240, 100);
  ctx.fillStyle = '#001a06';
  ctx.font = 'bold 74px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makePoster(seed) {
  const rand = mulberry32(seed);
  const W = 512, H = 768;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  const palettes = [
    ['#0b1d3a', '#2a6fb0', '#f2c14e', 'THE LAST PROJECTOR'],
    ['#2a0713', '#8c1c34', '#e8c26a', 'VELVET HOUR'],
    ['#06231c', '#159c76', '#f0f5e6', 'DEEP FIELD'],
    ['#1a1420', '#6b3fa0', '#ffd9a0', 'NIGHT REEL'],
    ['#2b1400', '#c4661f', '#ffe9b0', 'DUST & EMBER'],
    ['#001018', '#0f7c8c', '#d9f2ff', 'SILENT ORBIT'],
  ];
  const p = palettes[seed % palettes.length];

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p[0]); g.addColorStop(0.6, p[1]); g.addColorStop(1, p[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Silhouette skyline / figure — reads as a poster at a glance
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.78);
  for (let x = 0; x <= W; x += 32) {
    ctx.lineTo(x, H * (0.62 + rand() * 0.18));
    ctx.lineTo(x + 32, H * (0.62 + rand() * 0.18));
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = p[2];
  ctx.beginPath(); ctx.arc(W * 0.68, H * 0.28, W * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = p[2];
  ctx.font = 'bold 46px Georgia, serif';
  ctx.textAlign = 'center';
  const words = p[3].split(' ');
  words.forEach((w, i) => ctx.fillText(w, W / 2, H * 0.80 + i * 50));

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '15px Arial';
  ctx.fillText('COMING SOON', W / 2, H * 0.94);
  ctx.font = '10px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('A GRAND PALACE PICTURES RELEASE', W / 2, H * 0.97);

  // Print grain + a fold crease so it isn't a flat vector
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 14;
    img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Soft radial falloff — used for light pools, projector haze, sconce glow. */
export function makeRadialAlpha(size = 128, power = 2.2) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      const v = clamp01(1 - d);
      const a = Math.pow(v, power) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Set UV repeat from real-world surface size so every material in the
 * theatre lands on the same texels-per-metre budget.
 */
export function setTiling(maps, widthM, heightM, tileMetres) {
  const rx = widthM / tileMetres;
  const ry = heightM / tileMetres;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
    const t = maps[key];
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; }
  }
}

/** Clone a texture set so one surface can tile independently of another. */
export function cloneSet(set) {
  const out = { tileMetres: set.tileMetres };
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
    if (set[key]) { out[key] = set[key].clone(); out[key].needsUpdate = true; }
  }
  return out;
}
