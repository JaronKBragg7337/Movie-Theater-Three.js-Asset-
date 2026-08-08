import * as THREE from 'three';
import { merge, planarUV, clean } from './geom.js';

/**
 * Collects geometry per material key and flushes each bin to one merged
 * mesh, so a whole room costs a handful of draw calls instead of thousands.
 * UVs are projected in metres (see geom.planarUV) to hold texel density.
 */
export class Builder {
  constructor() { this.bins = new Map(); }

  add(matKey, geom) {
    if (!this.bins.has(matKey)) this.bins.set(matKey, []);
    this.bins.get(matKey).push(planarUV(clean(geom), 1));
    return geom;
  }

  flush(parent, materials, namePrefix) {
    const out = {};
    for (const [key, list] of this.bins) {
      if (!list.length) continue;
      const mat = materials[key];
      if (!mat) { console.warn(`[builder] no material "${key}"`); continue; }
      const m = new THREE.Mesh(merge(list), mat);
      m.name = `${namePrefix}_${key}`;
      m.matrixAutoUpdate = false;
      parent.add(m);
      out[key] = m;
    }
    this.bins.clear();
    return out;
  }
}

export const box3 = (cx, cy, cz, sx, sy, sz) =>
  new THREE.Box3(
    new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
  );

/**
 * Build a wall pierced by rectangular openings, as piers plus headers.
 * `openings` are [centre, width, height] triples along the wall axis.
 * Returns the collider boxes so callers can register them.
 */
export function pierWall(B, matKey, {
  axis = 'x', from, to, thickness, height, baseY = 0, offset, openings = [],
}) {
  const boxes = [];
  const sorted = openings
    .map(([c, w, h]) => [c - w / 2, c + w / 2, h])
    .sort((a, b) => a[0] - b[0]);

  const place = (a, b, y0, y1) => {
    const w = b - a, h = y1 - y0;
    if (w <= 0.01 || h <= 0.01) return;
    const c = (a + b) / 2, cy = (y0 + y1) / 2;
    const g = axis === 'x'
      ? new THREE.BoxGeometry(w, h, thickness)
      : new THREE.BoxGeometry(thickness, h, w);
    const pos = axis === 'x' ? [c, cy, offset] : [offset, cy, c];
    g.translate(pos[0], pos[1], pos[2]);
    B.add(matKey, g);
    boxes.push(axis === 'x'
      ? box3(c, cy, offset, w, h, thickness)
      : box3(offset, cy, c, thickness, h, w));
  };

  let cursor = from;
  for (const [a, b, h] of sorted) {
    place(cursor, a, baseY, baseY + height);
    place(a, b, baseY + h, baseY + height);   // header over the opening
    cursor = b;
  }
  place(cursor, to, baseY, baseY + height);
  return boxes;
}
