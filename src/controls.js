import * as THREE from 'three';
import { floorHeightAt } from './layout.js';

const EYE = 1.68;
const RADIUS = 0.26;
const WALK = 3.1;
const RUN = 5.4;
const ACCEL = 16;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

export class Player {
  constructor(camera, colliders, walkable = null) {
    this.camera = camera;
    this.colliders = colliders;
    this.walkable = walkable;
    this.pos = new THREE.Vector3(0, 0, 6.5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;            // rotation.y = 0 looks down -Z, toward the screen
    this.pitch = -0.06;
    this.mode = 'walk';
    this.seat = null;
    this.seatBlend = 0;
    this.seatTarget = new THREE.Vector3();
    this.bob = 0;
    this.keys = new Set();
    this.move = new THREE.Vector2(); // analog input, -1..1
    this.look = new THREE.Vector2(); // per-frame look delta
    this.run = false;
    this._tmpBox = new THREE.Box3();
  }

  setColliders(list) { this.colliders = list; }

  floorAt(x, z) {
    return this.walkable?.heightAt(x, z) ?? floorHeightAt(z);
  }

  /** Slide-along-surface AABB resolution, one axis at a time. */
  _collide(next) {
    // Use the lower of the current and candidate floors while resolving
    // vertical overlap. Otherwise a tall obstacle with a walkable top (the
    // 1.1 m stage) would exclude itself after the height query and let the
    // player snap straight up through its collider.
    const feet = Math.min(this.pos.y, this.floorAt(next.x, next.z));
    const lo = feet + 0.25, hi = feet + EYE;
    for (const b of this.colliders) {
      if (b.max.y < lo || b.min.y > hi) continue;
      const cx = THREE.MathUtils.clamp(next.x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(next.z, b.min.z, b.max.z);
      const dx = next.x - cx, dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        next.x = cx + (dx / d) * RADIUS;
        next.z = cz + (dz / d) * RADIUS;
      } else {
        // Centre is inside the box — push out along the shallowest axis.
        const px = Math.min(next.x - b.min.x, b.max.x - next.x);
        const pz = Math.min(next.z - b.min.z, b.max.z - next.z);
        if (px < pz) next.x += (next.x < (b.min.x + b.max.x) / 2 ? -1 : 1) * (px + RADIUS);
        else next.z += (next.z < (b.min.z + b.max.z) / 2 ? -1 : 1) * (pz + RADIUS);
      }
    }
    return next;
  }

  sitOn(seat) {
    this.mode = 'seated';
    this.seat = seat;
    this.seatTarget.copy(seat.eye);
    this.seatBlend = 0;
    // Sitting down from an adjacent tile is a short, pleasant glide. Being
    // placed in a seat from across the building (teleport, or the public
    // sit() API) must snap, or the camera interpolates straight through
    // rows of seats and walls on the way there.
    if (this.camera.position.distanceTo(seat.eye) > 2.0) {
      this.camera.position.copy(seat.eye);
      this.pos.set(seat.pos.x, seat.floorY, seat.pos.z);
    }
  }

  stand() {
    if (!this.seat) return;
    const z = this.seat.pos.z - 0.72;
    this.pos.set(this.seat.pos.x, this.floorAt(this.seat.pos.x, z), z);
    this.mode = 'walk';
    this.seat = null;
    this.seatBlend = 0;
  }

  update(dt) {
    // ---- look ----
    this.yaw -= this.look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch - this.look.y, -PITCH_LIMIT, PITCH_LIMIT);
    this.look.set(0, 0);

    if (this.mode === 'seated') {
      this.seatBlend = Math.min(1, this.seatBlend + dt * 3.4);
      const e = 1 - Math.pow(1 - this.seatBlend, 3);
      this.camera.position.lerpVectors(
        this.camera.position,
        this.seatTarget,
        Math.min(1, dt * 9),
      );
      if (this.seatBlend < 0.02) this.camera.position.copy(this.seatTarget);
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      void e;
      return;
    }

    // ---- keyboard -> analog ----
    let ix = this.move.x, iz = this.move.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    const speed = (this.run || this.keys.has('ShiftLeft')) ? RUN : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // yaw 0 looks down -Z; forward = (-sin, -cos)
    const wantX = (ix * cos + iz * sin) * speed;
    const wantZ = (-ix * sin + iz * cos) * speed;

    this.vel.x = THREE.MathUtils.damp(this.vel.x, wantX, ACCEL, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, wantZ, ACCEL, dt);

    const next = this.pos.clone();
    next.x += this.vel.x * dt;
    next.z += this.vel.z * dt;
    this._collide(next);
    this.pos.copy(next);
    this.pos.y = this.floorAt(this.pos.x, this.pos.z);

    // Head bob, scaled by actual ground speed
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * sp * 2.2;
    const bobY = Math.sin(this.bob * 2) * 0.022 * Math.min(1, sp / WALK);
    const bobX = Math.cos(this.bob) * 0.014 * Math.min(1, sp / WALK);

    this.camera.position.set(
      this.pos.x + bobX * cos,
      this.pos.y + EYE + bobY,
      this.pos.z - bobX * sin,
    );
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}

/* ------------------------------------------------------------------ *
 *  Input wiring: pointer-lock on desktop, twin-zone touch on mobile.
 *  The joystick is fully transparent until a finger lands on the left
 *  45% of the screen, then it materialises under that finger.
 * ------------------------------------------------------------------ */
export function bindInput(player, dom) {
  const { canvas, joyZone, joyBase, joyNub, lookZone, clickToPlay } = dom;
  const isTouch = matchMedia('(hover:none) and (pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('is-touch', isTouch);

  const state = {
    locked: false,
    playing: false,
    isTouch,
    onAction: null,
    onToggleInspect: null,
    onToggleVideo: null,
    onToggleScreenInput: null,
  };

  // Safari exposes legacy gesture events in addition to pointer events. The
  // theater is a full-screen game surface, so viewport pinch/double-tap zoom
  // is never useful here. (Touches inside a cross-origin provider iframe are
  // handled separately by VideoScreen's explicit PLAYER / LOOK ownership.)
  if (isTouch) {
    const preventViewportGesture = (event) => event.preventDefault();
    document.addEventListener('gesturestart', preventViewportGesture, { passive: false });
    document.addEventListener('gesturechange', preventViewportGesture, { passive: false });
    document.addEventListener('gestureend', preventViewportGesture, { passive: false });
  }

  /* ---- keyboard ---- */
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable) return;
    player.keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); state.onAction?.(); }
    if (e.code === 'KeyG') { e.preventDefault(); state.onToggleInspect?.(); }
    if (e.code === 'KeyM') { e.preventDefault(); state.onToggleVideo?.(); }
    if (e.code === 'KeyI') { e.preventDefault(); state.onToggleScreenInput?.(); }
    if (e.code === 'Escape' && player.mode === 'seated') player.stand();
  });
  addEventListener('keyup', (e) => player.keys.delete(e.code));
  addEventListener('blur', () => player.keys.clear());

  /* ---- mouse look ---- */
  const onMouseMove = (e) => {
    if (!state.locked) return;
    player.look.x += e.movementX * 0.0022;
    player.look.y += e.movementY * 0.0022;
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('pointer-locked', state.locked);
    if (!state.locked && !isTouch && state.playing) {
      clickToPlay.classList.remove('hidden');
      dom.enterBtn.textContent = 'Resume Theater';
    }
  });

  const start = () => {
    clickToPlay.classList.add('hidden');
    document.body.classList.add('playing');
    state.playing = true;
    dom.enterBtn.textContent = 'Resume Theater';
    if (!isTouch) canvas.requestPointerLock();
  };
  clickToPlay.addEventListener('click', start);
  dom.enterBtn.addEventListener('click', (e) => { e.stopPropagation(); start(); });

  /* ---- touch: left joystick ---- */
  let joyId = null;
  const joyOrigin = new THREE.Vector2();
  const MAXR = 52;

  joyZone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    e.preventDefault();
    joyId = e.pointerId;
    joyZone.setPointerCapture(e.pointerId);
    joyOrigin.set(e.clientX, e.clientY);
    joyBase.style.left = `${e.clientX}px`;
    joyBase.style.top = `${e.clientY}px`;
    joyBase.classList.add('active');
    joyNub.style.transform = 'translate(0,0)';
  });
  joyZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    e.preventDefault();
    let dx = e.clientX - joyOrigin.x;
    let dy = e.clientY - joyOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > MAXR) { dx = (dx / d) * MAXR; dy = (dy / d) * MAXR; }
    joyNub.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 6;
    const m = Math.hypot(dx, dy);
    if (m < dead) { player.move.set(0, 0); return; }
    const k = ((m - dead) / (MAXR - dead)) / m;
    player.move.set(dx * k, dy * k);
    player.run = m > MAXR * 0.92;
  });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joyBase.classList.remove('active');
    player.move.set(0, 0);
    player.run = false;
  };
  joyZone.addEventListener('pointerup', endJoy);
  joyZone.addEventListener('pointercancel', endJoy);
  joyZone.addEventListener('lostpointercapture', endJoy);

  /* ---- touch: right look ---- */
  let lookId = null;
  const lookPrev = new THREE.Vector2();
  lookZone.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    e.preventDefault();
    lookId = e.pointerId;
    lookZone.setPointerCapture(e.pointerId);
    lookPrev.set(e.clientX, e.clientY);
  });
  lookZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    e.preventDefault();
    player.look.x += (e.clientX - lookPrev.x) * 0.0042;
    player.look.y += (e.clientY - lookPrev.y) * 0.0042;
    lookPrev.set(e.clientX, e.clientY);
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', endLook);
  lookZone.addEventListener('lostpointercapture', endLook);

  const resetTouch = () => {
    joyId = null;
    lookId = null;
    joyBase.classList.remove('active');
    joyNub.style.transform = 'translate(0,0)';
    player.move.set(0, 0);
    player.look.set(0, 0);
    player.run = false;
  };
  addEventListener('blur', resetTouch);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetTouch(); });
  state.resetTouch = resetTouch;

  return state;
}
