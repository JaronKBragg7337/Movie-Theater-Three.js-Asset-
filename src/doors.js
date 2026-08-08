import * as THREE from 'three';
import { merge, roundedBox, boltGeom, xf, planarUV, clean } from './geom.js';
import { box3 } from './builder.js';
import { register } from './registry.js';

/* ------------------------------------------------------------------ *
 *  INTERACTIVE DOORS
 *
 *  Each leaf is its own Object3D pivoted on its hinge stile, so it can
 *  swing without touching the merged architecture. Collision follows the
 *  leaf: a fully open door stops blocking the opening.
 *  Everything lives in one scene — walking in never loads anything.
 * ------------------------------------------------------------------ */

const OPEN_ANGLE = THREE.MathUtils.degToRad(96);

/**
 * @param style 'glass'  — storefront entrance leaf, full-height glazing
 *              'timber' — auditorium leaf, solid with a vision slot
 */
function buildLeaf(style, W, H, M) {
  const g = new THREE.Group();
  const bins = { metal: [], glass: [], shell: [], wood: [], brass: [] };
  const push = (k, geom) => bins[k].push(planarUV(clean(geom), 1));

  if (style === 'glass') {
    const frameT = 0.055, rail = 0.11;
    // Stile-and-rail aluminium frame around a single glazed light
    push('metal', xf(new THREE.BoxGeometry(rail, H, frameT), { pos: [-W / 2 + rail / 2, H / 2, 0] }));
    push('metal', xf(new THREE.BoxGeometry(rail, H, frameT), { pos: [W / 2 - rail / 2, H / 2, 0] }));
    push('metal', xf(new THREE.BoxGeometry(W, 0.14, frameT), { pos: [0, 0.07, 0] }));
    push('metal', xf(new THREE.BoxGeometry(W, 0.26, frameT), { pos: [0, H - 0.13, 0] }));
    push('metal', xf(new THREE.BoxGeometry(W, 0.09, frameT), { pos: [0, 1.02, 0] }));
    push('glass', xf(new THREE.BoxGeometry(W - rail * 2, H - 0.52, 0.014), { pos: [0, H / 2 + 0.06, 0] }));

    // Full-height stainless pull handle on two standoffs
    const hx = W / 2 - 0.16;
    push('brass', xf(new THREE.CylinderGeometry(0.019, 0.019, 1.30, 12), { pos: [hx, 1.20, -0.10] }));
    for (const hy of [0.60, 1.80]) {
      push('brass', xf(xf(new THREE.CylinderGeometry(0.015, 0.015, 0.10, 10), { rot: [Math.PI / 2, 0, 0] }), { pos: [hx, hy, -0.05] }));
      push('brass', xf(new THREE.SphereGeometry(0.021, 12, 8), { pos: [hx, hy, -0.10] }));
    }
    // Hinge butts on the pivot stile
    for (const hy of [0.25, H / 2, H - 0.25]) {
      push('metal', xf(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 10), { pos: [-W / 2 + 0.02, hy, 0] }));
    }
    // Manufacturer plate + accessibility decal band
    push('metal', xf(new THREE.BoxGeometry(0.10, 0.05, 0.004), { pos: [-W / 2 + 0.06, 0.34, -0.03] }));
    push('shell', xf(new THREE.BoxGeometry(W - 0.24, 0.05, 0.004), { pos: [0, 1.42, -0.012] }));
  } else {
    const T = 0.055;
    push('wood', xf(roundedBox(W, H, T, 0.012, 0.005), { pos: [0, H / 2, 0] }));
    // Raised centre panel + stiles, so the leaf reads as joinery
    push('wood', xf(roundedBox(W - 0.20, H - 0.72, 0.018, 0.01, 0.004), { pos: [0, H / 2 - 0.10, T / 2 + 0.008] }));
    push('wood', xf(roundedBox(W - 0.20, H - 0.72, 0.018, 0.01, 0.004), { pos: [0, H / 2 - 0.10, -T / 2 - 0.008] }));
    // Vision slot
    for (const s of [1, -1]) {
      push('metal', xf(new THREE.BoxGeometry(0.24, 0.62, 0.014), { pos: [0.10, H - 0.62, s * (T / 2 + 0.012)] }));
    }
    push('glass', xf(new THREE.BoxGeometry(0.20, 0.58, T + 0.02), { pos: [0.10, H - 0.62, 0] }));
    // Kick plate, push bar, closer arm
    for (const s of [1, -1]) {
      push('brass', xf(new THREE.BoxGeometry(W - 0.10, 0.30, 0.008), { pos: [0, 0.19, s * (T / 2 + 0.006)] }));
      push('brass', xf(new THREE.BoxGeometry(W - 0.28, 0.05, 0.045), { pos: [0, 1.03, s * (T / 2 + 0.028)] }));
      for (const t of [-1, 1]) {
        push('brass', xf(xf(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), { rot: [Math.PI / 2, 0, 0] }), { pos: [t * (W / 2 - 0.20), 1.03, s * (T / 2 + 0.014)] }));
      }
    }
    push('metal', xf(new THREE.BoxGeometry(0.30, 0.05, 0.05), { pos: [-W / 2 + 0.22, H - 0.09, T / 2 + 0.05] }));
    for (const hy of [0.30, H / 2, H - 0.30]) {
      push('metal', xf(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 10), { pos: [-W / 2 + 0.015, hy, 0] }));
      const b = boltGeom(0.006, 0.003, 0.0025, 0.01);
      b.rotateX(-Math.PI / 2);
      push('metal', xf(b, { pos: [-W / 2 + 0.06, hy + 0.04, T / 2] }));
    }
  }

  for (const [k, list] of Object.entries(bins)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(merge(list), M[k]);
    m.name = `leaf_${k}`;
    g.add(m);
  }
  return g;
}

export class Door {
  /**
   * @param opts.pos    world position of the HINGE
   * @param opts.facing outward normal angle (radians) of the closed leaf
   * @param opts.swing  +1 or -1: which way the leaf opens
   */
  constructor(opts, M) {
    const { pos, facing = 0, swing = 1, width, height, style = 'glass', label = 'Door' } = opts;
    this.width = width;
    this.height = height;
    this.swing = swing;
    this.facing = facing;
    this.angle = 0;
    this.target = 0;
    this.label = label;

    this.pivot = new THREE.Group();
    this.pivot.position.copy(pos);
    this.pivot.rotation.y = facing;
    // buildLeaf centres the leaf on the origin; shift it so the hinge stile
    // sits on the pivot and the free edge (with the handle) swings out.
    const leaf = buildLeaf(style, width, height, M);
    leaf.position.x = width / 2;
    this.pivot.add(leaf);

    // Closed-state footprint, used for collision and for the interact prompt
    this.centre = pos.clone().add(
      new THREE.Vector3(Math.cos(facing) * (width / 2), 0, -Math.sin(facing) * (width / 2)),
    );
    this.collider = box3(this.centre.x, pos.y + height / 2, this.centre.z, Math.max(0.3, Math.abs(Math.cos(facing)) * width + 0.2), height, Math.max(0.3, Math.abs(Math.sin(facing)) * width + 0.2));

    this.asset = register('DOOR', {
      box: this.collider.clone(),
      pos: this.centre.clone().setY(pos.y + height / 2),
      support: pos.y,
      solid: false,
      embeds: ['WALL', 'FACADE', 'PILASTER'],
      meta: { label, style },
    });
    this.id = this.asset.id;
  }

  // A leaf swings to a negative angle, so both of these must compare
  // magnitudes — otherwise an open door reads as shut and never closes.
  get isOpen() { return Math.abs(this.angle) > 0.35; }
  toggle() { this.target = Math.abs(this.target) > 0.01 ? 0 : OPEN_ANGLE * this.swing * -1; }
  open() { this.target = OPEN_ANGLE * this.swing * -1; }
  close() { this.target = 0; }

  update(dt) {
    if (Math.abs(this.target - this.angle) < 0.001) return false;
    this.angle += (this.target - this.angle) * Math.min(1, dt * 6.5);
    this.pivot.rotation.y = this.facing + this.angle;
    return true;
  }
}

/**
 * Owns every door in the building: animation, collision toggling, and
 * "which door am I standing at" queries for the interact prompt.
 */
export class DoorSet {
  constructor(parent, M) {
    this.doors = [];
    this.group = new THREE.Group();
    this.group.name = 'DOORS';
    parent.add(this.group);
    this.M = M;
  }

  add(opts) {
    const d = new Door(opts, this.M);
    this.group.add(d.pivot);
    this.doors.push(d);
    return d;
  }

  /** Colliders for every leaf that is currently shut. */
  colliders() {
    return this.doors.filter((d) => !this.isOpenEnough(d)).map((d) => d.collider);
  }

  isOpenEnough(d) { return Math.abs(d.angle) > 0.5; }

  /** Nearest door within reach, for the on-screen prompt. */
  nearest(point, maxDist = 2.4) {
    let best = null, bd = maxDist * maxDist;
    for (const d of this.doors) {
      const dd = d.centre.distanceToSquared(point);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  /** Open or close every leaf of the pair the given door belongs to. */
  toggleGroup(door) {
    const wantOpen = !door.isOpen;
    for (const d of this.doors) {
      if (d.pivot.position.distanceTo(door.pivot.position) < door.width * 2.6 + 0.4) {
        wantOpen ? d.open() : d.close();
      }
    }
  }

  update(dt) {
    let changed = false;
    for (const d of this.doors) changed = d.update(dt) || changed;
    return changed;
  }
}
