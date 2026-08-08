import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { L } from './layout.js';
import { register } from './registry.js';

/* Blender Foundation open movies, all released under Creative Commons
 * Attribution. Served from Wikimedia Commons, which sets
 * `access-control-allow-origin: *` — required so the frames can be sampled
 * back out of the canvas to drive the auditorium lighting. */
const WM = 'https://upload.wikimedia.org/wikipedia/commons/transcoded';
export const PLAYLIST = [
  { title: 'Big Buck Bunny (CC-BY)', url: `${WM}/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm` },
  { title: 'Sintel (CC-BY)', url: `${WM}/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm` },
  { title: 'Tears of Steel (CC-BY)', url: `${WM}/1/10/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm.480p.vp9.webm` },
  { title: 'Elephants Dream (CC-BY)', url: `${WM}/a/a2/Elephants_Dream_%282006%29.webm/Elephants_Dream_%282006%29.webm.480p.vp9.webm` },
  { title: 'Spring (CC-BY)', url: `${WM}/a/a5/Spring_-_Blender_Open_Movie.webm/Spring_-_Blender_Open_Movie.webm.480p.vp9.webm` },
  { title: 'Coffee Run (CC-BY)', url: `${WM}/3/3f/Coffee_Run_-_Blender_Open_Movie-full_movie.webm/Coffee_Run_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm` },
  { title: 'HERO (CC-BY)', url: `${WM}/a/a9/HERO_-_Blender_Open_Movie-full_movie.webm/HERO_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm` },
  { title: 'Caminandes: Gran Dillama (CC-BY)', url: `${WM}/7/7c/Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm/Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm.480p.vp9.webm` },
  { title: 'Glass Half (CC-BY)', url: `${WM}/0/02/Glass_Half_-_Blender_Open_Movie-full_movie.webm/Glass_Half_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm` },
  { title: 'The Daily Dweebs (CC-BY)', url: `${WM}/b/b2/The_Daily_Dweebs_-_Blender_Open_Movie-full_movie.webm/The_Daily_Dweebs_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm` },
];

/** Academy-style countdown leader, drawn live so the screen is never black. */
class Leader {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 428;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const { ctx: c, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const n = 8 - Math.floor(this.t % 8);

    c.fillStyle = '#0d0d10';
    c.fillRect(0, 0, W, H);

    // Sweep hand
    c.save();
    c.translate(W / 2, H / 2);
    const R = H * 0.42;
    c.strokeStyle = 'rgba(200,205,215,0.30)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(-W / 2, 0); c.lineTo(W / 2, 0); c.stroke();
    c.beginPath(); c.moveTo(0, -H / 2); c.lineTo(0, H / 2); c.stroke();

    const a = (this.t % 1) * Math.PI * 2 - Math.PI / 2;
    c.strokeStyle = 'rgba(235,240,250,0.85)';
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); c.stroke();

    c.fillStyle = '#e8ecf5';
    c.font = `bold ${Math.round(H * 0.55)}px Georgia, serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(n), 0, 6);
    c.restore();

    // Film grain + gate weave
    const g = c.getImageData(0, 0, W, H);
    for (let i = 0; i < g.data.length; i += 4 * 13) {
      const v = (Math.random() - 0.5) * 42;
      g.data[i] += v; g.data[i + 1] += v; g.data[i + 2] += v;
    }
    c.putImageData(g, 0, 0);

    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(0, 0, W, 3);
    this.texture.needsUpdate = true;
  }
}

export class VideoScreen {
  constructor(scene) {
    RectAreaLightUniformsLib.init();

    this.leader = new Leader();
    this.sampling = true;
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCanvas.width = this.sampleCanvas.height = 12;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    this._frame = 0;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.playsInline = true;
    video.muted = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // Must live in the document: a detached <video> is deprioritised in
    // background tabs and refuses to decode at all on iOS Safari.
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(video);
    this.video = video;

    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    this.material = new THREE.MeshBasicMaterial({
      map: this.leader.texture,
      toneMapped: false,
      color: 0xffffff,
    });

    const geo = new THREE.PlaneGeometry(L.screenW, L.screenH, 24, 12);
    // Very slight cylindrical curve, as a real large-format screen has.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, -Math.pow(x / (L.screenW / 2), 2) * 0.38);
    }
    geo.computeVertexNormals();

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(0, L.screenBottom + L.screenH / 2, L.screenPlaneZ);
    this.mesh.name = 'SCREEN#0';
    scene.add(this.mesh);

    register('SCREEN', {
      box: new THREE.Box3().setFromObject(this.mesh),
      pos: this.mesh.position.clone(),
      object: this.mesh,
      solid: false,
      level: -1,
      meta: { aspect: (L.screenW / L.screenH).toFixed(2) },
    });

    // Screen spill — the dominant light source in the room.
    this.light = new THREE.RectAreaLight(0xffffff, 9.0, L.screenW * 0.94, L.screenH * 0.94);
    this.light.position.copy(this.mesh.position);
    this.light.position.z += 0.25;
    this.light.lookAt(0, L.screenBottom + L.screenH / 2, 0);
    scene.add(this.light);

    // Secondary bounce off the auditorium floor
    this.bounce = new THREE.RectAreaLight(0xffffff, 2.2, L.screenW, 6);
    this.bounce.position.set(0, 1.2, L.screenPlaneZ + 2.5);
    this.bounce.rotation.x = -Math.PI / 2.6;
    scene.add(this.bounce);

    this.state = { playing: false, muted: true, source: 'leader', title: 'Countdown Leader' };
  }

  load(url, title) {
    this.video.pause();
    this.video.src = url;
    this.video.load();
    this.state.title = title || url;
    this.state.source = 'video';
    const onReady = () => {
      this.material.map = this.videoTexture;
      this.material.needsUpdate = true;
      this.play();
    };
    this.video.addEventListener('loadeddata', onReady, { once: true });
    this.video.addEventListener('error', () => {
      this.material.map = this.leader.texture;
      this.material.needsUpdate = true;
      this.state.source = 'leader';
      this.state.title = 'Source unavailable — countdown leader';
    }, { once: true });
  }

  loadFile(file) {
    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = URL.createObjectURL(file);
    this.video.crossOrigin = null;
    this.load(this._objectUrl, file.name);
  }

  play() { this.video.play().then(() => { this.state.playing = true; }).catch(() => {}); }
  pause() { this.video.pause(); this.state.playing = false; }
  toggle() { this.state.playing ? this.pause() : this.play(); }
  setMuted(m) { this.video.muted = m; this.state.muted = m; }
  seekFraction(f) { if (this.video.duration) this.video.currentTime = f * this.video.duration; }
  get progress() { return this.video.duration ? this.video.currentTime / this.video.duration : 0; }

  update(dt) {
    if (this.state.source === 'leader') this.leader.update(dt);

    // Drive the room lighting from the average screen colour, a few frames
    // apart. This is what makes the auditorium flicker with the film.
    this._frame++;
    if (this._frame % 4 !== 0) return;
    let r = 0.6, g = 0.6, b = 0.62, lum = 0.55;
    try {
      const src = this.state.source === 'video' ? this.video : this.leader.canvas;
      if (this.state.source === 'video' && this.video.readyState < 2) return;
      this.sampleCtx.drawImage(src, 0, 0, 12, 12);
      const d = this.sampleCtx.getImageData(0, 0, 12, 12).data;
      let sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }
      const n = d.length / 4;
      r = sr / n / 255; g = sg / n / 255; b = sb / n / 255;
      lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    } catch {
      this.sampling = false;
    }
    const boost = 1 / Math.max(0.18, lum);
    this.light.color.setRGB(
      Math.min(1, r * boost * 0.55 + 0.30),
      Math.min(1, g * boost * 0.55 + 0.30),
      Math.min(1, b * boost * 0.55 + 0.32),
    );
    this.light.intensity = THREE.MathUtils.lerp(this.light.intensity, 3.5 + lum * 13, 0.3);
    this.bounce.color.copy(this.light.color);
    this.bounce.intensity = this.light.intensity * 0.22;
    this.material.color.setScalar(1);
  }
}
