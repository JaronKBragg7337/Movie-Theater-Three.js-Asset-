import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { L } from './layout.js';
import { register } from './registry.js';
import { embedUrlFor, rankPlayableSources, resolveVideoUrl } from './media.js';

/* Blender Foundation open movies, released under Creative Commons
 * Attribution. Each title has a Safari/iPhone-safe H.264/AAC MP4 from
 * Blender's official PeerTube service plus the existing VP9/Opus Wikimedia
 * transcode. The browser chooses a decodable candidate and load() falls back
 * to the next candidate if a decoded GPU frame cannot be produced. */
const WM = 'https://upload.wikimedia.org/wikipedia/commons/transcoded';
const BV = 'https://video.blender.org/object-storage/web_videos';
const MP4 = 'video/mp4; codecs="avc1.64001f, mp4a.40.2"';
const MP4_MAIN = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
const WEBM = 'video/webm; codecs="vp9, opus"';

const source = (url, type, label) => ({ url, type, label });
const pair = (mp4, webm, mp4Type = MP4) => [
  source(mp4, mp4Type, 'H.264 MP4'),
  source(webm, WEBM, 'VP9 WebM'),
];

export const PLAYLIST = [
  {
    title: 'Big Buck Bunny (CC-BY)',
    sources: pair(
      `${BV}/bf1f3fb5-b119-4f9f-9930-8e20e892b898-480.mp4`,
      `${WM}/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'Sintel (CC-BY)',
    sources: pair(
      `${BV}/0eb052d0-fd51-43e6-aa33-ecdbf77a5d40-480.mp4`,
      `${WM}/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'Tears of Steel (CC-BY)',
    sources: pair(
      `${BV}/8533ea43-4271-4a57-9694-e9d0b35e1aa1-480.mp4`,
      `${WM}/1/10/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'Elephants Dream (CC-BY)',
    sources: pair(
      `${BV}/cccc3e60-0291-4ecc-aa56-39b2e2c7d0d5-480.mp4`,
      `${WM}/a/a2/Elephants_Dream_%282006%29.webm/Elephants_Dream_%282006%29.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'Spring (CC-BY)',
    sources: pair(
      `${BV}/3d95fb3d-c866-42c8-9db1-fe82f48ccb95-480.mp4`,
      `${WM}/a/a5/Spring_-_Blender_Open_Movie.webm/Spring_-_Blender_Open_Movie.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'Coffee Run (CC-BY)',
    sources: pair(
      `${BV}/ff8fe61b-026f-4f07-b66b-2a790d6f6ab1-480.mp4`,
      `${WM}/3/3f/Coffee_Run_-_Blender_Open_Movie-full_movie.webm/Coffee_Run_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'HERO (CC-BY)',
    sources: pair(
      `${BV}/6c79205c-bd3a-42b5-a8a2-ce7a2a166154-536.mp4`,
      `${WM}/a/a9/HERO_-_Blender_Open_Movie-full_movie.webm/HERO_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm`,
      MP4_MAIN,
    ),
  },
  {
    title: 'Caminandes: Gran Dillama (CC-BY)',
    sources: pair(
      `${BV}/fb70d459-48d2-4db5-adba-813c84f9200a-480.mp4`,
      `${WM}/7/7c/Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm/Caminandes_-_Gran_Dillama_-_Blender_Foundation%27s_new_Open_Movie.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'Glass Half (CC-BY)',
    sources: pair(
      `${BV}/64222c8a-c4c7-4b3b-9850-7fb2078edcf6-480.mp4`,
      `${WM}/0/02/Glass_Half_-_Blender_Open_Movie-full_movie.webm/Glass_Half_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm`,
    ),
  },
  {
    title: 'The Daily Dweebs (CC-BY)',
    sources: pair(
      `${BV}/7b2eff2a-35f2-4403-9d88-d0dd6e4b5ba1-480.mp4`,
      `${WM}/b/b2/The_Daily_Dweebs_-_Blender_Open_Movie-full_movie.webm/The_Daily_Dweebs_-_Blender_Open_Movie-full_movie.webm.480p.vp9.webm`,
    ),
  },
];

function waitForLoadedData(video, timeoutMs = 25000) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for decoded video data.')), timeoutMs);
    const onReady = () => finish();
    const onError = () => finish(new Error(video.error?.message || `Media error ${video.error?.code || ''}`.trim()));
    const finish = (error = null) => {
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      if (error) reject(error); else resolve();
    };
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}
function waitForPresentedFrame(video, timeoutMs = 5000) {
  if (typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    video.requestVideoFrameCallback(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

let youtubeApiPromise = null;

/** Load YouTube's supported iframe controller once and preserve any host callback. */
function loadYouTubeIframeApi(timeoutMs = 15000) {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out loading the YouTube player controls.')), timeoutMs);
    const previousReady = globalThis.onYouTubeIframeAPIReady;
    globalThis.onYouTubeIframeAPIReady = () => {
      try {
        if (typeof previousReady === 'function') previousReady();
      } finally {
        clearTimeout(timeout);
        resolve(globalThis.YT);
      }
    };

    let script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('error', () => {
      clearTimeout(timeout);
      youtubeApiPromise = null;
      reject(new Error('YouTube player controls could not be loaded.'));
    }, { once: true });
  });
  const pending = youtubeApiPromise;
  pending.catch(() => {
    if (youtubeApiPromise === pending) youtubeApiPromise = null;
  });
  return youtubeApiPromise;
}

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
  constructor(scene, renderer) {
    RectAreaLightUniformsLib.init();
    this.scene = scene;
    this.renderer = renderer;
    this.leader = new Leader();
    this._frame = 0;
    this._loadToken = 0;
    this._objectUrl = null;
    this.embedObject = null;
    this.embedIframe = null;
    this.embedProvider = null;
    this.youtubePlayer = null;
    this._embedInitializing = false;
    this._embedInputReleaseTimer = null;
    this._embedTarget = new THREE.Vector3();
    this._embedDirection = new THREE.Vector3();
    this._embedHit = new THREE.Vector3();
    this._embedRay = new THREE.Ray();
    this._resetSampler();

    const video = document.createElement('video');
    video.loop = true;
    video.playsInline = true;
    video.muted = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // iOS deprioritises detached media elements and may never submit a frame.
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

    this.light = new THREE.RectAreaLight(0xffffff, 9.0, L.screenW * 0.94, L.screenH * 0.94);
    this.light.position.copy(this.mesh.position);
    this.light.position.z += 0.25;
    this.light.lookAt(0, L.screenBottom + L.screenH / 2, 0);
    scene.add(this.light);

    this.bounce = new THREE.RectAreaLight(0xffffff, 2.2, L.screenW, 6);
    this.bounce.position.set(0, 1.2, L.screenPlaneZ + 2.5);
    this.bounce.rotation.x = -Math.PI / 2.6;
    scene.add(this.bounce);

    this._buildTextureVerifier();
    this.state = {
      playing: false,
      muted: true,
      source: 'leader',
      title: 'Countdown Leader',
      selectedFormat: null,
      decodedFrame: false,
      sampling: true,
      renderCheck: null,
      providerReady: false,
      needsUserGesture: false,
      embedInteractive: false,
      error: null,
    };
  }

  _resetSampler() {
    this.sampling = true;
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCanvas.width = this.sampleCanvas.height = 12;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    this.lastFrameSample = null;
  }

  _buildTextureVerifier() {
    this._verifyTarget = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this._verifyScene = new THREE.Scene();
    this._verifyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this._verifyCamera.position.z = 1;
    this._verifyMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture, toneMapped: false });
    this._verifyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._verifyMaterial));
    this._verifyPixels = new Uint8Array(4 * 4 * 4);
  }

  /** Prove that the decoded frame can be uploaded and drawn by WebGL. */
  verifyRenderedVideoTexture() {
    if (!this.renderer || this.state.source !== 'video') {
      return { ok: false, reason: 'No active VideoTexture.' };
    }
    const gl = this.renderer.getContext();
    while (gl.getError() !== gl.NO_ERROR) { /* clear prior errors */ }
    const previousTarget = this.renderer.getRenderTarget();
    try {
      this.videoTexture.needsUpdate = true;
      this.renderer.setRenderTarget(this._verifyTarget);
      this.renderer.clear();
      this.renderer.render(this._verifyScene, this._verifyCamera);
      this.renderer.readRenderTargetPixels(this._verifyTarget, 0, 0, 4, 4, this._verifyPixels);
      const error = gl.getError();
      let alpha = 0;
      let luminance = 0;
      for (let i = 0; i < this._verifyPixels.length; i += 4) {
        alpha += this._verifyPixels[i + 3];
        luminance += 0.2126 * this._verifyPixels[i] + 0.7152 * this._verifyPixels[i + 1] + 0.0722 * this._verifyPixels[i + 2];
      }
      const pixels = this._verifyPixels.length / 4;
      const averageAlpha = alpha / pixels;
      const averageLuminance = luminance / pixels;
      const plausibleFrame = this.video.videoWidth >= 16 && this.video.videoHeight >= 16;
      const ok = error === gl.NO_ERROR && averageAlpha > 0 && plausibleFrame;
      return {
        ok,
        glError: error,
        averageAlpha,
        averageLuminance,
        videoWidth: this.video.videoWidth,
        videoHeight: this.video.videoHeight,
        ...(!ok && {
          reason: plausibleFrame
            ? 'The WebGL render target did not receive a valid texture frame.'
            : `The media backend exposed only a ${this.video.videoWidth}×${this.video.videoHeight} placeholder frame.`,
        }),
      };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    } finally {
      this.renderer.setRenderTarget(previousTarget);
    }
  }

  _releaseObjectUrl() {
    if (!this._objectUrl) return;
    URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = null;
  }

  _clearEmbed() {
    clearTimeout(this._embedInputReleaseTimer);
    this._embedInputReleaseTimer = null;
    if (this.youtubePlayer) {
      try { this.youtubePlayer.destroy(); } catch { /* already detached */ }
    }
    this.youtubePlayer = null;
    this.embedObject?.removeFromParent();
    this.embedObject?.element?.remove();
    this.embedObject = null;
    this.embedIframe = null;
    this.embedProvider = null;
    this._embedInitializing = false;
    if (this.state) this.state.embedInteractive = false;
  }

  /** Decide whether the provider iframe or the world receives pointer input. */
  setEmbedInteractive(enabled) {
    const interactive = Boolean(enabled && this.embedObject && this.embedIframe);
    const pointerEvents = interactive && !this._embedInitializing ? 'auto' : 'none';
    if (this.embedObject?.element) {
      this.embedObject.element.style.pointerEvents = pointerEvents;
      this.embedObject.element.dataset.inputOwner = interactive ? 'player' : 'world';
    }
    if (this.embedIframe) {
      this.embedIframe.style.pointerEvents = pointerEvents;
      this.embedIframe.tabIndex = interactive ? 0 : -1;
      if (!interactive) this.embedIframe.blur();
    }
    if (this.state) this.state.embedInteractive = interactive;
    return interactive;
  }

  _finishEmbedInitialization() {
    if (!this._embedInitializing) return;
    this._embedInitializing = false;
    if (this.embedObject?.element) this.embedObject.element.style.opacity = '1';
    if (this.embedObject) this.embedObject.visible = false;
    this.setEmbedInteractive(this.state.embedInteractive);
  }

  _returnInputToWorldAfterPlayback() {
    if (this._embedInputReleaseTimer !== null || !this.state.embedInteractive) return;
    // Run after the provider's current pointer event has completed. The next
    // tap/drag then lands on the theater's look zone instead of becoming an
    // iframe double-tap zoom or pan gesture.
    this._embedInputReleaseTimer = setTimeout(() => {
      this._embedInputReleaseTimer = null;
      if (this.state.source === 'embed') this.setEmbedInteractive(false);
    }, 0);
  }

  _showLeader(title = 'Countdown Leader') {
    this.video.pause();
    this._clearEmbed();
    this.material.map = this.leader.texture;
    this.material.color.setHex(0xffffff);
    this.material.needsUpdate = true;
    Object.assign(this.state, {
      playing: false,
      source: 'leader',
      title,
      selectedFormat: null,
      decodedFrame: false,
      sampling: true,
      renderCheck: null,
      providerReady: false,
      needsUserGesture: false,
      embedInteractive: false,
    });
  }

  async _loadVideoSource(candidate, title, token) {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    if (candidate.local) this.video.removeAttribute('crossorigin');
    else this.video.crossOrigin = 'anonymous';
    this.video.src = candidate.url;
    this.video.load();

    // Called synchronously from the user's click/change handler. This is
    // important on iOS: waiting for loadeddata would lose transient playback
    // activation and turn a valid source into an autoplay-policy failure.
    const playAttempt = this.video.play().then(() => true).catch(() => false);
    await waitForLoadedData(this.video);
    if (token !== this._loadToken) throw new Error('Superseded by a newer source.');
    await waitForPresentedFrame(this.video);
    if (!this.video.videoWidth || !this.video.videoHeight) throw new Error('The source loaded but produced no decoded video dimensions.');

    this._resetSampler();
    this.sampleCtx.drawImage(this.video, 0, 0, 12, 12);
    const sample = this.sampleCtx.getImageData(0, 0, 12, 12).data;
    let sum = 0;
    for (let i = 0; i < sample.length; i += 4) sum += sample[i] + sample[i + 1] + sample[i + 2];
    this.lastFrameSample = { pixels: sample.length / 4, rgbMean: sum / (sample.length / 4) / 3 };

    this.material.map = this.videoTexture;
    this.material.color.setHex(0xffffff);
    this.material.needsUpdate = true;
    Object.assign(this.state, {
      source: 'video',
      title,
      selectedFormat: candidate.label || candidate.type || 'Direct media',
      decodedFrame: true,
      sampling: true,
      providerReady: false,
      needsUserGesture: false,
      embedInteractive: false,
      error: null,
    });
    this.videoTexture.needsUpdate = true;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const renderCheck = this.verifyRenderedVideoTexture();
    if (!renderCheck.ok) throw new Error(`Decoded media could not render as a WebGL VideoTexture${renderCheck.reason ? `: ${renderCheck.reason}` : ''}.`);
    this.state.renderCheck = renderCheck;
    this.state.playing = await playAttempt && !this.video.paused;
    this.state.muted = this.video.muted;
    return { ...candidate, renderCheck };
  }

  /** Load one URL or a capability-ranked list, falling back on real decode/GPU failure. */
  async load(input, title, { preserveObjectUrl = false } = {}) {
    const token = ++this._loadToken;
    if (!preserveObjectUrl) this._releaseObjectUrl();
    this._clearEmbed();
    const sources = Array.isArray(input) ? input : [{ url: input }];
    const candidates = rankPlayableSources(this.video, sources);
    if (!candidates.length) {
      const error = new Error('This browser reports that none of the supplied video formats are decodable.');
      this.state.error = error.message;
      this._showLeader('Unsupported format — countdown leader');
      throw error;
    }

    const failures = [];
    for (const candidate of candidates) {
      try {
        return await this._loadVideoSource(candidate, title || candidate.url, token);
      } catch (error) {
        if (token !== this._loadToken) throw error;
        failures.push(`${candidate.label || candidate.type || candidate.url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const error = new Error(`No source produced a rendered video frame. ${failures.join(' | ')}`);
    this._showLeader('Source unavailable — countdown leader');
    this.state.error = error.message;
    throw error;
  }

  loadFile(file) {
    this._releaseObjectUrl();
    this._objectUrl = URL.createObjectURL(file);
    return this.load([
      { url: this._objectUrl, type: file.type || '', label: file.type || 'Local video', local: true },
    ], file.name, { preserveObjectUrl: true });
  }

  async loadUrl(input) {
    const resolved = await resolveVideoUrl(input);
    if (resolved.kind === 'direct') return this.load(resolved.sources, 'Direct media URL');
    return this.loadEmbed(resolved);
  }

  async loadEmbed(source) {
    const token = ++this._loadToken;
    this._releaseObjectUrl();
    this.video.pause();
    this._clearEmbed();

    const youtube = source.provider === 'youtube';
    const frame = document.createElement('iframe');
    frame.src = embedUrlFor(source);
    frame.title = `${source.provider === 'youtube' ? 'YouTube' : 'TikTok'} embedded player`;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.cssText = 'display:block;width:1280px;height:536px;border:0;background:#111;pointer-events:auto;touch-action:manipulation';

    const holder = document.createElement('div');
    holder.className = 'theater-embed-player';
    holder.style.cssText = 'width:1280px;height:536px;background:#111;overflow:hidden;pointer-events:auto;touch-action:manipulation';
    if (youtube) holder.style.opacity = '0';
    holder.appendChild(frame);

    const object = new CSS3DObject(holder);
    object.name = `SCREEN_EMBED_${source.provider.toUpperCase()}`;
    object.position.copy(this.mesh.position);
    object.position.z += 0.035;
    object.scale.setScalar(L.screenW / 1280);
    // A display:none iframe may never emit YouTube's ready event on iOS.
    // Keep it laid out but transparent/non-interactive during initialization;
    // normal camera occlusion takes over immediately after readiness.
    object.visible = youtube;
    this.scene.add(object);

    this.embedObject = object;
    this.embedIframe = frame;
    this.embedProvider = source.provider;
    this._embedInitializing = youtube;
    this.material.map = null;
    this.material.color.setHex(0x181a20);
    this.material.needsUpdate = true;
    this._resetSampler();
    Object.assign(this.state, {
      // YouTube starts cued and unmuted. Audible autoplay is intentionally
      // avoided so an iPhone tap inside the provider player can satisfy the
      // browser's media-gesture rule. TikTok retains muted autoplay.
      playing: !youtube,
      muted: !youtube,
      source: 'embed',
      title: `${source.provider === 'youtube' ? 'YouTube' : 'TikTok'} ${source.id}`,
      selectedFormat: `${source.provider} embed`,
      decodedFrame: false,
      sampling: false,
      renderCheck: { ok: true, mode: 'provider-embed-neutral-spill' },
      providerReady: !youtube,
      needsUserGesture: youtube,
      embedInteractive: true,
      error: null,
    });
    this.setEmbedInteractive(true);

    let controller = 'native-iframe';
    if (youtube) {
      try {
        const player = await this._connectYouTubePlayer(frame, token);
        if (player) controller = 'youtube-iframe-api';
      } catch (error) {
        // The native iframe remains fully usable even if the optional parent
        // controller is unavailable; its own Play control is the audio-safe
        // path on iPhone in either case.
        console.warn('[screen] YouTube controller unavailable:', error);
      } finally {
        if (token === this._loadToken && this.embedProvider === source.provider) this._finishEmbedInitialization();
      }
    }
    return { ...source, embedUrl: this.embedIframe?.src || frame.src, controller };
  }

  async _connectYouTubePlayer(frame, token) {
    const YT = await loadYouTubeIframeApi();
    if (token !== this._loadToken || frame !== this.embedIframe) return null;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(null, new Error('YouTube player did not become ready.')), 15000);
      const finish = (player, error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve(player);
      };

      let player;
      player = new YT.Player(frame, {
        events: {
          onReady: (event) => {
            if (token !== this._loadToken || frame !== this.embedIframe) {
              try { event.target.destroy(); } catch { /* already detached */ }
              finish(null, new Error('Superseded by a newer source.'));
              return;
            }
            this.youtubePlayer = event.target;
            this.embedIframe = event.target.getIframe();
            this.embedIframe.style.cssText = 'display:block;width:1280px;height:536px;border:0;background:#111;touch-action:manipulation';
            this.setEmbedInteractive(this.state.embedInteractive);
            // Safe because playback is still cued. A later native Play tap
            // starts audible media without Safari pausing it.
            event.target.unMute();
            event.target.setVolume(100);
            Object.assign(this.state, {
              playing: false,
              muted: false,
              providerReady: true,
              needsUserGesture: true,
            });
            finish(event.target);
          },
          onStateChange: (event) => {
            if (event.target !== this.youtubePlayer) return;
            const active = event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING;
            const firstAudibleStart = active && this.state.needsUserGesture;
            this.state.playing = active;
            if (event.data === YT.PlayerState.PLAYING) this.state.needsUserGesture = false;
            if (firstAudibleStart) this._returnInputToWorldAfterPlayback();
          },
          onAutoplayBlocked: () => {
            this.state.playing = false;
            this.state.needsUserGesture = true;
            this.setEmbedInteractive(true);
          },
          onError: (event) => {
            const error = new Error(`YouTube player error ${event.data}.`);
            this.state.error = error.message;
            finish(null, error);
          },
        },
      });
    });
  }

  _postEmbed(action) {
    if (this.embedProvider === 'youtube' && this.youtubePlayer) {
      if (action === 'play') this.youtubePlayer.playVideo();
      else if (action === 'pause') this.youtubePlayer.pauseVideo();
      else if (action === 'mute') this.youtubePlayer.mute();
      else {
        this.youtubePlayer.unMute();
        this.youtubePlayer.setVolume(100);
      }
      return;
    }
    if (!this.embedIframe?.contentWindow) return;
    if (this.embedProvider === 'youtube') {
      const func = action === 'play' ? 'playVideo' : action === 'pause' ? 'pauseVideo' : action === 'mute' ? 'mute' : 'unMute';
      this.embedIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com');
    } else if (this.embedProvider === 'tiktok') {
      const type = action === 'unmute' ? 'unMute' : action;
      this.embedIframe.contentWindow.postMessage({ type, 'x-tiktok-player': true }, 'https://www.tiktok.com');
    }
  }

  play() {
    if (this.state.source === 'embed') {
      this._postEmbed('play');
      if (this.embedProvider !== 'youtube') this.state.playing = true;
      return Promise.resolve();
    }
    return this.video.play().then(() => { this.state.playing = true; }).catch(() => {});
  }

  pause() {
    if (this.state.source === 'embed') {
      this._postEmbed('pause');
      if (this.embedProvider !== 'youtube') this.state.playing = false;
    } else {
      this.video.pause();
      this.state.playing = false;
    }
  }

  toggle() { return this.state.playing ? this.pause() : this.play(); }

  setMuted(muted) {
    if (this.state.source === 'embed') this._postEmbed(muted ? 'mute' : 'unmute');
    else this.video.muted = muted;
    this.state.muted = muted;
  }

  seekFraction(fraction) {
    if (this.state.source !== 'video' || !this.video.duration) return;
    this.video.currentTime = THREE.MathUtils.clamp(fraction, 0, 1) * this.video.duration;
  }

  /** Seconds into whatever is playing (direct media or the YouTube controller). */
  get currentTime() {
    if (this.state.source === 'video') return this.video.currentTime || 0;
    if (this.state.source === 'embed' && this.youtubePlayer) {
      try { return this.youtubePlayer.getCurrentTime() || 0; } catch { /* tearing down */ }
    }
    return 0;
  }

  seekTo(seconds) {
    if (!Number.isFinite(seconds)) return;
    if (this.state.source === 'video') {
      const end = this.video.duration || seconds;
      this.video.currentTime = THREE.MathUtils.clamp(seconds, 0, end);
    } else if (this.state.source === 'embed' && this.youtubePlayer) {
      try { this.youtubePlayer.seekTo(Math.max(0, seconds), true); } catch { /* not ready */ }
    }
  }

  /** Nothing showing: back to the countdown leader, any pending load abandoned. */
  stop() {
    this._loadToken++;
    this._releaseObjectUrl();
    this._showLeader();
  }

  get progress() {
    return this.state.source === 'video' && this.video.duration ? this.video.currentTime / this.video.duration : 0;
  }

  /** Hide the DOM player when a wall blocks the physical cinema screen. */
  updateEmbedVisibility(camera, colliders = []) {
    if (!this.embedObject) return;
    if (this._embedInitializing) {
      this.embedObject.visible = true;
      return;
    }
    this.mesh.getWorldPosition(this._embedTarget);
    this._embedDirection.subVectors(this._embedTarget, camera.position);
    const distance = this._embedDirection.length();
    this._embedDirection.normalize();
    this._embedRay.set(camera.position, this._embedDirection);
    let occluded = camera.position.z <= L.screenPlaneZ;
    for (const box of colliders) {
      if (occluded || box.containsPoint(camera.position)) continue;
      const hit = this._embedRay.intersectBox(box, this._embedHit);
      if (hit && hit.distanceTo(camera.position) < distance - 0.2) occluded = true;
    }
    const projected = this._embedTarget.clone().project(camera);
    const inView = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.4 && Math.abs(projected.y) < 1.4;
    this.embedObject.visible = !occluded && inView;
  }

  update(dt) {
    if (this.state.source === 'leader') this.leader.update(dt);

    this._frame++;
    if (this._frame % 4 !== 0) return;
    if (this.state.source === 'embed' && this.embedProvider === 'youtube' && this.youtubePlayer) {
      try {
        const playerState = this.youtubePlayer.getPlayerState();
        this.state.playing = playerState === 1 || playerState === 3;
        this.state.muted = this.youtubePlayer.isMuted();
        if (playerState === 1) this.state.needsUserGesture = false;
      } catch { /* controller may be tearing down */ }
    }
    let r = 0.60, g = 0.60, b = 0.62, lum = 0.55;
    if (this.state.source !== 'embed') {
      try {
        const src = this.state.source === 'video' ? this.video : this.leader.canvas;
        if (this.state.source === 'video' && this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        this.sampleCtx.drawImage(src, 0, 0, 12, 12);
        const d = this.sampleCtx.getImageData(0, 0, 12, 12).data;
        let sr = 0, sg = 0, sb = 0;
        for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }
        const n = d.length / 4;
        r = sr / n / 255; g = sg / n / 255; b = sb / n / 255;
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        this.state.sampling = true;
      } catch {
        this.sampling = false;
        this.state.sampling = false;
      }
    }

    const boost = 1 / Math.max(0.18, lum);
    this.light.color.setRGB(
      Math.min(1, r * boost * 0.55 + 0.30),
      Math.min(1, g * boost * 0.55 + 0.30),
      Math.min(1, b * boost * 0.55 + 0.32),
    );
    const targetIntensity = this.state.source === 'embed' ? 7.0 : 3.5 + lum * 13;
    this.light.intensity = THREE.MathUtils.lerp(this.light.intensity, targetIntensity, 0.3);
    this.bounce.color.copy(this.light.color);
    this.bounce.intensity = this.light.intensity * 0.22;
  }
}
