import * as THREE from 'three';
import { merge, roundedBox, roundedRectShape, profileSolid, pipingLoop, boltGeom, knurledRing, xf, planarUV, clean } from './geom.js';

/* ------------------------------------------------------------------ *
 *  CINEMA SEAT — real-world dimensioned, mechanically assembled.
 *
 *  Local space: origin sits on the floor at the seat's centre line.
 *  +X right, +Y up, occupant faces -Z (screen is at -Z).
 *
 *  Verified proportions (metres):
 *    row pitch (seat width)      0.620
 *    seat pan top from floor     0.440
 *    armrest top from floor      0.640
 *    backrest crown from floor   1.120
 *    seat pan depth              0.520
 *    cast standard thickness     0.048
 * ------------------------------------------------------------------ */

export const SEAT = {
  pitch: 0.62,
  panTop: 0.44,
  armTop: 0.64,
  backTop: 1.12,
  panDepth: 0.52,
  standardT: 0.048,
  hinge: new THREE.Vector3(0, 0.415, 0.205),
  backLean: THREE.MathUtils.degToRad(14),
  eyeSeated: 1.18,
};

const UVS = 1.0; // 1 UV unit per metre — the global texel-density contract

/* ---------------- cast-iron end standard ---------------- */
function standardProfile() {
  // Side elevation of a cast pedestal: wide splayed foot, waisted column,
  // forward-kicked arm shelf. Drawn in the ZY plane, extruded along X.
  const s = new THREE.Shape();
  s.moveTo(-0.20, 0.0);
  s.lineTo(0.24, 0.0);
  s.lineTo(0.24, 0.055);
  s.quadraticCurveTo(0.13, 0.075, 0.115, 0.20);
  s.lineTo(0.115, 0.30);
  s.quadraticCurveTo(0.13, 0.40, 0.175, 0.44);
  s.lineTo(0.175, 0.60);
  s.quadraticCurveTo(0.17, 0.645, 0.115, 0.655);
  s.lineTo(-0.24, 0.655);
  s.quadraticCurveTo(-0.30, 0.648, -0.30, 0.60);
  s.lineTo(-0.30, 0.555);
  s.quadraticCurveTo(-0.235, 0.53, -0.16, 0.47);
  s.lineTo(-0.10, 0.40);
  s.quadraticCurveTo(-0.055, 0.30, -0.075, 0.175);
  s.quadraticCurveTo(-0.10, 0.06, -0.20, 0.055);
  s.closePath();

  // Cast lightening window — the hole that makes it read as a casting,
  // not a solid slab. Massive silhouette win from the aisle.
  const hole = new THREE.Path();
  const hw = 0.085, hh = 0.16, hr = 0.035;
  const cx = 0.01, cy = 0.30;
  hole.moveTo(cx - hw + hr, cy - hh);
  hole.lineTo(cx + hw - hr, cy - hh);
  hole.quadraticCurveTo(cx + hw, cy - hh, cx + hw, cy - hh + hr);
  hole.lineTo(cx + hw, cy + hh - hr);
  hole.quadraticCurveTo(cx + hw, cy + hh, cx + hw - hr, cy + hh);
  hole.lineTo(cx - hw + hr, cy + hh);
  hole.quadraticCurveTo(cx - hw, cy + hh, cx - hw, cy + hh - hr);
  hole.lineTo(cx - hw, cy - hh + hr);
  hole.quadraticCurveTo(cx - hw, cy - hh, cx - hw + hr, cy - hh);
  s.holes.push(hole);
  return s;
}

function buildStandard(xPos) {
  const parts = [];
  const t = SEAT.standardT;

  const body = profileSolid(standardProfile(), t, 0.005, 10);
  body.rotateY(Math.PI / 2);
  body.translate(xPos, 0.3275, -0.03);
  parts.push(body);

  // Floor mounting plate + four anchor bolts
  const plate = roundedBox(0.10, 0.016, 0.30, 0.012, 0.004);
  parts.push(xf(plate, { pos: [xPos, 0.008, -0.02] }));
  const bolt = boltGeom(0.011, 0.006, 0.005, 0.02);
  for (const dz of [-0.115, 0.115]) for (const dx of [-0.028, 0.028]) {
    const b = bolt.clone();
    b.rotateX(-Math.PI / 2);
    parts.push(xf(b, { pos: [xPos + dx, 0.017, -0.02 + dz] }));
  }

  // Structural cross-tube tying the two standards of the row together
  const tube = new THREE.CylinderGeometry(0.019, 0.019, SEAT.pitch + 0.02, 12);
  tube.rotateZ(Math.PI / 2);
  parts.push(xf(tube, { pos: [xPos + SEAT.pitch / 2, 0.155, 0.02] }));

  // Tube collar clamps — two half-shells and a pinch bolt
  const collar = new THREE.CylinderGeometry(0.028, 0.028, 0.022, 14);
  collar.rotateZ(Math.PI / 2);
  parts.push(xf(collar, { pos: [xPos + 0.032, 0.155, 0.02] }));
  const pinch = boltGeom(0.007, 0.004, 0.003, 0.014);
  pinch.rotateZ(Math.PI / 2);
  parts.push(xf(pinch, { pos: [xPos + 0.032, 0.185, 0.02] }));

  // Hinge boss: raised cylindrical pad, pivot pin, retaining washer
  const boss = new THREE.CylinderGeometry(0.034, 0.038, 0.018, 16);
  boss.rotateZ(Math.PI / 2);
  parts.push(xf(boss, { pos: [xPos + (xPos < 0 ? 0.03 : -0.03), SEAT.hinge.y, SEAT.hinge.z] }));
  const pin = new THREE.CylinderGeometry(0.011, 0.011, 0.05, 12);
  pin.rotateZ(Math.PI / 2);
  parts.push(xf(pin, { pos: [xPos + (xPos < 0 ? 0.045 : -0.045), SEAT.hinge.y, SEAT.hinge.z] }));
  const washer = new THREE.CylinderGeometry(0.017, 0.017, 0.003, 12);
  washer.rotateZ(Math.PI / 2);
  parts.push(xf(washer, { pos: [xPos + (xPos < 0 ? 0.068 : -0.068), SEAT.hinge.y, SEAT.hinge.z] }));

  // Cast maker's roundel on the outer face
  const roundel = new THREE.CylinderGeometry(0.026, 0.026, 0.004, 20);
  roundel.rotateZ(Math.PI / 2);
  parts.push(xf(roundel, { pos: [xPos + (xPos < 0 ? -0.026 : 0.026), 0.50, -0.10] }));
  const roundelRim = new THREE.TorusGeometry(0.026, 0.0035, 6, 20);
  roundelRim.rotateY(Math.PI / 2);
  parts.push(xf(roundelRim, { pos: [xPos + (xPos < 0 ? -0.028 : 0.028), 0.50, -0.10] }));

  // Armrest mounting bracket + two fasteners
  const brk = roundedBox(0.06, 0.05, 0.09, 0.008, 0.003);
  parts.push(xf(brk, { pos: [xPos, 0.60, -0.06] }));
  for (const dz of [-0.03, 0.03]) {
    const b = boltGeom(0.007, 0.004, 0.003, 0.012);
    b.rotateZ(Math.PI / 2);
    parts.push(xf(b, { pos: [xPos + (xPos < 0 ? -0.032 : 0.032), 0.605, -0.06 + dz] }));
  }

  // Backrest support post rising out of the standard
  const post = roundedBox(0.032, 0.50, 0.05, 0.012, 0.004);
  post.rotateX(-SEAT.backLean);
  parts.push(xf(post, { pos: [xPos, 0.83, 0.245] }));

  return parts;
}

/* ---------------- armrest ---------------- */
function armrestProfile() {
  const s = new THREE.Shape();
  const w = 0.088, h = 0.052, r = 0.022;
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.closePath();
  return s;
}

function buildArmrest(xPos) {
  const wood = [], metal = [], leather = [];

  const rail = new THREE.ExtrudeGeometry(armrestProfile(), {
    depth: 0.40, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 8,
  });
  rail.center();
  rail.rotateY(Math.PI / 2);
  rail.rotateY(Math.PI / 2); // profile is drawn in XY; sweep along Z
  wood.push(xf(rail, { pos: [xPos, SEAT.armTop - 0.026, -0.05] }));

  // Leather elbow pad let into the top face
  const pad = roundedBox(0.062, 0.008, 0.26, 0.026, 0.003);
  leather.push(xf(pad, { pos: [xPos, SEAT.armTop - 0.001, -0.06] }));

  // Steel spine under the rail + three countersunk screws
  const spine = roundedBox(0.05, 0.014, 0.36, 0.006, 0.003);
  metal.push(xf(spine, { pos: [xPos, SEAT.armTop - 0.056, -0.05] }));
  for (const dz of [-0.14, 0, 0.14]) {
    const b = boltGeom(0.006, 0.0028, 0.0025, 0.01);
    b.rotateX(Math.PI);
    metal.push(xf(b, { pos: [xPos, SEAT.armTop - 0.066, -0.05 + dz] }));
  }

  // Cupholder assembly at the front of the rail
  const cupZ = -0.185;
  const ring = knurledRing(0.041, 0.0055, 44);
  ring.rotateX(-Math.PI / 2);
  metal.push(xf(ring, { pos: [xPos, SEAT.armTop + 0.002, cupZ] }));
  const well = new THREE.CylinderGeometry(0.038, 0.033, 0.075, 20, 1, true);
  metal.push(xf(well, { pos: [xPos, SEAT.armTop - 0.037, cupZ] }));
  const wellBottom = new THREE.CylinderGeometry(0.033, 0.033, 0.004, 20);
  metal.push(xf(wellBottom, { pos: [xPos, SEAT.armTop - 0.073, cupZ] }));
  // Drain slots pressed into the base
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const slot = new THREE.BoxGeometry(0.006, 0.005, 0.022);
    slot.rotateY(a);
    metal.push(xf(slot, { pos: [xPos + Math.cos(a) * 0.018, SEAT.armTop - 0.071, cupZ + Math.sin(a) * 0.018] }));
  }
  // Cast boss where the holder is bolted through the rail
  const cupBoss = new THREE.CylinderGeometry(0.046, 0.05, 0.012, 20);
  metal.push(xf(cupBoss, { pos: [xPos, SEAT.armTop - 0.084, cupZ] }));

  return { wood, metal, leather };
}

/* ---------------- tip-up seat pan (hinged part) ---------------- */
function buildSeatPan() {
  const fabric = [], shell = [], metal = [];
  const W = 0.545, D = SEAT.panDepth;
  // Authored around the hinge so the instanced matrix can rotate it cleanly.
  const oy = -SEAT.hinge.y, oz = -SEAT.hinge.z;

  // Moulded under-tray with a returned lip
  const tray = roundedBox(W, 0.045, D, 0.05, 0.008, 8);
  shell.push(xf(tray, { pos: [0, 0.385 + oy, -0.03 + oz] }));
  const lip = pipingLoop(W - 0.03, D - 0.03, 0.05, 0.009, 88, 6);
  lip.rotateX(-Math.PI / 2);
  shell.push(xf(lip, { pos: [0, 0.408 + oy, -0.03 + oz] }));

  // Foam cushion — crowned, with a sit-dish scooped out of the top
  const cushion = roundedBox(W - 0.012, 0.075, D - 0.02, 0.055, 0.014, 8);
  const pos = cushion.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0.01) {
      const r = Math.hypot(x / (W * 0.42), z / (D * 0.42));
      pos.setY(i, y - Math.max(0, 1 - r * r) * 0.016);
    }
  }
  cushion.computeVertexNormals();
  fabric.push(xf(cushion, { pos: [0, 0.435 + oy, -0.03 + oz] }));

  // Welt piping around the cushion perimeter — the seam that says "upholstered"
  const welt = pipingLoop(W - 0.018, D - 0.026, 0.055, 0.0075, 96, 6);
  welt.rotateX(-Math.PI / 2);
  fabric.push(xf(welt, { pos: [0, 0.418 + oy, -0.03 + oz] }));

  // Two transverse tuck seams
  for (const z of [-0.10, 0.06]) {
    const seam = new THREE.CylinderGeometry(0.005, 0.005, W - 0.09, 6);
    seam.rotateZ(Math.PI / 2);
    fabric.push(xf(seam, { pos: [0, 0.468 + oy, z + oz] }));
  }

  // Hinge sleeves that ride on the standards' pivot pins
  for (const sx of [-1, 1]) {
    const sleeve = new THREE.CylinderGeometry(0.017, 0.017, 0.05, 14);
    sleeve.rotateZ(Math.PI / 2);
    metal.push(xf(sleeve, { pos: [sx * 0.272, 0 + 0, 0] }));
    const armPlate = roundedBox(0.02, 0.055, 0.08, 0.008, 0.003);
    metal.push(xf(armPlate, { pos: [sx * 0.262, -0.008, -0.045] }));
  }

  // Gravity-return counterweight bar slung under the tray
  const cw = new THREE.CylinderGeometry(0.014, 0.014, 0.30, 10);
  cw.rotateZ(Math.PI / 2);
  metal.push(xf(cw, { pos: [0, 0.352 + oy, 0.10 + oz] }));

  return { fabric, shell, metal };
}

/* ---------------- backrest ---------------- */
function buildBackrest() {
  const fabric = [], shell = [], leather = [], metal = [];
  const W = 0.545;
  const cz = 0.29, cy = 0.79;
  const lean = SEAT.backLean;

  // Rear shell: recessed centre panel + moulded vent louvres
  const back = roundedBox(W, 0.62, 0.055, 0.07, 0.01, 8);
  back.rotateX(-lean);
  shell.push(xf(back, { pos: [0, cy, cz + 0.03] }));

  const recess = roundedBox(W - 0.10, 0.42, 0.02, 0.05, 0.006, 8);
  recess.rotateX(-lean);
  shell.push(xf(recess, { pos: [0, cy - 0.02, cz + 0.058] }));

  for (let i = 0; i < 5; i++) {
    const louvre = roundedBox(W - 0.20, 0.012, 0.014, 0.005, 0.002, 4);
    louvre.rotateX(-lean);
    shell.push(xf(louvre, { pos: [0, cy + 0.10 - i * 0.032, cz + 0.068 + Math.sin(lean) * 0] }));
  }

  // Front cushion with side bolsters
  const face = roundedBox(W - 0.03, 0.60, 0.10, 0.06, 0.016, 8);
  const fp = face.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
    if (z < -0.01) {
      // lumbar scoop, deepest low-centre
      const lum = Math.max(0, 1 - Math.hypot(x / 0.19, (y + 0.16) / 0.24) ** 2);
      fp.setZ(i, z + lum * 0.022);
    }
  }
  face.computeVertexNormals();
  face.rotateX(-lean);
  fabric.push(xf(face, { pos: [0, cy, cz - 0.045] }));

  // Vertical bolsters flanking the occupant
  for (const sx of [-1, 1]) {
    const bol = roundedBox(0.075, 0.52, 0.115, 0.036, 0.012, 8);
    bol.rotateX(-lean);
    bol.rotateZ(sx * 0.05);
    fabric.push(xf(bol, { pos: [sx * 0.222, cy - 0.02, cz - 0.06] }));
  }

  // Perimeter welt + two horizontal channel seams
  const welt = pipingLoop(W - 0.036, 0.585, 0.06, 0.0075, 96, 6);
  welt.rotateX(-lean);
  fabric.push(xf(welt, { pos: [0, cy, cz - 0.098] }));
  for (const dy of [-0.14, 0.10]) {
    const seam = new THREE.CylinderGeometry(0.005, 0.005, W - 0.14, 6);
    seam.rotateZ(Math.PI / 2);
    seam.rotateX(-lean);
    fabric.push(xf(seam, { pos: [0, cy + dy, cz - 0.096 - dy * Math.sin(lean) ] }));
  }

  // Leather headrest crown with twin stitch lines
  const crown = roundedBox(W - 0.07, 0.14, 0.13, 0.055, 0.014, 8);
  crown.rotateX(-lean);
  leather.push(xf(crown, { pos: [0, SEAT.backTop - 0.075, cz - 0.045 ] }));
  for (const dy of [-0.03, 0.03]) {
    const st = new THREE.CylinderGeometry(0.0035, 0.0035, W - 0.14, 5);
    st.rotateZ(Math.PI / 2);
    leather.push(xf(st, { pos: [0, SEAT.backTop - 0.075 + dy, cz - 0.108] }));
  }

  // Crown-to-frame connector ferrules
  for (const sx of [-1, 1]) {
    const fer = new THREE.CylinderGeometry(0.013, 0.013, 0.05, 10);
    fer.rotateX(-lean);
    metal.push(xf(fer, { pos: [sx * 0.14, SEAT.backTop - 0.155, cz + 0.005] }));
  }

  // Rear coat hook — small, but it's the kind of thing real seats have
  const hook = new THREE.TorusGeometry(0.017, 0.004, 6, 14, Math.PI * 1.3);
  hook.rotateX(-lean + Math.PI);
  metal.push(xf(hook, { pos: [0, cy - 0.24, cz + 0.075] }));

  return { fabric, shell, leather, metal };
}

/* ---------------- assembly ---------------- */
/**
 * Returns geometry grouped by material, plus the one hinged group.
 * Each group becomes a single InstancedMesh so 400 seats cost ~8 draw calls.
 */
export function buildSeatParts() {
  const half = SEAT.pitch / 2;
  const metal = [], wood = [], leather = [], fabric = [], shell = [];

  metal.push(...buildStandard(-half));

  const arm = buildArmrest(-half);
  wood.push(...arm.wood); metal.push(...arm.metal); leather.push(...arm.leather);
  const armR = buildArmrest(half);
  wood.push(...armR.wood); metal.push(...armR.metal); leather.push(...armR.leather);

  const back = buildBackrest();
  fabric.push(...back.fabric); shell.push(...back.shell);
  leather.push(...back.leather); metal.push(...back.metal);

  const pan = buildSeatPan();

  const scaleUV = (list) => list.map((g) => planarUV(clean(g), UVS));

  return {
    static: {
      metal: merge(scaleUV(metal)),
      wood: merge(scaleUV(wood)),
      leather: merge(scaleUV(leather)),
      fabric: merge(scaleUV(fabric)),
      shell: merge(scaleUV(shell)),
    },
    hinged: {
      fabric: merge(scaleUV(pan.fabric)),
      shell: merge(scaleUV(pan.shell)),
      metal: merge(scaleUV(pan.metal)),
    },
    hinge: SEAT.hinge.clone(),
  };
}

/** Row-end cap standard, mirrored, so the last seat in a row is supported. */
export function buildEndStandard() {
  const parts = buildStandard(SEAT.pitch / 2).map((g) => planarUV(clean(g), UVS));
  return merge(parts);
}

/** 8x8 atlas of seat numbers, sampled per-instance via a UV offset attribute. */
export function makeNumberAtlas() {
  const S = 1024, cell = S / 8;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * cell, y = Math.floor(i / 8) * cell;
    const g = ctx.createLinearGradient(x, y, x, y + cell);
    g.addColorStop(0, '#8a692a'); g.addColorStop(0.4, '#d6b05c'); g.addColorStop(1, '#6c5020');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = 'rgba(50,36,10,0.75)';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 7, y + 7, cell - 14, cell - 14);
    ctx.fillStyle = '#2a1d07';
    ctx.font = 'bold 62px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x + cell / 2, y + cell / 2 + 3);
    ctx.fillStyle = 'rgba(255,236,182,0.4)';
    ctx.fillText(String(i + 1), x + cell / 2 - 1.5, y + cell / 2 + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Small brass number tag geometry, UV-mapped into one atlas cell. */
export function buildNumberTag() {
  const g = new THREE.PlaneGeometry(0.055, 0.055);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);
  g.rotateX(-SEAT.backLean);
  g.translate(-0.19, 1.0, 0.335);
  return g;
}
