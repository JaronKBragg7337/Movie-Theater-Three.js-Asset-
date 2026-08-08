import * as THREE from 'three';
import { L } from './layout.js';
import { Builder, box3, pierWall } from './builder.js';
import { roundedBox, roundedRectShape, profileSolid, boltGeom, knurledRing, xf } from './geom.js';
import { register } from './registry.js';
import { makeMenuBoard, makeSignFace, makeScreenSign, makePoster } from './textures.js';

/* ------------------------------------------------------------------ *
 *  THE BUILDING — lobby, façade, canopy, forecourt.
 *
 *  The auditorium floor rakes below street level, so grade (pavement,
 *  lobby floor, everything outside) sits at L.gradeY. Walking from the
 *  forecourt to seat H12 crosses no scene boundary and loads nothing.
 * ------------------------------------------------------------------ */

export function buildBuilding(root, M, doorSet) {
  const B = new Builder();
  const colliders = [];
  const emissives = [];
  const G = L.gradeY;
  const add = (b) => { colliders.push(b); return b; };

  /* ============================================================ *
   *  1. LOBBY FLOOR, CEILING, WALLS
   * ============================================================ */
  const lz0 = L.lobbyZ0, lz1 = L.lobbyZ1, lhw = L.lobbyHalfW;
  const lobbyDepth = lz1 - lz0, lobbyCz = (lz0 + lz1) / 2;

  B.add('terrazzo', xf(new THREE.BoxGeometry(lhw * 2, 0.30, lobbyDepth), { pos: [0, G - 0.15, lobbyCz] }));
  register('FLOOR', { box: box3(0, G - 0.15, lobbyCz, lhw * 2, 0.3, lobbyDepth), support: G - 0.30, level: 14, solid: false });

  // Carpet runners leading to each house door — a real cinema wayfinding cue
  for (const dx of L.audDoors) {
    B.add('carpet', xf(new THREE.BoxGeometry(3.4, 0.012, 9.0), { pos: [dx, G + 0.006, lz0 + 4.6] }));
    B.add('brass', xf(new THREE.BoxGeometry(0.05, 0.016, 9.0), { pos: [dx - 1.72, G + 0.008, lz0 + 4.6] }));
    B.add('brass', xf(new THREE.BoxGeometry(0.05, 0.016, 9.0), { pos: [dx + 1.72, G + 0.008, lz0 + 4.6] }));
  }

  // Side walls
  for (const sx of [-1, 1]) {
    B.add('acm', xf(new THREE.BoxGeometry(0.5, L.lobbyCeil, lobbyDepth), { pos: [sx * (lhw + 0.25), G + L.lobbyCeil / 2, lobbyCz] }));
    add(box3(sx * (lhw + 0.3), G + L.lobbyCeil / 2, lobbyCz, 0.6, L.lobbyCeil, lobbyDepth));
    register('WALL', { box: box3(sx * (lhw + 0.25), G + L.lobbyCeil / 2, lobbyCz, 0.5, L.lobbyCeil, lobbyDepth), support: G, level: 14 });
    // Skirting and a wood dado band
    B.add('wood', xf(new THREE.BoxGeometry(0.10, 0.16, lobbyDepth), { pos: [sx * (lhw - 0.05), G + 0.08, lobbyCz] }));
    B.add('wood', xf(new THREE.BoxGeometry(0.08, 0.9, lobbyDepth), { pos: [sx * (lhw - 0.04), G + 1.35, lobbyCz] }));
  }

  // Ceiling: linear timber battens between two lit coves
  B.add('plaster', xf(new THREE.BoxGeometry(lhw * 2, 0.4, lobbyDepth), { pos: [0, G + L.lobbyCeil + 0.2, lobbyCz] }));
  const battens = Math.floor(lobbyDepth / 0.42);
  for (let i = 0; i < battens; i++) {
    const z = lz0 + 0.3 + i * 0.42;
    B.add('wood', xf(new THREE.BoxGeometry(lhw * 2 - 3.2, 0.14, 0.13), { pos: [0, G + L.lobbyCeil - 0.09, z] }));
  }
  for (const sx of [-1, 1]) {
    B.add('plaster', xf(new THREE.BoxGeometry(1.5, 0.55, lobbyDepth), { pos: [sx * (lhw - 0.75), G + L.lobbyCeil - 0.27, lobbyCz] }));
    B.add('coveglow', xf(new THREE.BoxGeometry(0.7, 0.05, lobbyDepth - 1.2), { pos: [sx * (lhw - 1.35), G + L.lobbyCeil - 0.56, lobbyCz] }));
    emissives.push({ type: 'lobbycove', pos: new THREE.Vector3(sx * (lhw - 3.0), G + L.lobbyCeil - 1.2, lobbyCz) });
  }
  // Recessed downlights on a 3 m grid
  for (let i = 0; i < 6; i++) {
    for (const px of [-11, -5.5, 0, 5.5, 11]) {
      const pz = lz0 + 2.4 + i * 3.9;
      if (pz > lz1 - 1) continue;
      B.add('metal', xf(new THREE.CylinderGeometry(0.10, 0.12, 0.07, 14), { pos: [px, G + L.lobbyCeil - 0.20, pz] }));
      B.add('downlight', xf(new THREE.CylinderGeometry(0.078, 0.078, 0.02, 14), { pos: [px, G + L.lobbyCeil - 0.242, pz] }));
      if ((i + px) % 3 === 0) emissives.push({ type: 'lobbydown', pos: new THREE.Vector3(px, G + L.lobbyCeil - 1.4, pz) });
    }
  }

  /* ============================================================ *
   *  2. HOUSE DOOR SURROUNDS + BACKLIT SCREEN SIGNS
   * ============================================================ */
  L.audDoors.forEach((dx, i) => {
    const z = L.audWallZ + L.audWallT;
    // Portal frame standing proud of the wall
    for (const s of [-1, 1]) {
      B.add('wood', xf(new THREE.BoxGeometry(0.22, L.audDoorH + 0.5, 0.30), { pos: [dx + s * (L.audDoorW / 2 + 0.11), G + (L.audDoorH + 0.5) / 2, z + 0.15] }));
    }
    B.add('wood', xf(new THREE.BoxGeometry(L.audDoorW + 0.66, 0.26, 0.34), { pos: [dx, G + L.audDoorH + 0.37, z + 0.17] }));
    B.add('brass', xf(new THREE.BoxGeometry(L.audDoorW + 0.72, 0.06, 0.38), { pos: [dx, G + L.audDoorH + 0.53, z + 0.19] }));

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.375),
      new THREE.MeshBasicMaterial({ map: makeScreenSign(`SCREEN ${i + 1}`), toneMapped: false }),
    );
    sign.position.set(dx, G + L.audDoorH + 0.95, z + 0.02);
    sign.rotation.y = Math.PI;
    sign.name = `SCREENSIGN#${i}`;
    root.add(sign);
    B.add('metal', xf(new THREE.BoxGeometry(1.62, 0.46, 0.10), { pos: [dx, G + L.audDoorH + 0.95, z + 0.07] }));
    register('SCREENSIGN', { box: box3(dx, G + L.audDoorH + 0.95, z, 1.62, 0.46, 0.1), pos: sign.position.clone(), solid: false, level: 14 });

    // Two leaves per opening, hinged at the outer jambs
    for (const s of [-1, 1]) {
      doorSet.add({
        pos: new THREE.Vector3(dx + s * L.audDoorW / 2, G, L.audWallZ + L.audWallT / 2),
        facing: s > 0 ? Math.PI : 0,
        swing: 1,
        width: L.audDoorW / 2 - 0.02,
        height: L.audDoorH - 0.03,
        style: 'timber',
        label: `Screen ${i + 1}`,
      });
    }

    // Rope line funnelling to the door
    for (let k = 0; k < 3; k++) {
      for (const s of [-1, 1]) {
        const sx = dx + s * (1.9 + k * 0.06);
        const sz = lz0 + 1.4 + k * 2.2;
        B.add('brass', xf(new THREE.CylinderGeometry(0.028, 0.028, 0.92, 12), { pos: [sx, G + 0.46, sz] }));
        B.add('brass', xf(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 18), { pos: [sx, G + 0.025, sz] }));
        B.add('brass', xf(new THREE.SphereGeometry(0.042, 14, 10), { pos: [sx, G + 0.94, sz] }));
        if (k < 2) {
          const rope = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(sx, G + 0.86, sz),
              new THREE.Vector3(sx, G + 0.62, sz + 1.1),
              new THREE.Vector3(sx, G + 0.86, sz + 2.2),
            ]), 14, 0.021, 6, false,
          );
          B.add('curtain', rope);
        }
      }
    }
  });

  /* ============================================================ *
   *  3. CONCESSION STAND
   * ============================================================ */
  {
    // Counter faces +Z, toward the entrance: customers queue from the door
    // side, staff and the back bar sit behind it on the auditorium side.
    const cz = lz0 + 6.4;
    const cx = -8.6;
    const CW = 11.0, CD = 1.05, CH = 1.10;
    const F = 1;   // +1 => customer side is +Z
    const S = -1;  // staff / back-bar side

    // Counter: base carcass, glazed display front, stone top with a bullnose
    B.add('wood', xf(new THREE.BoxGeometry(CW, CH - 0.12, CD), { pos: [cx, G + (CH - 0.12) / 2, cz] }));
    B.add('terrazzo', xf(new THREE.BoxGeometry(CW + 0.14, 0.07, CD + 0.16), { pos: [cx, G + CH - 0.035, cz] }));
    B.add('brass', xf(xf(new THREE.CylinderGeometry(0.035, 0.035, CW + 0.14, 10), { rot: [0, 0, Math.PI / 2] }), { pos: [cx, G + CH - 0.05, cz + F * (CD / 2 + 0.08)] }));
    B.add('brass', xf(new THREE.BoxGeometry(CW, 0.12, 0.04), { pos: [cx, G + 0.06, cz + F * (CD / 2 + 0.02)] }));
    add(box3(cx, G + CH / 2, cz, CW, CH, CD + 0.2));
    register('COUNTER', { box: box3(cx, G + CH / 2, cz, CW, CH, CD + 0.2), support: G, level: 14 });

    // Glazed display cabinet on the customer side
    B.add('glass', xf(new THREE.BoxGeometry(CW - 0.4, 0.62, 0.02), { pos: [cx, G + 0.62, cz + F * (CD / 2 + 0.10)] }));
    for (let i = 0; i <= 6; i++) {
      B.add('metal', xf(new THREE.BoxGeometry(0.035, 0.66, 0.05), { pos: [cx - CW / 2 + 0.2 + i * (CW - 0.4) / 6, G + 0.62, cz + F * (CD / 2 + 0.10)] }));
    }

    // Point-of-sale terminals and card readers
    for (const px of [-3.6, 0, 3.6]) {
      B.add('shell', xf(roundedBox(0.34, 0.26, 0.20, 0.02, 0.006), { pos: [cx + px, G + CH + 0.13, cz + S * 0.12] }));
      B.add('port', xf(new THREE.BoxGeometry(0.30, 0.20, 0.01), { pos: [cx + px, G + CH + 0.15, cz + F * 0.02] }));
      B.add('shell', xf(roundedBox(0.11, 0.15, 0.06, 0.012, 0.004), { pos: [cx + px + 0.42, G + CH + 0.09, cz + F * 0.36] }));
    }

    // Back bar with three backlit menu boards, facing the queue
    const bz = cz + S * 2.3;
    B.add('acm', xf(new THREE.BoxGeometry(CW + 2.0, 3.5, 0.3), { pos: [cx, G + 1.75, bz + S * 0.15] }));
    add(box3(cx, G + 1.75, bz + S * 0.2, CW + 2.0, 3.5, 0.4));
    for (let i = 0; i < 3; i++) {
      const px = cx - 3.7 + i * 3.7;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 2.4),
        new THREE.MeshBasicMaterial({ map: makeMenuBoard(i), toneMapped: false }),
      );
      board.position.set(px, G + 2.42, bz + F * 0.02);
      board.name = `MENUBOARD#${i}`;
      root.add(board);
      B.add('metal', xf(new THREE.BoxGeometry(3.36, 2.56, 0.09), { pos: [px, G + 2.42, bz + S * 0.03] }));
      emissives.push({ type: 'menu', pos: new THREE.Vector3(px, G + 2.4, bz + F * 1.1) });
      register('MENUBOARD', { box: box3(px, G + 2.42, bz, 3.36, 2.56, 0.1), pos: board.position.clone(), solid: false, level: 14 });
    }

    // Popcorn warmer: glass cabinet, heat lamp, scoop bin, corner posts
    {
      const px = cx - 4.3, py = G + CH;
      B.add('metal', xf(roundedBox(1.35, 0.14, 0.85, 0.02, 0.006), { pos: [px, py + 0.07, cz + S * 0.05] }));
      B.add('glass', xf(new THREE.BoxGeometry(1.30, 1.00, 0.80), { pos: [px, py + 0.62, cz + S * 0.05] }));
      for (const ox of [-0.64, 0.64]) for (const oz of [-0.39, 0.39]) {
        B.add('brass', xf(new THREE.BoxGeometry(0.035, 1.05, 0.035), { pos: [px + ox, py + 0.62, cz + S * 0.05 + oz] }));
      }
      B.add('brass', xf(new THREE.BoxGeometry(1.38, 0.09, 0.88), { pos: [px, py + 1.18, cz + S * 0.05] }));
      B.add('popcorn', xf(new THREE.BoxGeometry(1.14, 0.44, 0.66), { pos: [px, py + 0.34, cz + S * 0.05] }));
      B.add('led', xf(new THREE.BoxGeometry(1.10, 0.035, 0.10), { pos: [px, py + 1.10, cz + S * 0.05] }));
      emissives.push({ type: 'popcorn', pos: new THREE.Vector3(px, py + 0.6, cz + F * 0.5) });
      register('POPCORN', { box: box3(px, py + 0.62, cz + 0.05, 1.38, 1.24, 0.9), support: py, level: 14, solid: false });
    }

    // Drink fountain: eight-valve tower, drip tray, cup dispensers, ice bin
    {
      const px = cx + 3.4, py = G + CH;
      B.add('metal', xf(roundedBox(1.9, 1.15, 0.62, 0.03, 0.008), { pos: [px, py + 0.575, cz + S * 0.18] }));
      B.add('shell', xf(new THREE.BoxGeometry(1.86, 0.55, 0.05), { pos: [px, py + 0.82, cz + F * 0.14] }));
      for (let i = 0; i < 8; i++) {
        const vx = px - 0.79 + i * 0.226;
        B.add('metal', xf(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 10), { pos: [vx, py + 0.42, cz + F * 0.13] }));
        B.add('shell', xf(new THREE.BoxGeometry(0.09, 0.07, 0.05), { pos: [vx, py + 0.53, cz + F * 0.14] }));
      }
      B.add('metal', xf(new THREE.BoxGeometry(1.9, 0.03, 0.30), { pos: [px, py + 0.30, cz + F * 0.06] }));
      for (let i = 0; i < 22; i++) {
        B.add('metal', xf(new THREE.BoxGeometry(1.86, 0.012, 0.012), { pos: [px, py + 0.315, cz + F * (0.20 - i * 0.013)] }));
      }
      for (const ox of [-1.28, -1.05]) {
        B.add('metal', xf(new THREE.CylinderGeometry(0.062, 0.055, 0.85, 14, 1, true), { pos: [px + ox, py + 0.43, cz + S * 0.16] }));
      }
      register('FOUNTAIN', { box: box3(px, py + 0.6, cz, 2.0, 1.2, 0.7), support: py, level: 14, solid: false });
    }

    // Napkin / straw caddy and a condiment rail
    B.add('metal', xf(roundedBox(0.9, 0.34, 0.34, 0.02, 0.006), { pos: [cx + 5.0, G + CH + 0.17, cz - 0.1] }));
    for (let i = 0; i < 3; i++) {
      B.add('shell', xf(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 10), { pos: [cx + 4.75 + i * 0.25, G + CH + 0.30, cz - 0.1] }));
    }
  }

  /* ============================================================ *
   *  4. BOX OFFICE PODIUM
   * ============================================================ */
  {
    const px = 9.4, pz = lz1 - 6.0;
    B.add('wood', xf(roundedBox(3.6, 1.06, 1.0, 0.04, 0.01), { pos: [px, G + 0.53, pz] }));
    B.add('terrazzo', xf(new THREE.BoxGeometry(3.76, 0.07, 1.16), { pos: [px, G + 1.095, pz] }));
    B.add('brass', xf(new THREE.BoxGeometry(3.66, 0.10, 0.05), { pos: [px, G + 0.08, pz - 0.52] }));
    add(box3(px, G + 0.55, pz, 3.7, 1.1, 1.15));
    register('BOXOFFICE', { box: box3(px, G + 0.55, pz, 3.7, 1.1, 1.15), support: G, level: 14 });
    for (const ox of [-0.95, 0.95]) {
      B.add('shell', xf(roundedBox(0.40, 0.30, 0.22, 0.02, 0.006), { pos: [px + ox, G + 1.28, pz + 0.14] }));
      B.add('port', xf(new THREE.BoxGeometry(0.35, 0.24, 0.01), { pos: [px + ox, G + 1.30, pz - 0.01] }));
      B.add('metal', xf(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 12), { pos: [px + ox, G + 1.12, pz + 0.14] }));
    }
    // Overhead blade sign
    B.add('metal', xf(new THREE.BoxGeometry(0.08, 1.9, 0.08), { pos: [px - 2.1, G + 2.0, pz] }));
    B.add('acm', xf(roundedBox(2.2, 0.5, 0.10, 0.04, 0.008), { pos: [px - 1.1, G + 2.9, pz] }));
    B.add('port', xf(new THREE.BoxGeometry(2.0, 0.34, 0.02), { pos: [px - 1.1, G + 2.9, pz - 0.06] }));
  }

  /* ============================================================ *
   *  5. STANDEE POSTER CASES + LOBBY COLUMNS
   * ============================================================ */
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -lhw + 0.6 : lhw - 0.6;
    const sz = lz0 + 5.0 + (i % 2) * 7.0;
    const face = i < 2 ? 1 : -1;
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.72),
      new THREE.MeshBasicMaterial({ map: makePoster(i + 11), toneMapped: false }),
    );
    p.position.set(sx + face * 0.13, G + 1.62, sz);
    p.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    p.name = `POSTER#${100 + i}`;
    root.add(p);
    B.add('metal', xf(new THREE.BoxGeometry(0.22, 2.02, 1.42), { pos: [sx + face * 0.05, G + 1.62, sz] }));
    B.add('glass', xf(new THREE.BoxGeometry(0.03, 1.80, 1.22), { pos: [sx + face * 0.17, G + 1.62, sz] }));
    B.add('metal', xf(new THREE.BoxGeometry(0.30, 0.10, 1.50), { pos: [sx + face * 0.06, G + 0.05, sz] }));
    emissives.push({ type: 'standee', pos: new THREE.Vector3(sx + face * 1.0, G + 1.7, sz) });
    register('POSTER', { box: box3(sx, G + 1.62, sz, 0.3, 2.02, 1.42), pos: p.position.clone(), solid: false, level: 14 });
  }

  for (const cx of [-6.0, 6.0]) {
    for (const cz of [lz0 + 8.5, lz1 - 5.0]) {
      B.add('acm', xf(new THREE.CylinderGeometry(0.42, 0.42, L.lobbyCeil, 20), { pos: [cx, G + L.lobbyCeil / 2, cz] }));
      B.add('brass', xf(new THREE.CylinderGeometry(0.48, 0.52, 0.16, 20), { pos: [cx, G + 0.08, cz] }));
      B.add('brass', xf(new THREE.CylinderGeometry(0.50, 0.46, 0.14, 20), { pos: [cx, G + L.lobbyCeil - 0.07, cz] }));
      add(box3(cx, G + L.lobbyCeil / 2, cz, 0.9, L.lobbyCeil, 0.9));
      register('COLUMN', { box: box3(cx, G + L.lobbyCeil / 2, cz, 0.9, L.lobbyCeil, 0.9), support: G, level: 14 });
    }
  }

  // Waste / recycling station
  for (let i = 0; i < 2; i++) {
    const wx = -lhw + 2.0 + i * 1.1, wz = lz1 - 3.2;
    B.add('acm', xf(roundedBox(1.0, 1.05, 0.62, 0.05, 0.012), { pos: [wx, G + 0.525, wz] }));
    B.add('metal', xf(new THREE.BoxGeometry(0.52, 0.05, 0.42), { pos: [wx, G + 1.06, wz] }));
    B.add('shell', xf(new THREE.BoxGeometry(0.44, 0.06, 0.34), { pos: [wx, G + 1.02, wz] }));
    add(box3(wx, G + 0.52, wz, 1.0, 1.05, 0.62));
  }

  /* ============================================================ *
   *  6. FAÇADE — storefront glazing and the entrance doors
   * ============================================================ */
  {
    const fz = L.facadeZ;
    const glassTop = G + 8.2;
    const openings = L.entryDoorX.map((x) => [x, L.entryDoorW + 0.06, L.entryDoorH]);
    // Merge the two pairs into two openings so the mullion grid clears them
    const merged = [[-2.75, 2.55, L.entryDoorH], [2.75, 2.55, L.entryDoorH]];
    void openings;

    // Glazed curtain wall: spandrel base, glass infill, mullion grid
    for (const [cx, w, h] of merged) {
      B.add('metal', xf(new THREE.BoxGeometry(w + 0.24, 0.16, 0.34), { pos: [cx, G + h + 0.08, fz] }));
    }
    const bays = 18;
    const bayW = (lhw * 2) / bays;
    for (let i = 0; i < bays; i++) {
      const cx = -lhw + (i + 0.5) * bayW;
      const inDoor = merged.some(([dc, dw]) => Math.abs(cx - dc) < dw / 2 + bayW * 0.5);
      const sillY = inDoor ? G + L.entryDoorH + 0.16 : G;
      const h = glassTop - sillY;
      if (h > 0.2) {
        B.add('glass', xf(new THREE.BoxGeometry(bayW - 0.10, h - 0.10, 0.028), { pos: [cx, sillY + h / 2, fz] }));
      }
      if (!inDoor) {
        B.add('acm', xf(new THREE.BoxGeometry(bayW - 0.10, 0.55, 0.10), { pos: [cx, G + 3.35, fz + 0.02] }));
        add(box3(cx, G + 2.0, fz, bayW, 4.0, 0.4));
      }
    }
    // Mullions
    for (let i = 0; i <= bays; i++) {
      const cx = -lhw + i * bayW;
      B.add('metal', xf(new THREE.BoxGeometry(0.10, glassTop - G, 0.20), { pos: [cx, G + (glassTop - G) / 2, fz] }));
    }
    for (const hy of [G + 3.62, G + 6.0, glassTop]) {
      B.add('metal', xf(new THREE.BoxGeometry(lhw * 2, 0.10, 0.20), { pos: [0, hy, fz] }));
    }
    B.add('metal', xf(new THREE.BoxGeometry(lhw * 2, 0.16, 0.30), { pos: [0, G + 0.08, fz] }));

    // Door head transom and threshold
    for (const [cx, w, h] of merged) {
      B.add('metal', xf(new THREE.BoxGeometry(w + 0.2, 0.09, 0.22), { pos: [cx, G + h + 0.16, fz] }));
      B.add('brass', xf(new THREE.BoxGeometry(w + 0.2, 0.02, 0.42), { pos: [cx, G + 0.012, fz] }));
    }
    // Centre mullion between each pair
    for (const cx of [-2.75, 2.75]) {
      B.add('metal', xf(new THREE.BoxGeometry(0.09, L.entryDoorH + 0.16, 0.20), { pos: [cx, G + (L.entryDoorH + 0.16) / 2, fz] }));
    }

    // Four entrance leaves, each hinged on its outer jamb
    const pairs = [[-3.30, -2.20], [2.20, 3.30]];
    for (const [a, b] of pairs) {
      doorSet.add({
        pos: new THREE.Vector3(a - L.entryDoorW / 2, G, fz), facing: 0, swing: 1,
        width: L.entryDoorW, height: L.entryDoorH, style: 'glass', label: 'Entrance',
      });
      doorSet.add({
        pos: new THREE.Vector3(b + L.entryDoorW / 2, G, fz), facing: Math.PI, swing: 1,
        width: L.entryDoorW, height: L.entryDoorH, style: 'glass', label: 'Entrance',
      });
    }

    // Entrance matting inside and out
    B.add('grille', xf(new THREE.BoxGeometry(8.0, 0.016, 2.2), { pos: [0, G + 0.008, fz - 1.3] }));
    B.add('grille', xf(new THREE.BoxGeometry(8.0, 0.016, 1.6), { pos: [0, G + 0.008, fz + 1.0] }));
  }

  /* ============================================================ *
   *  7. BUILDING MASS + ROOF
   * ============================================================ */
  {
    const bz0 = L.bldgBackZ, bz1 = L.bldgFrontZ, bhw = L.bldgHalfW;
    const top = G + L.bldgHeight;

    // Auditorium block: clad flanks and rear, with a board-formed base
    for (const sx of [-1, 1]) {
      B.add('acm', xf(new THREE.BoxGeometry(0.6, top, L.lobbyZ0 - bz0), { pos: [sx * bhw, top / 2, (bz0 + L.lobbyZ0) / 2] }));
      B.add('concrete', xf(new THREE.BoxGeometry(0.72, 2.6, L.lobbyZ0 - bz0), { pos: [sx * bhw, G + 1.3, (bz0 + L.lobbyZ0) / 2] }));
      // Reveal joints every 1.5 m — what makes panelised cladding read as panels
      for (let i = 0; i < 22; i++) {
        const jz = bz0 + 1.0 + i * 1.75;
        if (jz > L.lobbyZ0 - 0.5) break;
        B.add('shell', xf(new THREE.BoxGeometry(0.66, top - 2.8, 0.03), { pos: [sx * bhw, G + 1.3 + (top - G - 1.3) / 2, jz] }));
      }
      // Lobby flank above the glazing
      B.add('acm', xf(new THREE.BoxGeometry(0.6, top - (G + 8.2), bz1 - L.lobbyZ0), { pos: [sx * bhw, (top + G + 8.2) / 2, (L.lobbyZ0 + bz1) / 2] }));
      B.add('acm', xf(new THREE.BoxGeometry(0.6, 8.2, bz1 - L.lobbyZ0), { pos: [sx * bhw, G + 4.1, (L.lobbyZ0 + bz1) / 2] }));
      add(box3(sx * (bhw + 0.1), top / 2, (bz0 + bz1) / 2, 0.8, top, bz1 - bz0));
      register('FACADE', { box: box3(sx * bhw, top / 2, (bz0 + bz1) / 2, 0.6, top, bz1 - bz0), support: 0, level: 14 });
    }
    // Rear elevation
    B.add('acm', xf(new THREE.BoxGeometry(bhw * 2 + 0.6, top, 0.6), { pos: [0, top / 2, bz0] }));
    B.add('concrete', xf(new THREE.BoxGeometry(bhw * 2 + 0.7, 2.6, 0.72), { pos: [0, G + 1.3, bz0] }));
    add(box3(0, top / 2, bz0 - 0.1, bhw * 2 + 1, top, 0.8));

    // Front elevation above the storefront
    B.add('acm', xf(new THREE.BoxGeometry(bhw * 2 + 0.6, top - (G + 8.2), 0.6), { pos: [0, (top + G + 8.2) / 2, bz1] }));
    for (const sx of [-1, 1]) {
      B.add('acm', xf(new THREE.BoxGeometry(bhw - lhw, 8.2, 0.6), { pos: [sx * (bhw + lhw) / 2, G + 4.1, bz1] }));
    }

    // Parapet with a metal coping
    for (const [w, h, d, cx, cz] of [
      [bhw * 2 + 0.8, 1.1, 0.5, 0, bz0 - 0.05],
      [bhw * 2 + 0.8, 1.1, 0.5, 0, bz1 + 0.05],
    ]) {
      B.add('acm', xf(new THREE.BoxGeometry(w, h, d), { pos: [cx, top + h / 2, cz] }));
      B.add('metal', xf(new THREE.BoxGeometry(w + 0.12, 0.09, d + 0.14), { pos: [cx, top + h + 0.045, cz] }));
    }
    for (const sx of [-1, 1]) {
      B.add('acm', xf(new THREE.BoxGeometry(0.5, 1.1, bz1 - bz0), { pos: [sx * (bhw + 0.05), top + 0.55, (bz0 + bz1) / 2] }));
      B.add('metal', xf(new THREE.BoxGeometry(0.64, 0.09, bz1 - bz0), { pos: [sx * (bhw + 0.05), top + 1.145, (bz0 + bz1) / 2] }));
    }
    // Roof deck
    B.add('concrete', xf(new THREE.BoxGeometry(bhw * 2, 0.35, bz1 - bz0), { pos: [0, top - 0.175, (bz0 + bz1) / 2] }));

    // Rooftop plant: three package units on curbs, ducts, a flue, a ladder cage
    for (let i = 0; i < 3; i++) {
      const rx = -8 + i * 8, rz = -14 + i * 5;
      B.add('concrete', xf(new THREE.BoxGeometry(3.4, 0.30, 2.4), { pos: [rx, top + 0.15, rz] }));
      B.add('metal', xf(roundedBox(3.2, 1.5, 2.2, 0.06, 0.015), { pos: [rx, top + 1.05, rz] }));
      B.add('grille', xf(new THREE.BoxGeometry(1.5, 1.1, 0.06), { pos: [rx - 0.7, top + 1.0, rz - 1.12] }));
      for (const fx of [-0.7, 0.7]) {
        B.add('metal', xf(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 20), { pos: [rx + fx, top + 1.88, rz] }));
        for (let b = 0; b < 5; b++) {
          const a = (b / 5) * Math.PI * 2;
          B.add('metal', xf(xf(new THREE.BoxGeometry(0.44, 0.02, 0.13), { rot: [0, a, 0.22] }), { pos: [rx + fx + Math.cos(a) * 0.2, top + 1.95, rz + Math.sin(a) * 0.2] }));
        }
      }
      B.add('metal', xf(new THREE.BoxGeometry(0.9, 0.55, 3.2), { pos: [rx, top + 0.9, rz + 2.6] }));
      register('RTU', { box: box3(rx, top + 1.05, rz, 3.4, 2.1, 2.4), support: top, level: 20, solid: false });
    }
    B.add('metal', xf(new THREE.CylinderGeometry(0.34, 0.34, 3.2, 16), { pos: [11, top + 1.6, 2] }));
    B.add('metal', xf(new THREE.CylinderGeometry(0.44, 0.36, 0.3, 16), { pos: [11, top + 3.3, 2] }));
  }

  /* ============================================================ *
   *  8. ENTRANCE CANOPY + CHANNEL-LETTER SIGN
   * ============================================================ */
  {
    const fz = L.facadeZ, cy = L.canopyY, cz1 = L.canopyZ;
    const CW = 24.0, CT = 0.55;
    const depth = cz1 - fz;

    B.add('acm', xf(new THREE.BoxGeometry(CW, CT, depth), { pos: [0, cy, fz + depth / 2] }));
    B.add('metal', xf(new THREE.BoxGeometry(CW + 0.16, 0.10, depth + 0.16), { pos: [0, cy + CT / 2 + 0.05, fz + depth / 2] }));
    // Fascia band that carries the sign
    B.add('acm', xf(new THREE.BoxGeometry(CW, 1.45, 0.28), { pos: [0, cy + CT / 2 + 0.72, cz1 - 0.14] }));
    B.add('metal', xf(new THREE.BoxGeometry(CW + 0.12, 0.09, 0.36), { pos: [0, cy + CT / 2 + 1.45, cz1 - 0.14] }));

    // Tension rods back to the façade
    for (const sx of [-1, 1]) {
      for (const ox of [3.2, 8.4]) {
        const a = new THREE.Vector3(sx * ox, cy + CT / 2, cz1 - 0.6);
        const b = new THREE.Vector3(sx * ox, cy + 3.6, fz + 0.2);
        const len = a.distanceTo(b);
        const rod = new THREE.CylinderGeometry(0.028, 0.028, len, 8);
        const m = new THREE.Object3D();
        m.position.copy(a).lerp(b, 0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        m.updateMatrix();
        rod.applyMatrix4(m.matrix);
        B.add('metal', rod);
        B.add('metal', xf(new THREE.BoxGeometry(0.14, 0.22, 0.10), { pos: [sx * ox, cy + 3.6, fz + 0.16] }));
      }
    }

    // Continuous LED slot in the canopy soffit
    for (const oz of [0.9, depth - 0.9]) {
      B.add('metal', xf(new THREE.BoxGeometry(CW - 2.0, 0.10, 0.24), { pos: [0, cy - CT / 2 - 0.05, fz + oz] }));
      B.add('led', xf(new THREE.BoxGeometry(CW - 2.2, 0.03, 0.15), { pos: [0, cy - CT / 2 - 0.10, fz + oz] }));
    }
    for (const px of [-8, -4, 0, 4, 8]) emissives.push({ type: 'canopy', pos: new THREE.Vector3(px, cy - 1.2, fz + depth / 2) });

    // Channel-letter sign face
    // Additive so the canvas black falls away and only the lit letter faces
    // read — the same way real channel letters sit on a dark fascia.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(19.2, 4.8),
      new THREE.MeshBasicMaterial({
        map: makeSignFace('GRAND PALACE', 'CINEMA'),
        toneMapped: false, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    sign.position.set(0, cy + CT / 2 + 0.74, cz1 + 0.02);
    sign.name = 'MARQUEE#0';
    root.add(sign);
    emissives.push({ type: 'marquee', pos: new THREE.Vector3(0, cy + 1.6, cz1 + 1.4) });
    register('MARQUEE', { box: box3(0, cy + 1.2, cz1, 19.2, 1.5, 0.3), pos: sign.position.clone(), solid: false, level: 14 });

    // Backlit poster cases flanking the entrance, under the canopy
    for (let i = 0; i < 4; i++) {
      const px = (i < 2 ? -1 : 1) * (5.6 + (i % 2) * 2.3);
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 1.72),
        new THREE.MeshBasicMaterial({ map: makePoster(i + 21), toneMapped: false }),
      );
      p.position.set(px, G + 2.1, fz + 0.24);
      p.name = `POSTER#${200 + i}`;
      root.add(p);
      B.add('metal', xf(new THREE.BoxGeometry(1.42, 2.02, 0.22), { pos: [px, G + 2.1, fz + 0.14] }));
      B.add('glass', xf(new THREE.BoxGeometry(1.22, 1.80, 0.03), { pos: [px, G + 2.1, fz + 0.26] }));
      emissives.push({ type: 'case', pos: new THREE.Vector3(px, G + 2.1, fz + 1.1) });
      register('POSTER', { box: box3(px, G + 2.1, fz + 0.2, 1.42, 2.02, 0.3), pos: p.position.clone(), solid: false, level: 14 });
    }
  }

  /* ============================================================ *
   *  9. FORECOURT — test environment only; delete for your own world
   * ============================================================ */
  const site = new THREE.Group();
  site.name = 'TEST_ENVIRONMENT';
  root.add(site);
  {
    const SB = new Builder();
    const fz = L.facadeZ;
    SB.add('asphalt', xf(new THREE.BoxGeometry(160, 0.4, 160), { pos: [0, G - 0.22, fz + 40] }));
    SB.add('concrete', xf(new THREE.BoxGeometry(L.bldgHalfW * 2 + 14, 0.36, 16), { pos: [0, G - 0.18, fz + 8.0] }));
    SB.add('concrete', xf(new THREE.BoxGeometry(L.bldgHalfW * 2 + 14, 0.30, 0.4), { pos: [0, G - 0.16, fz + 16.0] }));

    // Bollards guarding the entrance
    for (let i = 0; i < 8; i++) {
      const bx = -8.75 + i * 2.5;
      SB.add('metal', xf(new THREE.CylinderGeometry(0.115, 0.115, 1.0, 16), { pos: [bx, G + 0.5, fz + 4.4] }));
      SB.add('metal', xf(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [bx, G + 1.0, fz + 4.4] }));
      SB.add('led', xf(new THREE.BoxGeometry(0.10, 0.03, 0.02), { pos: [bx, G + 0.86, fz + 4.28] }));
      add(box3(bx, G + 0.5, fz + 4.4, 0.3, 1.0, 0.3));
    }
    // Benches
    for (const sx of [-1, 1]) {
      const bx = sx * 12.5, bz = fz + 6.0;
      for (let i = 0; i < 5; i++) {
        SB.add('wood', xf(new THREE.BoxGeometry(2.4, 0.05, 0.11), { pos: [bx, G + 0.45, bz - 0.24 + i * 0.12] }));
      }
      for (const ox of [-0.95, 0.95]) {
        SB.add('metal', xf(new THREE.BoxGeometry(0.07, 0.45, 0.62), { pos: [bx + ox, G + 0.225, bz] }));
      }
      add(box3(bx, G + 0.3, bz, 2.4, 0.6, 0.7));
    }
    // Pylon wayfinding sign
    SB.add('acm', xf(roundedBox(1.5, 5.2, 0.7, 0.08, 0.02), { pos: [-15.5, G + 2.6, fz + 11.0] }));
    SB.add('port', xf(new THREE.BoxGeometry(1.2, 3.4, 0.04), { pos: [-15.5, G + 3.2, fz + 10.63] }));
    SB.add('concrete', xf(new THREE.BoxGeometry(2.0, 0.3, 1.2), { pos: [-15.5, G + 0.15, fz + 11.0] }));
    add(box3(-15.5, G + 2.6, fz + 11.0, 1.5, 5.2, 0.7));
    emissives.push({ type: 'pylon', pos: new THREE.Vector3(-14.4, G + 3.2, fz + 11.0) });

    // Grazing uplights washing the façade — the thing that actually makes a
    // cinema box read as architecture after dark.
    for (let i = 0; i < 9; i++) {
      const ux = -16 + i * 4;
      SB.add('metal', xf(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 14), { pos: [ux, G + 0.08, fz + 1.5] }));
      SB.add('downlight', xf(new THREE.CylinderGeometry(0.10, 0.10, 0.02, 14), { pos: [ux, G + 0.17, fz + 1.5] }));
      emissives.push({ type: 'wash', pos: new THREE.Vector3(ux, G + 3.2, fz + 1.9) });
    }

    // Car-park light standards
    for (const px of [-22, 22]) {
      for (const pz of [fz + 20, fz + 34]) {
        SB.add('metal', xf(new THREE.CylinderGeometry(0.11, 0.15, 8.0, 12), { pos: [px, G + 4.0, pz] }));
        SB.add('metal', xf(new THREE.BoxGeometry(1.4, 0.18, 0.7), { pos: [px, G + 8.05, pz] }));
        SB.add('downlight', xf(new THREE.BoxGeometry(1.2, 0.04, 0.55), { pos: [px, G + 7.94, pz] }));
        SB.add('concrete', xf(new THREE.CylinderGeometry(0.34, 0.38, 0.5, 14), { pos: [px, G + 0.25, pz] }));
        emissives.push({ type: 'lot', pos: new THREE.Vector3(px, G + 7.4, pz) });
      }
    }
    SB.flush(site, M, 'site');
  }

  const meshes = B.flush(root, M, 'building');
  return { colliders, emissives, meshes, site };
}
