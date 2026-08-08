import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  WORLD GRID + PERMANENT ASSET REGISTRY
 *
 *  The whole world is authored on a 1 m grid so any point in the
 *  auditorium has a speakable address:
 *
 *      L{level}-H{col}-R{row}
 *
 *    level : floor tier the point stands on (0 = orchestra flat,
 *            1..N = seating risers, -1 = pit/stage front)
 *    col   : grid column along +X, measured from the west wall
 *    row   : grid row along +Z, measured from the screen wall
 *
 *  Every asset gets an ID that never changes across reloads because it
 *  is derived from a deterministic build order, not from creation time.
 *  Say "SEAT#47 is floating" or "teleport L0-H14-R8" and both a human
 *  and an agent land in exactly the same place.
 * ------------------------------------------------------------------ */

export const GRID = {
  cell: 1.0,
  originX: -16, // world X of column 0
  originZ: -26, // world Z of row 0 (screen wall)
};

export function worldToGrid(v, level = 0) {
  return {
    level,
    col: Math.floor((v.x - GRID.originX) / GRID.cell),
    row: Math.floor((v.z - GRID.originZ) / GRID.cell),
  };
}

export function gridToWorld(col, row, y = 0) {
  return new THREE.Vector3(
    GRID.originX + (col + 0.5) * GRID.cell,
    y,
    GRID.originZ + (row + 0.5) * GRID.cell,
  );
}

export function gridLabel(g) {
  return `L${g.level}-H${g.col}-R${g.row}`;
}

export function parseGridLabel(str) {
  const m = /^L(-?\d+)[-\s]*H(-?\d+)[-\s]*R(-?\d+)$/i.exec(String(str).trim().replace(/\s+/g, ''));
  if (!m) return null;
  return { level: +m[1], col: +m[2], row: +m[3] };
}

let _seq = 0;
const byId = new Map();
const byType = new Map();
const validators = new Map();

/**
 * Register a logical asset.
 *
 * @param type     stable category, e.g. 'SEAT', 'WALL', 'DOOR'
 * @param opts.box world-space THREE.Box3 collision volume
 * @param opts.pos world-space anchor point (defaults to box centre)
 * @param opts.level floor tier this asset belongs to
 * @param opts.object optional Object3D, or {mesh, instanceId} for instanced assets
 * @param opts.support expected floor Y this asset should rest on (enables
 *                     the floating/buried validator)
 */
export function register(type, opts = {}) {
  const list = byType.get(type) || [];
  const index = list.length;
  const id = `${type}#${index}`;
  const box = opts.box || new THREE.Box3();
  const pos = opts.pos ? opts.pos.clone() : box.getCenter(new THREE.Vector3());
  const level = opts.level ?? 0;

  const asset = {
    id,
    type,
    index,
    seq: _seq++,
    box,
    pos,
    level,
    grid: worldToGrid(pos, level),
    object: opts.object || null,
    instanceId: opts.instanceId ?? null,
    support: opts.support ?? null,
    solid: opts.solid !== false,
    // Types this asset is *designed* to intersect — a pilaster applied to a
    // wall, a door leaf set into its reveal. Without this the overlap check
    // drowns in correct-by-construction hits and stops being useful.
    embeds: opts.embeds || [],
    meta: opts.meta || {},
  };
  asset.gridLabel = gridLabel(asset.grid);

  byId.set(id, asset);
  list.push(asset);
  byType.set(type, list);
  return asset;
}

export const registry = {
  get: (id) => byId.get(id),
  all: () => [...byId.values()],
  ofType: (type) => byType.get(type) || [],
  types: () => [...byType.keys()],
  count: () => byId.size,
  /** Assets whose grid address matches, ignoring level if omitted. */
  atGrid(col, row, level = null) {
    return this.all().filter(
      (a) => a.grid.col === col && a.grid.row === row && (level === null || a.grid.level === level),
    );
  },
  nearest(point, maxDist = 3) {
    let best = null, bd = maxDist * maxDist;
    for (const a of byId.values()) {
      const d = a.pos.distanceToSquared(point);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  },
};

/** Add a deterministic validation pass to the inspection report. */
export function registerValidator(name, validator) {
  validators.set(name, validator);
  return () => validators.delete(name);
}

/* ------------------------------------------------------------------ *
 *  VALIDATION — floating / buried / overlap reporting
 * ------------------------------------------------------------------ */

const TOL = 0.02; // 2 cm build tolerance

export function validate() {
  const issues = [];
  const all = registry.all();

  for (const a of all) {
    if (a.support === null) continue;
    const gap = a.box.min.y - a.support;
    if (gap > TOL) {
      issues.push({
        id: a.id, kind: 'FLOATING', grid: a.gridLabel,
        detail: `base is ${(gap * 100).toFixed(1)} cm above its support plane (y=${a.support.toFixed(3)})`,
        pos: a.pos.clone(),
      });
    } else if (gap < -TOL) {
      issues.push({
        id: a.id, kind: 'BURIED', grid: a.gridLabel,
        detail: `base is ${(-gap * 100).toFixed(1)} cm below its support plane (y=${a.support.toFixed(3)})`,
        pos: a.pos.clone(),
      });
    }
  }

  // Overlap check between solid assets of differing types — catches a door
  // pushed into a wall, or a seat clipping a riser.
  const solids = all.filter((a) => a.solid && !a.box.isEmpty());
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i], B = solids[j];
      if (A.type === B.type) continue;
      if (A.embeds.includes(B.type) || B.embeds.includes(A.type)) continue;
      if (!A.box.intersectsBox(B.box)) continue;
      const inter = A.box.clone().intersect(B.box);
      const s = inter.getSize(new THREE.Vector3());
      const vol = s.x * s.y * s.z;
      if (vol > 0.004) {
        issues.push({
          id: A.id, kind: 'OVERLAP', grid: A.gridLabel,
          detail: `intersects ${B.id} by ${(vol * 1000).toFixed(0)} L (${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)} m)`,
          pos: inter.getCenter(new THREE.Vector3()),
        });
      }
    }
  }

  for (const [name, validator] of validators) {
    try {
      const extra = validator() || [];
      issues.push(...extra);
    } catch (error) {
      issues.push({
        id: 'VALIDATOR', kind: 'VALIDATION_ERROR', grid: 'L0-H0-R0',
        detail: `${name}: ${error instanceof Error ? error.message : String(error)}`,
        pos: new THREE.Vector3(),
      });
    }
  }

  return issues;
}

/** Human-readable dump, also written to console when the inspector opens. */
export function report() {
  const issues = validate();
  const counts = {};
  for (const t of registry.types()) counts[t] = registry.ofType(t).length;
  return { total: registry.count(), counts, issues };
}
