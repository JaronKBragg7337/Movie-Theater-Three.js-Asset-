import * as THREE from 'three';
import { L, rowY, rowZ, rowLevel, seatX, aisleX, floorHeightAt, ROW_LETTERS } from './layout.js';
import { roundedBox, boltGeom, xf } from './geom.js';
import { register } from './registry.js';
import { Builder, box3 } from './builder.js';
import { makeRowPlate, makeExitSign, makePoster } from './textures.js';
import { createWalkableSurface } from './walkable.js';

export function buildTheater(scene, M) {
  const B = new Builder();
  const colliders = [];
  const emissives = [];
  const walkables = [];

  const addCollider = (b) => { colliders.push(b); return b; };

  /* ============================================================ *
   *  1. FLOOR DECK — orchestra flat + stepped risers
   * ============================================================ */
  const deckX = L.halfWidth * 2;
  const frontZ = rowZ(0) - L.rowPitch / 2;

  // Flat apron floor between stage and first riser
  {
    const g = xf(
      new THREE.BoxGeometry(deckX, 0.30, frontZ - (L.screenZ + L.stageDepth)),
      { pos: [0, -0.15, (frontZ + L.screenZ + L.stageDepth) / 2] },
    );
    B.add('carpet', g);
    const asset = register('FLOOR', {
      box: box3(0, -0.15, (frontZ + L.screenZ + L.stageDepth) / 2, deckX, 0.3, frontZ - (L.screenZ + L.stageDepth)),
      support: -0.30, level: 0, solid: false,
    });
    walkables.push(createWalkableSurface(g, asset));
  }

  // One riser platform per row, with a concrete face and a brass nosing
  for (let r = 0; r < L.rows; r++) {
    const y = rowY(r);
    const z0 = rowZ(r) - L.rowPitch / 2;
    const depth = L.rowPitch;
    const cz = z0 + depth / 2;

    const top = xf(new THREE.BoxGeometry(deckX, 0.06, depth), { pos: [0, y - 0.03, cz] });
    B.add('carpet', top);

    if (y > 0.001) {
      const faceH = L.riserStep + 0.06;
      const face = new THREE.BoxGeometry(deckX, faceH, 0.06);
      B.add('concrete', xf(face, { pos: [0, y - faceH / 2, z0 + 0.03] }));

      // Nosing strip — bull-nosed brass edge over the step lip. Only in the
      // aisles: under the seats a real riser is carpeted right over the edge.
      for (const side of [0, 1]) {
        const nose = new THREE.CylinderGeometry(0.020, 0.020, L.aisleW, 10, 1, false, 0, Math.PI);
        nose.rotateZ(Math.PI / 2);
        nose.rotateY(Math.PI / 2);
        B.add('brass', xf(nose, { pos: [aisleX(side), y - 0.008, z0 + 0.012] }));
      }

      // Structural fill under the riser
      const fill = new THREE.BoxGeometry(deckX, y, depth - 0.06);
      B.add('concrete', xf(fill, { pos: [0, y / 2 - 0.03, cz + 0.03] }));
    }

    const asset = register('RISER', {
      box: box3(0, y - 0.03, cz, deckX, 0.06, depth),
      pos: new THREE.Vector3(0, y, cz),
      support: y - 0.06,
      level: rowLevel(r),
      solid: false,
      meta: { row: ROW_LETTERS[r] },
    });
    walkables.push(createWalkableSurface(top, asset));

    // Aisle step LEDs — recessed strip washing each tread, both aisles
    if (y > 0.001) {
      for (const side of [0, 1]) {
        const ax = aisleX(side);
        const strip = new THREE.BoxGeometry(L.aisleW - 0.24, 0.016, 0.03);
        const g = xf(strip, { pos: [ax, y - 0.05, z0 + 0.075] });
        B.add('led', g);
        register('AISLELED', {
          box: box3(ax, y - 0.05, z0 + 0.075, L.aisleW - 0.24, 0.016, 0.03),
          support: y - 0.058, level: rowLevel(r), solid: false,
        });
      }
    }
  }

  // Rear cross-aisle deck behind the last row
  {
    const y = rowY(L.rows - 1);
    const backStart = rowZ(L.rows - 1) + L.rowPitch / 2;
    const d = L.rearDeckEndZ - backStart;
    const top = xf(new THREE.BoxGeometry(deckX, 0.06, d), { pos: [0, y - 0.03, backStart + d / 2] });
    B.add('carpet', top);
    B.add('concrete', xf(new THREE.BoxGeometry(deckX, y, d), { pos: [0, y / 2 - 0.03, backStart + d / 2] }));
    const asset = register('RISER', {
      box: box3(0, y - 0.03, backStart + d / 2, deckX, 0.06, d),
      pos: new THREE.Vector3(0, y, backStart + d / 2),
      support: y - 0.06,
      level: rowLevel(L.rows - 1),
      solid: false,
      meta: { row: 'CROSS-AISLE' },
    });
    walkables.push(createWalkableSurface(top, asset));
  }

  /* ============================================================ *
   *  2. AISLE HANDRAILS — tube, stanchions, ball finials
   * ============================================================ */
  for (const side of [0, 1]) {
    const ax = aisleX(side) + (side === 0 ? -L.aisleW / 2 + 0.06 : L.aisleW / 2 - 0.06);
    const zStart = rowZ(L.flatRows);
    const zEnd = rowZ(L.rows - 1) + 0.4;
    const stanchions = 8;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const z = THREE.MathUtils.lerp(zStart, zEnd, t);
      pts.push(new THREE.Vector3(ax, floorHeightAt(z) + L.railHeight, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
    B.add('brass', new THREE.TubeGeometry(curve, 60, 0.022, 10, false));

    for (let i = 0; i <= stanchions; i++) {
      const z = THREE.MathUtils.lerp(zStart, zEnd, i / stanchions);
      const fy = floorHeightAt(z);
      const h = L.railHeight;
      B.add('brass', xf(new THREE.CylinderGeometry(0.016, 0.019, h, 10), { pos: [ax, fy + h / 2, z] }));
      B.add('brass', xf(new THREE.CylinderGeometry(0.055, 0.062, 0.018, 14), { pos: [ax, fy + 0.009, z] }));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const b = boltGeom(0.006, 0.003, 0.0025, 0.01);
        b.rotateX(-Math.PI / 2);
        B.add('brass', xf(b, { pos: [ax + Math.cos(a) * 0.04, fy + 0.019, z + Math.sin(a) * 0.04] }));
      }
      register('RAILPOST', {
        box: box3(ax, fy + h / 2, z, 0.05, h, 0.05),
        support: fy, level: rowLevel(Math.max(0, Math.round((z - L.firstRowZ) / L.rowPitch))), solid: false,
      });
    }
    // Ball finials capping both ends
    for (const z of [zStart, zEnd]) {
      const fy = floorHeightAt(z);
      B.add('brass', xf(new THREE.SphereGeometry(0.036, 16, 12), { pos: [ax, fy + L.railHeight, z] }));
    }
  }

  /* ============================================================ *
   *  3. SIDE WALLS — wainscot, pilasters, fabric bays, sconces
   * ============================================================ */
  const bayCount = 9;
  const wallZ0 = L.screenZ + 0.4, wallZ1 = L.backZ;
  const bayLen = (wallZ1 - wallZ0) / bayCount;

  for (const sx of [-1, 1]) {
    const x = sx * L.halfWidth;

    // Structural wall slab
    B.add('plaster', xf(new THREE.BoxGeometry(0.4, L.wallY, wallZ1 - wallZ0), { pos: [x + sx * 0.2, L.wallY / 2, (wallZ0 + wallZ1) / 2] }));
    addCollider(box3(x + sx * 0.25, L.wallY / 2, (wallZ0 + wallZ1) / 2, 0.5, L.wallY, wallZ1 - wallZ0));
    register('WALL', {
      box: box3(x + sx * 0.2, L.wallY / 2, (wallZ0 + wallZ1) / 2, 0.4, L.wallY, wallZ1 - wallZ0),
      support: 0, level: 0,
    });

    for (let b = 0; b < bayCount; b++) {
      const cz = wallZ0 + (b + 0.5) * bayLen;
      const fy = floorHeightAt(cz);

      // Walnut wainscot with a moulded cap rail
      B.add('wood', xf(new THREE.BoxGeometry(0.06, 1.05, bayLen - 0.02), { pos: [x - sx * 0.03, fy + 0.525, cz] }));
      B.add('wood', xf(new THREE.BoxGeometry(0.11, 0.055, bayLen - 0.02), { pos: [x - sx * 0.055, fy + 1.075, cz] }));
      B.add('wood', xf(new THREE.BoxGeometry(0.09, 0.10, bayLen - 0.02), { pos: [x - sx * 0.045, fy + 0.05, cz] }));

      // Recessed acoustic fabric panel
      const panelH = 6.4;
      B.add('acoustic', xf(new THREE.BoxGeometry(0.05, panelH, bayLen - 0.55), { pos: [x - sx * 0.025, fy + 1.1 + panelH / 2, cz] }));
      // Framing batten around the fabric
      for (const dy of [-panelH / 2 - 0.05, panelH / 2 + 0.05]) {
        B.add('wood', xf(new THREE.BoxGeometry(0.09, 0.10, bayLen - 0.45), { pos: [x - sx * 0.045, fy + 1.1 + panelH / 2 + dy, cz] }));
      }

      // Pilasters between bays: fluted shaft, moulded base and capital
      if (b < bayCount - 1) {
        const pz = wallZ0 + (b + 1) * bayLen;
        const py = floorHeightAt(pz);
        B.add('wood', xf(new THREE.BoxGeometry(0.17, L.wallY - py - 0.6, 0.34), { pos: [x - sx * 0.085, py + (L.wallY - py - 0.6) / 2, pz] }));
        for (let f = 0; f < 3; f++) {
          B.add('wood', xf(new THREE.CylinderGeometry(0.018, 0.018, L.wallY - py - 1.4, 8), { pos: [x - sx * 0.17, py + 0.5 + (L.wallY - py - 1.4) / 2, pz - 0.1 + f * 0.1] }));
        }
        B.add('wood', xf(new THREE.BoxGeometry(0.26, 0.16, 0.44), { pos: [x - sx * 0.13, py + 0.08, pz] }));
        B.add('wood', xf(new THREE.BoxGeometry(0.30, 0.22, 0.48), { pos: [x - sx * 0.15, L.wallY - 0.55, pz] }));
        B.add('brass', xf(new THREE.BoxGeometry(0.32, 0.05, 0.50), { pos: [x - sx * 0.16, L.wallY - 0.41, pz] }));
        register('PILASTER', {
          box: box3(x - sx * 0.085, py + (L.wallY - py) / 2, pz, 0.35, L.wallY - py, 0.5),
          support: py, level: rowLevel(Math.max(0, Math.round((pz - L.firstRowZ) / L.rowPitch))),
          embeds: ['WALL'],
        });
      }

      // Art-deco sconce: cast back-plate, stepped fan shade, glowing lens
      const sy = fy + 3.15;
      B.add('brass', xf(new THREE.BoxGeometry(0.06, 0.52, 0.20), { pos: [x - sx * 0.06, sy, cz] }));
      B.add('brass', xf(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 12), { pos: [x - sx * 0.11, sy - 0.22, cz] }));
      for (let s = 0; s < 3; s++) {
        const w = 0.34 - s * 0.07, h = 0.10;
        B.add('brass', xf(new THREE.BoxGeometry(0.13 + s * 0.05, h, w), { pos: [x - sx * (0.09 + s * 0.03), sy + 0.06 + s * 0.11, cz] }));
      }
      const lens = new THREE.BoxGeometry(0.10, 0.42, 0.24);
      B.add('sconce', xf(lens, { pos: [x - sx * 0.14, sy + 0.02, cz] }));
      emissives.push({ type: 'sconce', pos: new THREE.Vector3(x - sx * 0.4, sy + 0.1, cz) });
      register('SCONCE', {
        box: box3(x - sx * 0.11, sy, cz, 0.3, 0.9, 0.4),
        pos: new THREE.Vector3(x - sx * 0.11, sy, cz),
        level: rowLevel(Math.max(0, Math.round((cz - L.firstRowZ) / L.rowPitch))), solid: false,
      });

      // Surround speaker every third bay
      if (b % 3 === 1) {
        const spy = fy + 5.2;
        B.add('shell', xf(roundedBox(0.28, 0.62, 0.42, 0.04, 0.01), { pos: [x - sx * 0.16, spy, cz] }));
        B.add('grille', xf(new THREE.BoxGeometry(0.03, 0.54, 0.34), { pos: [x - sx * 0.31, spy, cz] }));
        for (const dy of [-0.20, 0.20]) {
          B.add('metal', xf(xf(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), { rot: [0, 0, Math.PI / 2] }), { pos: [x - sx * 0.30, spy + dy, cz] }));
        }
        // Mounting yoke
        B.add('metal', xf(new THREE.BoxGeometry(0.05, 0.10, 0.50), { pos: [x - sx * 0.05, spy + 0.34, cz] }));
        register('SPEAKER', {
          box: box3(x - sx * 0.16, spy, cz, 0.35, 0.62, 0.42),
          pos: new THREE.Vector3(x - sx * 0.16, spy, cz), solid: false,
          level: rowLevel(Math.max(0, Math.round((cz - L.firstRowZ) / L.rowPitch))),
        });
      }
    }
  }

  /* ============================================================ *
   *  4. EXIT DOORS — frame, leaf, push bar, kick plate, sign
   * ============================================================ */
  const exitSignTex = makeExitSign();
  // Doors land on bay CENTRES. Anything else punches the opening straight
  // through a pilaster — which the overlap validator duly caught.
  const bayCentre = (b) => wallZ0 + (b + 0.5) * bayLen;
  const doorSpots = [
    [-1, bayCentre(3)], [1, bayCentre(3)], [-1, bayCentre(8)], [1, bayCentre(8)],
  ];
  const signMat = new THREE.MeshBasicMaterial({ map: exitSignTex, toneMapped: false });
  doorSpots.forEach(([sx, dz], di) => {
    const x = sx * L.halfWidth;
    const fy = floorHeightAt(dz);
    const W = 1.85, H = 2.30;

    B.add('wood', xf(new THREE.BoxGeometry(0.22, H + 0.24, 0.14), { pos: [x - sx * 0.11, fy + (H + 0.24) / 2, dz - W / 2 - 0.07] }));
    B.add('wood', xf(new THREE.BoxGeometry(0.22, H + 0.24, 0.14), { pos: [x - sx * 0.11, fy + (H + 0.24) / 2, dz + W / 2 + 0.07] }));
    B.add('wood', xf(new THREE.BoxGeometry(0.22, 0.16, W + 0.28), { pos: [x - sx * 0.11, fy + H + 0.08, dz] }));

    for (const leaf of [-1, 1]) {
      const lz = dz + leaf * W / 4;
      B.add('shell', xf(roundedBox(0.055, H, W / 2 - 0.02, 0.01, 0.004), { pos: [x - sx * 0.03, fy + H / 2, lz] }));
      B.add('metal', xf(new THREE.BoxGeometry(0.02, 0.34, W / 2 - 0.08), { pos: [x - sx * 0.062, fy + 0.19, lz] }));
      // Push bar with two standoffs
      B.add('metal', xf(new THREE.BoxGeometry(0.05, 0.055, W / 2 - 0.16), { pos: [x - sx * 0.085, fy + 1.02, lz] }));
      for (const t of [-1, 1]) {
        B.add('metal', xf(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8).rotateZ(Math.PI / 2), { pos: [x - sx * 0.06, fy + 1.02, lz + t * (W / 4 - 0.14)] }));
      }
      // Vision panel
      B.add('glass', xf(new THREE.BoxGeometry(0.02, 0.46, W / 2 - 0.30), { pos: [x - sx * 0.05, fy + 1.72, lz] }));
      for (const hy of [1.60, 1.86]) {
        for (const t of [-1, 1]) {
          const b = boltGeom(0.006, 0.003, 0.0025, 0.01);
          b.rotateZ(sx * Math.PI / 2);
          B.add('metal', xf(b, { pos: [x - sx * 0.058, fy + hy, lz + t * (W / 4 - 0.13)] }));
        }
      }
    }
    addCollider(box3(x - sx * 0.05, fy + H / 2, dz, 0.2, H, W));
    register('DOOR', {
      box: box3(x - sx * 0.05, fy + H / 2, dz, 0.2, H, W),
      pos: new THREE.Vector3(x - sx * 0.05, fy + H / 2, dz),
      support: fy, level: rowLevel(Math.max(0, Math.round((dz - L.firstRowZ) / L.rowPitch))),
      embeds: ['WALL', 'PILASTER'],
      meta: { side: sx < 0 ? 'west' : 'east' },
    });

    // Illuminated EXIT box over the head
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.30, 0.62), signMat);
    sign.position.set(x - sx * 0.22, fy + H + 0.42, dz);
    sign.name = `EXITSIGN#${di}`;
    scene.add(sign);
    emissives.push({ type: 'exit', pos: new THREE.Vector3(x - sx * 0.5, fy + H + 0.42, dz) });
    B.add('metal', xf(new THREE.BoxGeometry(0.12, 0.36, 0.68), { pos: [x - sx * 0.18, fy + H + 0.42, dz] }));
    register('EXITSIGN', {
      box: box3(x - sx * 0.22, fy + H + 0.42, dz, 0.12, 0.36, 0.68),
      pos: sign.position.clone(), solid: false,
      level: rowLevel(Math.max(0, Math.round((dz - L.firstRowZ) / L.rowPitch))),
    });
  });

  /* ============================================================ *
   *  5. SCREEN WALL, PROSCENIUM, MASKING, CURTAINS
   * ============================================================ */
  {
    const z = L.screenZ;
    B.add('plaster', xf(new THREE.BoxGeometry(L.halfWidth * 2 + 1, L.wallY + 1, 0.5), { pos: [0, (L.wallY + 1) / 2 - 0.5, z - 0.25] }));
    addCollider(box3(0, L.wallY / 2, z - 0.25, L.halfWidth * 2 + 1, L.wallY, 0.6));
    register('WALL', { box: box3(0, L.wallY / 2, z - 0.25, L.halfWidth * 2 + 1, L.wallY, 0.5), support: 0, level: 0 });

    // Stage / apron with a moulded fascia and tread nosing
    const sd = L.stageDepth;
    const stageDeck = xf(
      new THREE.BoxGeometry(L.halfWidth * 2 - 2, L.stageY, sd),
      { pos: [0, L.stageY / 2, z + sd / 2] },
    );
    B.add('wood', stageDeck);
    B.add('brass', xf(new THREE.CylinderGeometry(0.03, 0.03, L.halfWidth * 2 - 2, 10).rotateZ(Math.PI / 2), { pos: [0, L.stageY - 0.015, z + sd] }));
    B.add('wood', xf(new THREE.BoxGeometry(L.halfWidth * 2 - 2, 0.18, 0.1), { pos: [0, L.stageY - 0.4, z + sd + 0.05] }));
    addCollider(box3(0, L.stageY / 2, z + sd / 2, L.halfWidth * 2 - 2, L.stageY, sd));
    const stageAsset = register('STAGE', {
      box: box3(0, L.stageY / 2, z + sd / 2, L.halfWidth * 2 - 2, L.stageY, sd),
      support: 0, level: -1,
    });
    walkables.push(createWalkableSurface(stageDeck, stageAsset, { compareLayout: false }));

    // Proscenium arch: stepped reveal, fluted jambs, ornamental frieze
    const pw = L.proscHalfWidth, pt = L.proscTop;
    for (let step = 0; step < 3; step++) {
      const inset = 0.35 + step * 0.30;
      const dz = 0.18 + step * 0.22;
      for (const sx of [-1, 1]) {
        B.add('wood', xf(new THREE.BoxGeometry(0.30 + step * 0.06, pt, dz), { pos: [sx * (pw + inset), pt / 2, z + 0.4 + step * 0.24] }));
      }
      B.add('wood', xf(new THREE.BoxGeometry((pw + inset) * 2 + 0.6, 0.30 + step * 0.06, dz), { pos: [0, pt + inset * 0.55, z + 0.4 + step * 0.24] }));
    }
    // Gilded bead moulding on the inner reveal
    for (const sx of [-1, 1]) {
      B.add('brass', xf(new THREE.CylinderGeometry(0.035, 0.035, pt, 8), { pos: [sx * (pw + 0.2), pt / 2, z + 0.95] }));
    }
    B.add('brass', xf(new THREE.CylinderGeometry(0.035, 0.035, (pw + 0.2) * 2, 8).rotateZ(Math.PI / 2), { pos: [0, pt + 0.1, z + 0.95] }));
    // Central cartouche
    B.add('brass', xf(new THREE.SphereGeometry(0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, pt + 0.45, z + 1.0], rot: [-Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI - Math.PI / 2;
      B.add('brass', xf(new THREE.BoxGeometry(0.07, 0.34, 0.07), { pos: [Math.sin(a) * 0.62, pt + 0.42 + Math.cos(a) * 0.16, z + 1.0], rot: [0, 0, -a] }));
    }
    register('PROSCENIUM', {
      // Spans y = 0 .. pt + 1, so the box centre is (pt + 1) / 2 — not pt / 2,
      // which parked half a metre of it underground.
      box: box3(0, (pt + 1) / 2, z + 0.8, (pw + 1.2) * 2, pt + 1, 1.4),
      support: 0, level: -1, solid: false,
    });

    // Black masking surround, sized to the scope image
    const mw = L.screenW, mh = L.screenH, mb = L.screenBottom;
    const mz = L.screenPlaneZ - 0.06;
    const masks = [
      [0, mb + mh + 0.55, mw + 2.2, 1.1],
      [0, mb - 0.55, mw + 2.2, 1.1],
      [-(mw / 2 + 0.55), mb + mh / 2, 1.1, mh],
      [mw / 2 + 0.55, mb + mh / 2, 1.1, mh],
    ];
    for (const [cx, cy, w, h] of masks) {
      B.add('masking', xf(new THREE.BoxGeometry(w, h, 0.14), { pos: [cx, cy, mz] }));
    }
    // Screen frame channel + tension hooks
    for (const sx of [-1, 1]) {
      B.add('metal', xf(new THREE.BoxGeometry(0.07, mh + 0.2, 0.12), { pos: [sx * (mw / 2 + 0.05), mb + mh / 2, mz + 0.09] }));
      for (let i = 0; i < 14; i++) {
        B.add('metal', xf(new THREE.TorusGeometry(0.016, 0.004, 5, 10), { pos: [sx * (mw / 2 + 0.02), mb + 0.2 + i * (mh - 0.4) / 13, mz + 0.14], rot: [0, Math.PI / 2, 0] }));
      }
    }
    for (const cy of [mb - 0.03, mb + mh + 0.03]) {
      B.add('metal', xf(new THREE.BoxGeometry(mw + 0.1, 0.07, 0.12), { pos: [0, cy, mz + 0.09] }));
    }

    // Draw curtain — gathered velour legs either side, plus a valance
    const pleats = 26;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < pleats; i++) {
        const t = i / (pleats - 1);
        const px = sx * (pw + 0.25 - t * 2.1);
        const depth = 0.16 + Math.sin(t * Math.PI * 3.5) * 0.09;
        const g = new THREE.CylinderGeometry(depth, depth * 0.9, pt - 0.2, 8, 1, false, 0, Math.PI * 1.25);
        g.rotateY(sx > 0 ? Math.PI * 0.85 : Math.PI * 1.9);
        B.add('curtain', xf(g, { pos: [px, (pt - 0.2) / 2, z + 1.35] }));
      }
    }
    // Valance with a scalloped hem and bullion fringe
    for (let i = 0; i < 46; i++) {
      const t = i / 45;
      const px = -(pw + 0.3) + t * (pw + 0.3) * 2;
      const sag = Math.sin(t * Math.PI * 8) * 0.09;
      const g = new THREE.CylinderGeometry(0.17, 0.15, 1.25 + sag, 8, 1, false, 0, Math.PI * 1.3);
      g.rotateY(Math.PI * 1.35);
      B.add('curtain', xf(g, { pos: [px, pt - 0.5 - (1.25 + sag) / 2 + 0.6, z + 1.35] }));
      if (i % 2 === 0) {
        B.add('brass', xf(new THREE.CylinderGeometry(0.022, 0.028, 0.16, 6), { pos: [px, pt - 1.22 - sag, z + 1.35] }));
      }
    }
    // Curtain track and carriers
    B.add('metal', xf(new THREE.BoxGeometry((pw + 0.6) * 2, 0.09, 0.1), { pos: [0, pt + 0.02, z + 1.35] }));
    for (let i = 0; i < 30; i++) {
      const px = -(pw + 0.5) + (i / 29) * (pw + 0.5) * 2;
      B.add('metal', xf(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), { pos: [px, pt - 0.06, z + 1.35] }));
    }

    // Stage-front footlight troughs
    for (let i = 0; i < 12; i++) {
      const px = -9 + i * 1.64;
      B.add('metal', xf(new THREE.BoxGeometry(0.24, 0.10, 0.18), { pos: [px, L.stageY + 0.06, z + sd - 0.22] }));
      B.add('led', xf(new THREE.BoxGeometry(0.18, 0.05, 0.03), { pos: [px, L.stageY + 0.07, z + sd - 0.31] }));
    }
  }

  /* ============================================================ *
   *  6. REAR WALL + PROJECTION BOOTH
   * ============================================================ */
  {
    const z = L.backZ;
    const y = rowY(L.rows - 1);
    const T = L.audWallT, W = L.halfWidth * 2 + 1;
    const halfW = W / 2;

    // The rear wall is pierced by the two auditorium entrances, so it is
    // built as piers + headers rather than one slab.
    const openings = L.audDoors.map((cx) => [cx - L.audDoorW / 2, cx + L.audDoorW / 2]).sort((a, b) => a[0] - b[0]);
    const edges = [-halfW, ...openings.flat(), halfW];
    for (let i = 0; i < edges.length; i += 2) {
      const x0 = edges[i], x1 = edges[i + 1];
      const w = x1 - x0;
      if (w <= 0.01) continue;
      B.add('plaster', xf(new THREE.BoxGeometry(w, L.wallY, T), { pos: [(x0 + x1) / 2, L.wallY / 2, z + T / 2] }));
      addCollider(box3((x0 + x1) / 2, L.wallY / 2, z + T / 2, w, L.wallY, T + 0.1));
      register('WALL', { box: box3((x0 + x1) / 2, L.wallY / 2, z + T / 2, w, L.wallY, T), support: 0, level: 0 });
    }
    // Header over each opening
    for (const [x0, x1] of openings) {
      const hy = y + L.audDoorH;
      B.add('plaster', xf(new THREE.BoxGeometry(x1 - x0, L.wallY - hy, T), { pos: [(x0 + x1) / 2, hy + (L.wallY - hy) / 2, z + T / 2] }));
      addCollider(box3((x0 + x1) / 2, hy + (L.wallY - hy) / 2, z + T / 2, x1 - x0, L.wallY - hy, T + 0.1));
      // Lined reveal in walnut
      for (const sx of [x0, x1]) {
        B.add('wood', xf(new THREE.BoxGeometry(0.09, L.audDoorH, T + 0.06), { pos: [sx, y + L.audDoorH / 2, z + T / 2] }));
      }
      B.add('wood', xf(new THREE.BoxGeometry(x1 - x0 + 0.18, 0.11, T + 0.06), { pos: [(x0 + x1) / 2, hy + 0.055, z + T / 2] }));
    }

    // Acoustic treatment between the openings only
    for (const [ax, bx] of [[-halfW + 0.5, L.audDoors[0] - 1.5], [L.audDoors[0] + 1.5, L.audDoors[1] - 1.5], [L.audDoors[1] + 1.5, halfW - 0.5]]) {
      if (bx - ax < 0.4) continue;
      B.add('acoustic', xf(new THREE.BoxGeometry(bx - ax, 4.6, 0.06), { pos: [(ax + bx) / 2, y + 3.6, z - 0.03] }));
      B.add('wood', xf(new THREE.BoxGeometry(bx - ax, 0.14, 0.16), { pos: [(ax + bx) / 2, y + 1.20, z - 0.08] }));
      B.add('wood', xf(new THREE.BoxGeometry(bx - ax, 1.20, 0.08), { pos: [(ax + bx) / 2, y + 0.60, z - 0.04] }));
    }

    // Booth fascia with two ports and an observation window
    const by = y + 6.4;
    B.add('shell', xf(new THREE.BoxGeometry(7.4, 2.0, 0.35), { pos: [0, by, z - 0.18] }));
    for (const px of [-1.5, 1.5]) {
      B.add('metal', xf(new THREE.BoxGeometry(1.15, 0.95, 0.24), { pos: [px, by + 0.1, z - 0.34] }));
      B.add('port', xf(new THREE.BoxGeometry(0.95, 0.72, 0.04), { pos: [px, by + 0.1, z - 0.47] }));
      for (const c of [[-0.52, 0.42], [0.52, 0.42], [-0.52, -0.42], [0.52, -0.42]]) {
        const b = boltGeom(0.008, 0.004, 0.003, 0.012);
        b.rotateX(Math.PI / 2);
        B.add('metal', xf(b, { pos: [px + c[0], by + 0.1 + c[1], z - 0.46] }));
      }
      register('PORT', {
        box: box3(px, by + 0.1, z - 0.4, 1.15, 0.95, 0.3),
        pos: new THREE.Vector3(px, by + 0.1, z - 0.4), solid: false,
        level: rowLevel(L.rows - 1),
      });
    }
    B.add('glass', xf(new THREE.BoxGeometry(2.0, 0.75, 0.04), { pos: [0, by + 0.1, z - 0.37] }));
  }

  /* ============================================================ *
   *  7. CEILING — coffer grid, cove, rosette, downlights
   * ============================================================ */
  {
    const cy = L.ceilY;
    B.add('plaster', xf(new THREE.BoxGeometry(L.halfWidth * 2, 0.4, L.backZ - L.screenZ), { pos: [0, cy + 0.2, (L.backZ + L.screenZ) / 2] }));

    const cols = 6, rowsC = 11;
    const cw = (L.halfWidth * 2 - 2.4) / cols;
    const cd = (L.backZ - L.screenZ - 3.0) / rowsC;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowsC; j++) {
        const px = -(L.halfWidth - 1.2) + (i + 0.5) * cw;
        const pz = L.screenZ + 1.6 + (j + 0.5) * cd;
        // Two-step coffer recess
        B.add('plaster', xf(new THREE.BoxGeometry(cw - 0.34, 0.22, cd - 0.34), { pos: [px, cy - 0.11, pz] }));
        B.add('plaster', xf(new THREE.BoxGeometry(cw - 0.72, 0.18, cd - 0.72), { pos: [px, cy - 0.30, pz] }));
        // Gilt bead on the coffer lip
        B.add('brass', xf(new THREE.BoxGeometry(cw - 0.30, 0.035, cd - 0.30), { pos: [px, cy - 0.235, pz] }));
        // Recessed downlight + its trim ring
        B.add('metal', xf(new THREE.CylinderGeometry(0.115, 0.135, 0.08, 16), { pos: [px, cy - 0.40, pz] }));
        B.add('downlight', xf(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 16), { pos: [px, cy - 0.445, pz] }));
        if ((i + j) % 5 === 0) emissives.push({ type: 'down', pos: new THREE.Vector3(px, cy - 0.6, pz) });
        register('COFFER', {
          box: box3(px, cy - 0.2, pz, cw - 0.34, 0.5, cd - 0.34),
          pos: new THREE.Vector3(px, cy - 0.2, pz), solid: false, level: 9,
        });
      }
    }
    // Perimeter cove that hides an uplight strip
    for (const sx of [-1, 1]) {
      B.add('plaster', xf(new THREE.BoxGeometry(0.9, 0.5, L.backZ - L.screenZ), { pos: [sx * (L.halfWidth - 0.45), cy - 0.25, (L.backZ + L.screenZ) / 2] }));
      B.add('coveglow', xf(new THREE.BoxGeometry(0.5, 0.05, L.backZ - L.screenZ - 1), { pos: [sx * (L.halfWidth - 0.75), cy - 0.52, (L.backZ + L.screenZ) / 2] }));
    }
    // Central ceiling rosette
    B.add('plaster', xf(new THREE.CylinderGeometry(1.7, 1.9, 0.3, 32), { pos: [0, cy - 0.15, -6] }));
    B.add('brass', xf(new THREE.TorusGeometry(1.55, 0.06, 8, 40), { pos: [0, cy - 0.32, -6], rot: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      B.add('brass', xf(new THREE.BoxGeometry(0.10, 0.07, 0.55), { pos: [Math.cos(a) * 1.18, cy - 0.33, -6 + Math.sin(a) * 1.18], rot: [0, -a, 0] }));
    }
    B.add('rosette', xf(new THREE.SphereGeometry(0.45, 20, 14), { pos: [0, cy - 0.5, -6] }));
    emissives.push({ type: 'rosette', pos: new THREE.Vector3(0, L.ceilY - 1.0, -6) });
  }

  /* ============================================================ *
   *  8. POSTER CASES on the front side walls
   * ============================================================ */
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const pz = -20.5 + i * 3.4;
      const posterMat = new THREE.MeshStandardMaterial({ map: makePoster(i + (sx > 0 ? 2 : 0)), roughness: 0.62, metalness: 0.0 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.58), posterMat);
      p.position.set(sx * (L.halfWidth - 0.14), 2.6, pz);
      p.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      p.name = `POSTER#${i + (sx > 0 ? 2 : 0)}`;
      scene.add(p);
      B.add('brass', xf(new THREE.BoxGeometry(0.10, 1.80, 1.26), { pos: [sx * (L.halfWidth - 0.06), 2.6, pz] }));
      B.add('glass', xf(new THREE.BoxGeometry(0.03, 1.64, 1.10), { pos: [sx * (L.halfWidth - 0.19), 2.6, pz] }));
      B.add('brass', xf(new THREE.BoxGeometry(0.16, 0.09, 1.30), { pos: [sx * (L.halfWidth - 0.10), 3.56, pz] }));
      register('POSTER', {
        box: box3(sx * (L.halfWidth - 0.1), 2.6, pz, 0.2, 1.8, 1.26),
        pos: p.position.clone(), solid: false, level: 0,
      });
    }
  }

  /* ============================================================ *
   *  9. ROW LETTER PLATES on the aisle-end standards
   * ============================================================ */
  for (let r = 0; r < L.rows; r++) {
    const tex = makeRowPlate(ROW_LETTERS[r]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.85 });
    for (const side of [-1, 1]) {
      const x = side * (L.seatingHalf + 0.08);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat);
      pl.position.set(x, rowY(r) + 1.28, rowZ(r) + 0.12);
      pl.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      pl.name = `ROWPLATE#${r}_${side > 0 ? 'E' : 'W'}`;
      scene.add(pl);
      B.add('brass', xf(new THREE.CylinderGeometry(0.022, 0.028, 0.34, 10), { pos: [x + side * 0.02, rowY(r) + 1.08, rowZ(r) + 0.12] }));
      register('ROWPLATE', {
        box: box3(x, rowY(r) + 1.28, rowZ(r) + 0.12, 0.06, 0.16, 0.16),
        pos: pl.position.clone(), solid: false, level: rowLevel(r),
        meta: { row: ROW_LETTERS[r] },
      });
    }
  }

  const meshes = B.flush(scene, M, 'theater');
  return { colliders, emissives, meshes, walkables };
}
