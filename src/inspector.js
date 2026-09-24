import * as THREE from 'three';
import { L, floorHeightAt, levelAt } from './layout.js';
import { GRID, registry, report, worldToGrid, gridToWorld, gridLabel, parseGridLabel } from './registry.js';

/* ------------------------------------------------------------------ *
 *  INSPECTION LAYER  —  toggled with a single key: G
 *
 *  Shows: the 1 m world grid, every asset's permanent ID, collision
 *  volumes, and a live floating/buried/overlap report. Includes a
 *  teleport box that accepts either a grid address ("L0-H14-R8") or an
 *  asset ID ("SEAT#47"), so a problem can be described in one line and
 *  reproduced exactly.
 * ------------------------------------------------------------------ */

const LABEL_POOL = 80;
const LABEL_RADIUS = 9;

const labelCache = new Map();
function labelTexture(text, colour = '#8ef0ff') {
  const key = text + colour;
  if (labelCache.has(key)) return labelCache.get(key);
  const pad = 10;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = 'bold 42px ui-monospace, Menlo, Consolas, monospace';
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.width = THREE.MathUtils.ceilPowerOfTwo(w);
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(4,8,12,0.82)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = colour;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  g.font = 'bold 42px ui-monospace, Menlo, Consolas, monospace';
  g.fillStyle = colour;
  g.textBaseline = 'middle';
  g.fillText(text, pad, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const rec = { texture: t, aspect: c.width / c.height };
  labelCache.set(key, rec);
  return rec;
}

function boxEdges(box, out) {
  const { min, max } = box;
  const v = [
    [min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, min.y, max.z], [min.x, min.y, max.z],
    [min.x, max.y, min.z], [max.x, max.y, min.z], [max.x, max.y, max.z], [min.x, max.y, max.z],
  ];
  const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  for (const i of e) out.push(v[i][0], v[i][1], v[i][2]);
}

export class Inspector {
  constructor(scene, camera, player, colliders, walkable = null) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.colliders = colliders;
    this.walkable = walkable;
    this.enabled = false;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.name = 'INSPECTOR';
    scene.add(this.group);

    this._buildGrid();
    this._buildBoxes();
    this._buildLabels();
    this._buildDom();
  }

  _floor(x, z) {
    return this.walkable?.heightAt(x, z) ?? floorHeightAt(z);
  }

  _level(x, z) {
    return this.walkable?.levelAt(x, z) ?? levelAt(z);
  }

  /* ---- 1 m world grid, stepped to follow the seating deck ---- */
  _buildGrid() {
    const pts = [];
    const c = GRID.cell;
    const x0 = -L.halfWidth, x1 = L.halfWidth;
    const z0 = L.screenZ, z1 = L.backZ;
    const eps = 0.012;

    for (let x = Math.ceil(x0); x <= x1; x += c) {
      for (let z = z0; z < z1; z += 0.25) {
        const y0 = this._floor(x, z) + eps;
        const y1v = this._floor(x, z + 0.25) + eps;
        pts.push(x, y0, z, x, y1v, Math.min(z1, z + 0.25));
      }
    }
    for (let z = Math.ceil(z0); z <= z1; z += c) {
      pts.push(x0, this._floor(x0, z) + eps, z, x1, this._floor(x1, z) + eps, z);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x2ad6ff, transparent: true, opacity: 0.22, depthWrite: false });
    this.gridLines = new THREE.LineSegments(g, m);
    this.group.add(this.gridLines);

    // Highlight every 5th line so counting cells by eye is possible.
    const major = [];
    for (let x = Math.ceil(x0); x <= x1; x += c) {
      if (Math.round(x - GRID.originX) % 5 !== 0) continue;
      for (let z = z0; z < z1; z += 0.25) {
        major.push(x, this._floor(x, z) + eps * 2, z, x, this._floor(x, z + 0.25) + eps * 2, Math.min(z1, z + 0.25));
      }
    }
    for (let z = Math.ceil(z0); z <= z1; z += c) {
      if (Math.round(z - GRID.originZ) % 5 !== 0) continue;
      major.push(x0, this._floor(x0, z) + eps * 2, z, x1, this._floor(x1, z) + eps * 2, z);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(major, 3));
    this.gridMajor = new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ color: 0x7ff2ff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.group.add(this.gridMajor);
  }

  /* ---- collision volumes + asset AABBs ---- */
  _buildBoxes() {
    const assetPts = [];
    for (const a of registry.all()) {
      if (a.box.isEmpty()) continue;
      boxEdges(a.box, assetPts);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(assetPts, 3));
    this.assetBoxes = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: 0x39ff9e, transparent: true, opacity: 0.30, depthWrite: false }));
    this.group.add(this.assetBoxes);

    const colPts = [];
    for (const b of this.colliders) boxEdges(b, colPts);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(colPts, 3));
    this.colliderBoxes = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xff5d6c, transparent: true, opacity: 0.5, depthWrite: false }));
    this.group.add(this.colliderBoxes);

    // Problem markers get their own bright, always-on-top boxes.
    this.issueGroup = new THREE.Group();
    this.group.add(this.issueGroup);
  }

  _buildLabels() {
    this.labels = [];
    for (let i = 0; i < LABEL_POOL; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 999;
      this.group.add(s);
      this.labels.push(s);
    }
  }

  _buildDom() {
    const el = document.createElement('div');
    el.id = 'inspector-hud';
    el.innerHTML = `
      <div class="ins-head">INSPECTION LAYER <span class="ins-key">G</span></div>
      <div class="ins-row"><span>Position</span><b id="ins-pos">—</b></div>
      <div class="ins-row"><span>Grid</span><b id="ins-grid">—</b></div>
      <div class="ins-row"><span>Looking at</span><b id="ins-look">—</b></div>
      <div class="ins-row"><span>Assets</span><b id="ins-count">—</b></div>
      <div class="ins-issues" id="ins-issues"></div>
      <div class="ins-tp">
        <input id="ins-tp-input" placeholder="L0-H14-R8  or  SEAT#47" />
        <button id="ins-tp-go">GO</button>
      </div>
      <div class="ins-foot">Grid: L=tier · H=column(+X) · R=row(+Z) · cell 1.00 m</div>
    `;
    document.body.appendChild(el);

    const style = document.createElement('style');
    style.textContent = `
      #inspector-hud{position:fixed;top:12px;left:12px;z-index:70;display:none;width:330px;max-width:calc(100vw - 24px);
        background:rgba(4,10,14,.88);border:1px solid rgba(42,214,255,.45);border-radius:10px;color:#bfeeff;
        font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:10px 12px;backdrop-filter:blur(4px)}
      #inspector-hud.on{display:block}
      .ins-head{font-weight:700;letter-spacing:.1em;color:#7ff2ff;margin-bottom:8px;display:flex;justify-content:space-between}
      .ins-key{background:rgba(42,214,255,.18);border:1px solid rgba(42,214,255,.5);border-radius:4px;padding:0 6px}
      .ins-row{display:flex;justify-content:space-between;gap:10px}
      .ins-row b{color:#eaffff;font-weight:600;text-align:right}
      .ins-issues{margin-top:8px;max-height:170px;overflow:auto;border-top:1px solid rgba(42,214,255,.25);padding-top:6px}
      .ins-issue{color:#ffb4bd;margin-bottom:4px;cursor:pointer}
      .ins-issue:hover{color:#fff}
      .ins-ok{color:#7bffb0}
      .ins-tp{display:flex;gap:6px;margin-top:8px}
      #ins-tp-input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid rgba(42,214,255,.35);
        color:#eaffff;border-radius:5px;padding:5px 7px;font:16px ui-monospace,monospace}
      #ins-tp-go{background:rgba(42,214,255,.2);border:1px solid rgba(42,214,255,.5);color:#bfeeff;border-radius:5px;padding:5px 10px;cursor:pointer}
      .ins-foot{margin-top:7px;opacity:.55;font-size:10.5px}
      @media(max-width:640px){#inspector-hud{width:calc(100vw - 24px);font-size:11px}.ins-issues{max-height:110px}}
    `;
    document.head.appendChild(style);

    this.dom = {
      root: el,
      pos: el.querySelector('#ins-pos'),
      grid: el.querySelector('#ins-grid'),
      look: el.querySelector('#ins-look'),
      count: el.querySelector('#ins-count'),
      issues: el.querySelector('#ins-issues'),
      input: el.querySelector('#ins-tp-input'),
      go: el.querySelector('#ins-tp-go'),
    };
    this.dom.go.addEventListener('click', () => this.teleport(this.dom.input.value));
    this.dom.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.teleport(this.dom.input.value);
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    this.group.visible = this.enabled;
    this.dom.root.classList.toggle('on', this.enabled);
    if (this.enabled) this.refreshReport();
  }

  refreshReport() {
    const r = report();
    this.dom.count.textContent = `${r.total} in ${Object.keys(r.counts).length} types`;
    this.issueGroup.clear();

    if (!r.issues.length) {
      this.dom.issues.innerHTML = `<div class="ins-ok">✓ Assets and rendered walkable surfaces agree.</div>`;
    } else {
      const shown = r.issues.slice(0, 60);
      this.dom.issues.innerHTML = shown
        .map((i, k) => `<div class="ins-issue" data-k="${k}">▸ ${i.kind} ${i.id} @ ${i.grid}<br/>&nbsp;&nbsp;${i.detail}</div>`)
        .join('') + (r.issues.length > shown.length ? `<div class="ins-issue">…${r.issues.length - shown.length} more</div>` : '');
      this.dom.issues.querySelectorAll('.ins-issue[data-k]').forEach((n) => {
        n.addEventListener('click', () => {
          const i = shown[+n.dataset.k];
          this.teleportTo(i.pos);
        });
      });

      for (const i of r.issues.slice(0, 40)) {
        const a = registry.get(i.id);
        if (!a || a.box.isEmpty()) continue;
        const pts = [];
        boxEdges(a.box, pts);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.issueGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
          color: i.kind === 'FLOATING' ? 0xffe14d : i.kind === 'BURIED' ? 0xff7a1a : 0xff2fd0,
          depthTest: false, transparent: true, opacity: 0.95,
        })));
      }
    }
    console.info('[INSPECT] asset report', r);
    return r;
  }

  teleport(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const g = parseGridLabel(q);
    if (g) {
      const w = gridToWorld(g.col, g.row);
      this.teleportTo(w);
      return;
    }
    const a = registry.get(q.toUpperCase()) || registry.all().find((x) => x.id.toLowerCase() === q.toLowerCase());
    if (a) this.teleportTo(a.pos, a);
    else this.dom.input.value = `? ${q}`;
  }

  teleportTo(worldPos, asset = null) {
    const p = this.player;
    p.mode = 'walk';
    p.seat = null;
    const z = THREE.MathUtils.clamp(worldPos.z + 1.6, L.screenZ + 3.2, L.backZ - 0.9);
    p.pos.set(worldPos.x, this._floor(worldPos.x, z), z);
    p.vel.set(0, 0, 0);
    if (asset) {
      const dir = new THREE.Vector3().subVectors(asset.pos, new THREE.Vector3(p.pos.x, p.pos.y + 1.68, p.pos.z));
      p.yaw = Math.atan2(-dir.x, -dir.z);
      p.pitch = THREE.MathUtils.clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -1.2, 1.2);
    }
  }

  /** Called every frame; only does work while the layer is on. */
  update(pickedId) {
    if (!this.enabled) return;

    const cam = this.camera.position;
    const lvl = this._level(cam.x, cam.z);
    const g = worldToGrid(cam, lvl);
    this.dom.pos.textContent = `${cam.x.toFixed(2)}, ${cam.y.toFixed(2)}, ${cam.z.toFixed(2)}`;
    this.dom.grid.textContent = gridLabel(g);
    this.dom.look.textContent = pickedId || '—';

    // Nearest assets get a floating ID label; the pool is reused so this
    // stays cheap no matter how many assets exist.
    const near = [];
    for (const a of registry.all()) {
      const d = a.pos.distanceToSquared(cam);
      if (d < LABEL_RADIUS * LABEL_RADIUS) near.push([d, a]);
    }
    near.sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < this.labels.length; i++) {
      const s = this.labels[i];
      const rec = near[i];
      if (!rec) { s.visible = false; continue; }
      const a = rec[1];
      const isPick = a.id === pickedId;
      const { texture, aspect } = labelTexture(`${a.id} ${a.gridLabel}`, isPick ? '#ffe14d' : '#8ef0ff');
      s.material.map = texture;
      s.material.needsUpdate = true;
      const h = isPick ? 0.115 : 0.072;
      s.scale.set(h * aspect, h, 1);
      s.position.copy(a.pos);
      s.position.y = a.box.isEmpty() ? a.pos.y : a.box.max.y + h * 0.9;
      s.visible = true;
    }
  }
}
