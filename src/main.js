import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

import * as TX from './textures.js';
import { L, rowY, rowZ, rowLevel, seatX, ROW_LETTERS } from './layout.js';
import { buildTheater } from './theater.js';
import { buildBuilding } from './building.js';
import { DoorSet } from './doors.js';
import { buildSeatParts, buildEndStandard, buildNumberTag, makeNumberAtlas, SEAT } from './seat.js';
import { Player, bindInput } from './controls.js';
import { VideoScreen, PLAYLIST } from './videoscreen.js';
import { Inspector } from './inspector.js';
import { register, registerValidator, registry, worldToGrid, gridLabel } from './registry.js';
import { WalkableSurfaceMap } from './walkable.js';

const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
// setTimeout, not rAF: a backgrounded tab stops painting frames and would
// otherwise deadlock the whole build here.
const step = (msg) => new Promise((res) => {
  loadingText.textContent = msg;
  setTimeout(res, 12);
});

const isMobile = matchMedia('(hover:none) and (pointer:coarse)').matches || navigator.maxTouchPoints > 0;

/* ================================================================== *
 *  RENDERER
 * ================================================================== */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 2 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// Provider embeds cannot become WebGL textures. CSS3D places their official
// iframe players on the same world-space screen while WebGL keeps ownership
// of local/direct media, sampling, and auditorium lighting.
const embedRenderer = new CSS3DRenderer();
embedRenderer.setSize(innerWidth, innerHeight);
embedRenderer.domElement.id = 'embed-renderer';
embedRenderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:31;pointer-events:none;overflow:hidden';
document.body.appendChild(embedRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a14, 0.0105);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.06, 220);

/* ================================================================== *
 *  MATERIALS
 *  Geometry UVs are authored in metres (see geom.planarUV), so each
 *  texture's repeat is 1/tileMetres. Texel density is therefore
 *  identical on a bolt head and on a 30 m wall.
 * ================================================================== */
function pbr(set, extra = {}) {
  const { normalStrength = 1, ...matOpts } = extra;
  const m = new THREE.MeshStandardMaterial({
    map: set.map || null,
    normalMap: set.normalMap || null,
    roughnessMap: set.roughnessMap || null,
    metalnessMap: set.metalnessMap || null,
    ...matOpts,
  });
  const r = 1 / set.tileMetres;
  for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) {
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(r, r); t.needsUpdate = true; }
  }
  if (m.normalMap) m.normalScale.set(normalStrength, normalStrength);
  return m;
}

async function buildMaterials() {
  await step('Weaving the carpet…');
  const carpet = TX.makeCarpet(1024, 2.2);
  await step('Cutting velour for 448 seats…');
  const velour = TX.makeVelour(1024, [0.40, 0.055, 0.095]);
  await step('Tanning leather…');
  const leather = TX.makeLeather(512);
  await step('Milling walnut…');
  const wood = TX.makeWood(512);
  await step('Stretching acoustic panels…');
  const acoustic = TX.makeAcousticFabric(512);
  await step('Skimming plaster…');
  const plaster = TX.makePlaster(512);
  await step('Pouring risers…');
  const concrete = TX.makeConcrete(512);
  await step('Casting the ironwork…');
  const steel = TX.makeMetal(512, [0.50, 0.50, 0.51]);
  const brass = TX.makeMetal(512, [0.70, 0.545, 0.27]);
  await step('Hanging the screen…');
  const screenFab = TX.makeScreenFabric(512);
  await step('Polishing the lobby terrazzo…');
  const terrazzo = TX.makeTerrazzo(1024, 3.0);
  await step('Cladding the façade…');
  const acm = TX.makeACM(512);
  const asphalt = TX.makeAsphalt(512);

  const M = {
    carpet: pbr(carpet, { roughness: 1.0, metalness: 0.0, normalStrength: 1.35 }),
    velour: pbr(velour, { roughness: 1.0, metalness: 0.0, normalStrength: 0.8 }),
    leather: pbr(leather, { roughness: 1.0, metalness: 0.0, normalStrength: 1.1 }),
    wood: pbr(wood, { roughness: 1.0, metalness: 0.06, normalStrength: 0.8 }),
    acoustic: pbr(acoustic, { roughness: 1.0, metalness: 0.0, normalStrength: 0.7 }),
    plaster: pbr(plaster, { roughness: 1.0, metalness: 0.0, normalStrength: 0.65 }),
    concrete: pbr(concrete, { roughness: 1.0, metalness: 0.0, normalStrength: 1.0 }),
    metal: pbr(steel, { roughness: 1.0, metalness: 1.0, normalStrength: 0.7 }),
    brass: pbr(brass, { roughness: 1.0, metalness: 1.0, normalStrength: 0.6 }),
    screenfab: pbr(screenFab, { roughness: 0.86, metalness: 0.0 }),
    terrazzo: pbr(terrazzo, { roughness: 1.0, metalness: 0.02, normalStrength: 0.5 }),
    acm: pbr(acm, { roughness: 1.0, metalness: 0.35, normalStrength: 0.5 }),
    asphalt: pbr(asphalt, { roughness: 1.0, metalness: 0.0, normalStrength: 0.9 }),
  };

  M.shell = new THREE.MeshStandardMaterial({ color: 0x2a262f, roughness: 0.48, metalness: 0.18 });
  M.shell.normalMap = M.plaster.normalMap;
  M.shell.normalScale.set(0.25, 0.25);
  M.curtain = pbr(velour, { roughness: 1.0, metalness: 0.0, normalStrength: 1.0 });
  M.curtain.color.setHex(0x8a2233);
  M.masking = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.97, metalness: 0.0 });
  M.grille = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.85, metalness: 0.1 });
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xcfe2ea, roughness: 0.03, metalness: 0.0, transmission: 0.94,
    thickness: 0.015, transparent: true, opacity: 0.18, ior: 1.52,
  });

  const emis = (hex, i) => new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: new THREE.Color(hex), emissiveIntensity: i, roughness: 0.5, toneMapped: true,
  });
  M.led = emis(0xffd9a0, 2.6);
  M.sconce = emis(0xffc072, 3.4);
  M.downlight = emis(0xffe0b8, 2.0);
  M.rosette = emis(0xffdcae, 0.75);
  M.coveglow = emis(0xff9f5c, 1.5);
  M.port = emis(0x6fa8ff, 1.1);
  M.popcorn = emis(0xffc247, 1.4);

  return M;
}

/* ================================================================== *
 *  SEATS — instanced, with a per-seat hinged pan
 * ================================================================== */
function buildSeats(scene, M) {
  const parts = buildSeatParts();
  const endStd = buildEndStandard();
  const tagGeo = buildNumberTag();
  const atlas = makeNumberAtlas();

  const seats = [];
  const total = L.rows * L.seatsPerRow;

  const staticMats = { metal: M.metal, wood: M.wood, leather: M.leather, fabric: M.velour, shell: M.shell };
  const hingedMats = { fabric: M.velour, shell: M.shell, metal: M.metal };

  const group = new THREE.Group();
  group.name = 'SEATING';
  scene.add(group);

  const staticMeshes = {}, hingedMeshes = {};
  for (const k of Object.keys(parts.static)) {
    const im = new THREE.InstancedMesh(parts.static[k], staticMats[k], total);
    im.frustumCulled = false;
    im.name = `SEAT_static_${k}`;
    group.add(im);
    staticMeshes[k] = im;
  }
  for (const k of Object.keys(parts.hinged)) {
    const im = new THREE.InstancedMesh(parts.hinged[k], hingedMats[k], total);
    im.frustumCulled = false;
    im.name = `SEAT_hinged_${k}`;
    group.add(im);
    hingedMeshes[k] = im;
  }

  // Row-end cap standards (one per row, per side)
  const capMesh = new THREE.InstancedMesh(endStd, M.metal, L.rows);
  capMesh.frustumCulled = false;
  group.add(capMesh);

  // Per-seat brass number tag, sampled from one 8x8 atlas
  const tagMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.44, metalness: 0.8, side: THREE.DoubleSide });
  tagMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec2 aTile;\n' + sh.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv += aTile;\n#endif',
    );
  };
  const tagMesh = new THREE.InstancedMesh(tagGeo, tagMat, total);
  tagMesh.frustumCulled = false;
  const tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2);
  tagGeo.setAttribute('aTile', tileAttr);
  group.add(tagMesh);

  // Soft contact darkening under each seat
  const blobTex = TX.makeRadialAlpha(128, 1.9);
  const blobMat = new THREE.MeshBasicMaterial({
    map: blobTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const blobGeo = new THREE.PlaneGeometry(0.9, 0.85).rotateX(-Math.PI / 2);
  const blobMesh = new THREE.InstancedMesh(blobGeo, blobMat, total);
  blobMesh.frustumCulled = false;
  blobMesh.renderOrder = -1;
  group.add(blobMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let i = 0;

  for (let r = 0; r < L.rows; r++) {
    const y = rowY(r);
    const z = rowZ(r);
    for (let c = 0; c < L.seatsPerRow; c++) {
      const x = seatX(c);
      const p = new THREE.Vector3(x, y, z);

      m.makeTranslation(x, y, z);
      for (const k of Object.keys(staticMeshes)) staticMeshes[k].setMatrixAt(i, m);

      m.makeTranslation(x, y + 0.0002, z + 0.02);
      blobMesh.setMatrixAt(i, m);

      // ~14% of seats are left folded down, as in any real house
      const down = ((r * 31 + c * 17) % 7) === 0;
      const angle = down ? 0 : -1.28;
      const rec = {
        id: `SEAT#${i}`,
        index: i,
        row: r, col: c,
        label: `${ROW_LETTERS[r]}${c + 1}`,
        pos: p,
        floorY: y,
        eye: new THREE.Vector3(x, y + SEAT.eyeSeated, z + 0.06),
        angle, target: angle,
        occupied: false,
      };
      seats.push(rec);
      writeHinge(hingedMeshes, i, rec);

      tileAttr.setXY(i, (c % 8) / 8, 7 / 8 - Math.floor((c % 64) / 8) / 8);
      m.makeTranslation(x, y, z);
      tagMesh.setMatrixAt(i, m);

      register('SEAT', {
        box: new THREE.Box3(
          new THREE.Vector3(x - L.seatPitch / 2, y, z - SEAT.panDepth / 2 - 0.06),
          new THREE.Vector3(x + L.seatPitch / 2, y + SEAT.backTop, z + 0.36),
        ),
        pos: p.clone(),
        support: y,
        level: rowLevel(r),
        solid: false,
        instanceId: i,
        meta: { seat: rec.label },
      });
      i++;
    }

    // Cap standard closing the right end of the row
    m.makeTranslation(seatX(L.seatsPerRow - 1), y, z);
    capMesh.setMatrixAt(r, m);
  }

  for (const k of Object.keys(staticMeshes)) staticMeshes[k].instanceMatrix.needsUpdate = true;
  for (const k of Object.keys(hingedMeshes)) hingedMeshes[k].instanceMatrix.needsUpdate = true;
  capMesh.instanceMatrix.needsUpdate = true;
  tagMesh.instanceMatrix.needsUpdate = true;
  blobMesh.instanceMatrix.needsUpdate = true;
  tileAttr.needsUpdate = true;

  void q; void one;
  return { seats, hingedMeshes, group };
}

const _m = new THREE.Matrix4();
const _hingeM = new THREE.Matrix4();
function writeHinge(meshes, i, rec) {
  // Rotate about the hinge axis, then place the seat in the room.
  _hingeM.makeRotationX(rec.angle);
  _hingeM.setPosition(
    rec.pos.x,
    rec.pos.y + SEAT.hinge.y - (Math.cos(rec.angle) * SEAT.hinge.y),
    rec.pos.z + SEAT.hinge.z,
  );
  // Compose: translate(seat) * translate(hinge) * rotX * translate(-hinge)
  _m.makeTranslation(rec.pos.x, rec.pos.y + SEAT.hinge.y, rec.pos.z + SEAT.hinge.z);
  const rot = new THREE.Matrix4().makeRotationX(rec.angle);
  _m.multiply(rot);
  for (const k of Object.keys(meshes)) meshes[k].setMatrixAt(i, _m);
}

/* ================================================================== *
 *  BOOT
 * ================================================================== */
(async function boot() {
  const M = await buildMaterials();

  // Everything lives under one root Group, so a host world can drop the
  // whole cinema in with `world.add(theater.root)` and move/rotate it.
  const root = new THREE.Group();
  root.name = 'MOVIE_THEATER';
  scene.add(root);

  await step('Raising the proscenium…');
  const theater = buildTheater(root, M);

  await step('Hanging the doors…');
  const doorSet = new DoorSet(root, M);

  await step('Pouring the lobby…');
  const building = buildBuilding(root, M, doorSet);

  const walkable = new WalkableSurfaceMap([...theater.walkables, ...building.walkables]);
  const validateWalkables = () => walkable.validate();
  validateWalkables();
  registerValidator('rendered walkable surfaces', () => walkable.validation);

  await step('Bolting down 448 seats…');
  const seating = buildSeats(root, M);

  await step('Threading the projector…');
  const screen = new VideoScreen(root, renderer);
  screen.mesh.material.map = screen.leader.texture;

  /* ---- night sky ---- */
  {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x01020a) },
          mid: { value: new THREE.Color(0x0b1430) },
          bot: { value: new THREE.Color(0x1a2137) },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
          void main(){
            float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0);
            vec3 c = h < 0.5 ? mix(bot, mid, h * 2.0) : mix(mid, top, (h - 0.5) * 2.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.name = 'SKY';
    sky.renderOrder = -100;
    building.site.add(sky);
  }

  /* ---- lighting ---- */
  scene.add(new THREE.HemisphereLight(0x3a3048, 0x120c16, 0.55));
  scene.add(new THREE.AmbientLight(0x352c44, 0.30));
  // Low moon fill. Kept weak on purpose: there are no shadow maps, so a
  // strong directional would leak straight through the walls.
  const moon = new THREE.DirectionalLight(0x9fb4e0, 0.35);
  moon.position.set(-40, 60, 70);
  scene.add(moon);

  const emissives = [...theater.emissives, ...building.emissives];
  const lampSpec = {
    sconce: [0xffb066, 4.0, 13, 2],
    rosette: [0xffd9b0, 5.0, 24, 3],
    lobbycove: [0xffc899, 60.0, 34, 2],
    lobbydown: [0xfff0d8, 34.0, 16, 2],
    menu: [0x9fd0ff, 9.0, 11, 2],
    popcorn: [0xffc247, 7.0, 8, 2],
    standee: [0xdfe8ff, 5.0, 7, 2],
    case: [0xdfe8ff, 5.0, 8, 2],
    canopy: [0xfff2dc, 5.0, 12, 3],
    marquee: [0xffca6a, 30.0, 30, 3],
    pylon: [0x8fc6ff, 6.0, 10, 3],
    lot: [0xd8e4ff, 90.0, 44, 3],
    wash: [0xbfd4ff, 14.0, 15, 2],
  };
  /* Three.js forward-renders every light in every fragment shader, so the
   * ~60 practicals in this building cannot all be real lights. Instead a
   * fixed-size pool is re-pointed each frame at whichever fixtures are
   * closest to the camera: constant shader cost, no recompiles, and the
   * lamps you can actually see are always the ones that are lit. */
  const lamps = emissives
    .filter((e) => lampSpec[e.type])
    .map((e) => ({ pos: e.pos, spec: lampSpec[e.type] }));

  const POOL_SIZE = isMobile ? 6 : 14;
  const lightPool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 1, 2);
    pl.visible = false;
    scene.add(pl);
    lightPool.push(pl);
  }

  const _scored = [];
  function updateLightPool(camPos) {
    _scored.length = 0;
    for (const l of lamps) {
      const d = l.pos.distanceTo(camPos);
      // Reach-relative score: a bright car-park mast still wins at 30 m,
      // a 6 m seat sconce does not.
      if (d > l.spec[2] * 1.35) continue;
      _scored.push([d / l.spec[2], l]);
    }
    _scored.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < POOL_SIZE; i++) {
      const pl = lightPool[i];
      const rec = _scored[i];
      if (!rec) { pl.visible = false; continue; }
      const [, l] = rec;
      pl.visible = true;
      pl.position.copy(l.pos);
      pl.color.setHex(l.spec[0]);
      pl.intensity = l.spec[1];
      pl.distance = l.spec[2];
      pl.decay = l.spec[3];
    }
  }
  updateLightPool(new THREE.Vector3(0, L.gradeY, L.facadeZ + 15));

  // Projector beam — a faint additive cone from the booth port to the screen
  {
    const from = new THREE.Vector3(-1.5, rowY(L.rows - 1) + 6.5, L.backZ - 0.5);
    const to = new THREE.Vector3(0, L.screenBottom + L.screenH / 2, L.screenPlaneZ);
    const len = from.distanceTo(to);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, L.screenH * 0.58, len, 28, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xa8c4ff, transparent: true, opacity: 0.008,
        blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
      }),
    );
    beam.position.copy(from).lerp(to, 0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    beam.renderOrder = 5;
    scene.add(beam);
    register('BEAM', { box: new THREE.Box3().setFromObject(beam), pos: beam.position.clone(), solid: false, level: 9 });
  }

  /* ---- player + input ---- */
  const staticColliders = [...theater.colliders, ...building.colliders];
  const player = new Player(camera, staticColliders, walkable);
  // Start outside, on the forecourt, facing the marquee.
  player.pos.set(0, L.gradeY, L.facadeZ + 15.0);
  player.yaw = 0;
  player.pitch = 0.06;

  const dom = {
    canvas,
    joyZone: document.getElementById('joystick-zone'),
    joyBase: document.getElementById('joystick-base'),
    joyNub: document.getElementById('joystick-nub'),
    lookZone: document.getElementById('look-zone'),
    clickToPlay: document.getElementById('click-to-play'),
    enterBtn: document.getElementById('enter-btn'),
  };
  const input = bindInput(player, dom);

  const inspector = new Inspector(scene, camera, player, staticColliders, walkable);
  input.onToggleInspect = () => inspector.toggle();
  document.getElementById('inspect-btn').addEventListener('click', () => inspector.toggle());

  /* ---- interaction: doors and seats share one action ---- */
  const promptEl = document.getElementById('prompt');
  const actionBtn = document.getElementById('sit-btn');
  let nearSeat = null;
  let nearDoor = null;

  const syncColliders = () => player.setColliders([...staticColliders, ...doorSet.colliders()]);
  syncColliders();

  function findNearSeat() {
    if (player.mode === 'seated') return null;
    let best = null, bd = 1.25 * 1.25;
    const p = player.pos;
    for (const s of seating.seats) {
      if (Math.abs(s.floorY - p.y) > 0.9) continue;
      const dx = s.pos.x - p.x, dz = s.pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  const dirty = new Set();
  function doAction() {
    if (player.mode === 'seated') {
      const s = player.seat;
      if (s) { s.occupied = false; s.target = -1.28; dirty.add(s); }
      player.stand();
      return;
    }
    // A door in reach always wins: you want to get in, not sit on the way.
    if (nearDoor) {
      doorSet.toggleGroup(nearDoor);
      return;
    }
    if (!nearSeat) return;
    nearSeat.occupied = true;
    nearSeat.target = 0;
    dirty.add(nearSeat);
    player.sitOn(nearSeat);
    promptEl.classList.remove('show');
  }
  input.onAction = doAction;
  actionBtn.addEventListener('click', doAction);

  /* ---- video panel ---- */
  const panel = document.getElementById('video-panel');
  const list = document.getElementById('video-list');
  const videoStatus = document.getElementById('video-status');
  const muteBtn = document.getElementById('mute-btn');
  const embedInputBtn = document.getElementById('embed-input-btn');
  const setVideoStatus = (message, isError = false) => {
    videoStatus.textContent = message;
    videoStatus.classList.toggle('error', isError);
  };
  PLAYLIST.forEach((v, i) => {
    const d = document.createElement('div');
    d.className = 'video-item';
    d.innerHTML = `<span>${v.title}</span><span>▶</span>`;
    d.addEventListener('click', async () => {
      list.querySelectorAll('.video-item').forEach((n) => n.classList.remove('active'));
      d.classList.add('active');
      screen.setMuted(false);
      setVideoStatus(`Loading ${v.title}…`);
      try {
        const selected = await screen.load(v.sources, v.title);
        setVideoStatus(`${v.title} · ${selected.label || selected.type} · rendered VideoTexture verified`);
      } catch (error) {
        setVideoStatus(error instanceof Error ? error.message : String(error), true);
      }
      muteBtn.textContent = screen.state.muted ? '🔇' : '🔊';
    });
    list.appendChild(d);
    void i;
  });
  const showPanel = (v) => {
    panel.classList.toggle('hidden', !v);
    document.body.classList.toggle('panel-open', v);
    if (v && document.pointerLockElement) document.exitPointerLock();
  };
  document.getElementById('menu-btn').addEventListener('click', () => showPanel(true));
  document.getElementById('panel-close').addEventListener('click', () => showPanel(false));
  input.onToggleVideo = () => showPanel(panel.classList.contains('hidden'));

  let hudMode = '';
  const syncEmbedInputButton = () => {
    const isEmbed = screen.state.source === 'embed';
    const interactive = isEmbed && screen.state.embedInteractive;
    const mode = `${isEmbed}:${interactive}`;
    if (mode === hudMode) return;
    hudMode = mode;
    embedInputBtn.hidden = !isEmbed;
    if (!isEmbed) return;
    embedInputBtn.textContent = interactive ? 'LOOK' : 'PLAYER';
    embedInputBtn.classList.toggle('player-active', interactive);
    embedInputBtn.setAttribute('aria-pressed', String(interactive));
    embedInputBtn.setAttribute('aria-label', interactive
      ? 'Return touch control to the camera'
      : 'Enable embedded video player controls');
    embedInputBtn.title = interactive
      ? 'Return control to camera look (I)'
      : 'Enable embedded video controls (I)';
  };
  const toggleEmbedInput = () => {
    if (screen.state.source !== 'embed') return;
    const interactive = screen.setEmbedInteractive(!screen.state.embedInteractive);
    hudMode = '';
    syncEmbedInputButton();
    setVideoStatus(interactive
      ? 'Player controls enabled · tap LOOK when finished'
      : 'Camera look restored · tap PLAYER to use video controls again');
  };
  embedInputBtn.addEventListener('click', toggleEmbedInput);
  input.onToggleScreenInput = toggleEmbedInput;
  document.getElementById('load-url-btn').addEventListener('click', async () => {
    const u = document.getElementById('video-url').value.trim();
    if (!u) return;
    screen.setMuted(false);
    setVideoStatus('Recognising video link…');
    try {
      const selected = await screen.loadUrl(u);
      if (selected.kind === 'embed') {
        setVideoStatus(selected.provider === 'youtube'
          ? 'YouTube ready · tap Play once for sound; camera control then returns automatically · neutral auditorium spill'
          : 'TikTok player ready · tap LOOK after using its controls · neutral auditorium spill');
      } else {
        setVideoStatus(`Direct media · ${selected.label || selected.type} · rendered VideoTexture verified`);
      }
    } catch (error) {
      setVideoStatus(error instanceof Error ? error.message : String(error), true);
    }
    muteBtn.textContent = screen.state.muted ? '🔇' : '🔊';
  });
  document.getElementById('video-upload').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    screen.setMuted(false);
    setVideoStatus(`Loading ${f.name}…`);
    try {
      const selected = await screen.loadFile(f);
      setVideoStatus(`${f.name} · ${selected.label || 'local media'} · rendered VideoTexture verified`);
    } catch (error) {
      setVideoStatus(error instanceof Error ? error.message : String(error), true);
    }
    muteBtn.textContent = screen.state.muted ? '🔇' : '🔊';
  });
  document.getElementById('play-pause-btn').addEventListener('click', () => screen.toggle());
  muteBtn.addEventListener('click', () => {
    screen.setMuted(!screen.state.muted);
    muteBtn.textContent = screen.state.muted ? '🔇' : '🔊';
  });
  const seekBar = document.getElementById('seek-bar');
  seekBar.addEventListener('input', () => screen.seekFraction(seekBar.value / 100));

  /* ---- post processing ---- */
  let composer = null;
  if (!isMobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.40, 0.68, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* ---- resize ---- */
  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
    embedRenderer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);
  addEventListener('orientationchange', () => setTimeout(onResize, 120));

  /* ---- inspector picking ---- */
  const ray = new THREE.Raycaster();
  ray.far = 26;
  const pickTargets = [];
  scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) pickTargets.push(o); });
  let pickedId = '—';
  let pickTimer = 0;
  let lightTimer = 0;

  /* ---- main loop ---- */
  const clock = new THREE.Clock();
  loadingEl.classList.add('hidden');
  setTimeout(() => loadingEl.remove(), 700);

  console.info(
    `%c[Grand Palace Cinema] ${registry.count()} registered assets · press G for the inspection layer`,
    'color:#7ff2ff',
  );

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());

    player.update(dt);
    screen.update(dt);
    screen.updateEmbedVisibility(camera, player.colliders);
    syncEmbedInputButton();

    lightTimer -= dt;
    if (lightTimer <= 0) { lightTimer = 0.12; updateLightPool(camera.position); }

    // Animate only the seats that are actually moving.
    if (dirty.size) {
      for (const s of dirty) {
        s.angle += (s.target - s.angle) * Math.min(1, dt * 9);
        if (Math.abs(s.target - s.angle) < 0.004) { s.angle = s.target; dirty.delete(s); }
        writeHinge(seating.hingedMeshes, s.index, s);
      }
      for (const k of Object.keys(seating.hingedMeshes)) seating.hingedMeshes[k].instanceMatrix.needsUpdate = true;
    }

    if (doorSet.update(dt)) syncColliders();

    // Contextual prompt: doors take priority over seats
    nearDoor = player.mode === 'seated' ? null : doorSet.nearest(player.pos, 2.6);
    nearSeat = findNearSeat();
    const key = input.isTouch ? 'tap USE' : 'press E or click USE';
    if (player.mode === 'seated') {
      promptEl.textContent = input.isTouch ? 'Tap USE to stand up' : 'Esc, E, or click USE to stand up';
      actionBtn.textContent = 'STAND';
      promptEl.classList.add('show');
    } else if (nearDoor) {
      promptEl.textContent = `${nearDoor.label} — ${key} to ${nearDoor.isOpen ? 'close' : 'open'}`;
      actionBtn.textContent = nearDoor.isOpen ? 'CLOSE' : 'OPEN';
      promptEl.classList.add('show');
    } else if (nearSeat) {
      promptEl.textContent = `Seat ${nearSeat.label} — ${key} to sit`;
      actionBtn.textContent = 'SIT';
      promptEl.classList.add('show');
    } else {
      actionBtn.textContent = 'USE';
      promptEl.classList.remove('show');
    }

    if (inspector.enabled) {
      pickTimer -= dt;
      if (pickTimer <= 0) {
        pickTimer = 0.1;
        ray.setFromCamera({ x: 0, y: 0 }, camera);
        const hits = ray.intersectObjects(pickTargets, false);
        const seat = nearSeat;
        pickedId = hits.length && /#/.test(hits[0].object.name)
          ? hits[0].object.name
          : seat ? seat.id : '—';
      }
      inspector.update(pickedId);
    }

    if (screen.video.duration) seekBar.value = String(screen.progress * 100);

    if (composer) composer.render();
    else renderer.render(scene, camera);
    embedRenderer.render(scene, camera);
  }
  frame();

  // Public API — also what an agent drives from the console.
  window.THEATER = {
    root, scene, camera, renderer,
    player, input, screen, inspector, registry, doorSet, walkable,
    playlist: PLAYLIST,
    seats: seating.seats,
    site: building.site,
    goto: (q) => inspector.teleport(q),
    where: () => gridLabel(worldToGrid(player.pos, walkable.levelAt(player.pos.x, player.pos.z))),
    sit: (label) => {
      const s = seating.seats.find((x) => x.label === label || x.id === label);
      if (s) { s.occupied = true; s.target = 0; dirty.add(s); player.sitOn(s); }
      return s?.id;
    },
    openAllDoors: () => { doorSet.doors.forEach((d) => d.open()); },
    closeAllDoors: () => { doorSet.doors.forEach((d) => d.close()); },
    /** Drop the bundled forecourt when embedding in your own world. */
    removeTestEnvironment: () => { building.site.removeFromParent(); },
    validateWalkables,
    playBuiltIn: (index = 0) => screen.load(PLAYLIST[index]?.sources || PLAYLIST[0].sources, PLAYLIST[index]?.title || PLAYLIST[0].title),
    showMediaPanel: showPanel,
    report: () => inspector.refreshReport(),
  };
})();
