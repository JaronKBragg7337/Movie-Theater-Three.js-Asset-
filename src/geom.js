import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Shared geometry construction helpers.
 * Everything is authored in metres so proportions stay checkable. */

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Box with filleted vertical corners AND a bevelled edge on the caps. */
export function roundedBox(w, h, d, r = 0.02, bevel = 0.006, curveSegments = 5) {
  bevel = Math.min(bevel, d / 2 - 1e-4, w / 2 - 1e-4, h / 2 - 1e-4);
  const shape = roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  g.center();
  return g;
}

/** Extrude an arbitrary 2D profile with a soft machined edge. */
export function profileSolid(shape, depth, bevel = 0.004, curveSegments = 8) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  g.center();
  return g;
}

/** Piped seam: a tube swept round a rounded rectangle in the XY plane. */
export function pipingLoop(w, h, r, tubeR = 0.008, segs = 96, radial = 6) {
  const shape = roundedRectShape(w, h, r);
  const pts = shape.getPoints(segs).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.4);
  return new THREE.TubeGeometry(curve, segs, tubeR, radial, true);
}

/** Hex-head bolt with washer — the tertiary detail that reads "assembled". */
export function boltGeom(headR = 0.008, headH = 0.005, shankR = 0.004, shankH = 0.008) {
  const head = new THREE.CylinderGeometry(headR, headR * 0.94, headH, 6);
  head.translate(0, headH / 2, 0);
  const washer = new THREE.CylinderGeometry(headR * 1.35, headR * 1.35, 0.0016, 12);
  washer.translate(0, -0.0008, 0);
  const shank = new THREE.CylinderGeometry(shankR, shankR, shankH, 8);
  shank.translate(0, -shankH / 2, 0);
  const g = mergeGeometries([head, washer, shank], false);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Knurled ring — cupholder rims, sconce collars. */
export function knurledRing(R = 0.042, tube = 0.006, teeth = 40) {
  const parts = [new THREE.TorusGeometry(R, tube, 6, 40)];
  const t = new THREE.BoxGeometry(0.0035, tube * 1.5, tube * 0.9);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const g = t.clone();
    g.rotateY(-a);
    g.translate(Math.cos(a) * R, Math.sin(a) * R, 0);
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

/**
 * Normalise a geometry so any two can be merged: same attribute set, and
 * uniformly non-indexed (three's primitives disagree — BoxGeometry is
 * indexed, ExtrudeGeometry is not, and mergeGeometries rejects a mix).
 */
export function clean(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.index) g = g.toNonIndexed();
  const keep = ['position', 'normal', 'uv'];
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) planarUV(g, 1);
  return g;
}

/**
 * Project UVs from world position onto the dominant normal axis.
 * This is what keeps texel density identical across a 4 cm bolt head and a
 * 20 m wall — every surface gets `scale` UV units per metre.
 */
export function planarUV(g, scale = 1) {
  const pos = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; }
    else if (ay >= az) { u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function merge(list) {
  const cleaned = list.map(clean);
  return mergeGeometries(cleaned, false);
}

export function xf(g, { pos = [0, 0, 0], rot = [0, 0, 0], scale = null } = {}) {
  if (scale) g.scale(scale[0], scale[1], scale[2]);
  if (rot[0]) g.rotateX(rot[0]);
  if (rot[1]) g.rotateY(rot[1]);
  if (rot[2]) g.rotateZ(rot[2]);
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}
