/**
 * Shared screen.
 *
 * When this theater is embedded in a host page that keeps a room in sync
 * (heartbeatobservatory.com/video/3d/), whatever anyone plays plays for
 * everyone in the room, in step. This module never touches the network: it
 * only talks to the host page with postMessage. The host owns the realtime
 * room, the accounts (who is an admin) and where uploads are stored.
 * Standalone, with no host, it does nothing and the theater is single-viewer.
 *
 * Host -> theater: { gp:1, type: 'hello' | 'remote' | 'getState' | 'uploaded' | 'status' | 'role', ... }
 * Theater -> host: { gp:1, type: 'ready' | 'local' | 'state', ... }
 * A source is { kind:'film', index } | { kind:'url', url } | { kind:'upload', url, name } | { kind:'file', file, name }.
 */
const HOSTS = [
  /^https:\/\/(www\.)?heartbeatobservatory\.com$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

export function connectSharedScreen({ screen, playlist, setStatus, onChange = () => {} }) {
  const api = {
    active: false,        // a host is keeping this screen in sync
    admin: false,         // host says the viewer is an admin (is_admin())
    signedIn: false,
    current: null,        // { src, mine } for what is on the screen now
    local: () => {},
    get canStop() { return !!(api.current && (api.current.mine || api.admin)); },
  };
  if (window.parent === window) return api;

  let host = null;
  const post = (msg) => { if (host) window.parent.postMessage({ gp: 1, ...msg }, host); };
  const titleOf = (src) => src.kind === 'film' ? (playlist[src.index]?.title || 'a film')
    : src.kind === 'upload' || src.kind === 'file' ? (src.name || 'an uploaded video')
    : 'a video link';

  let lastSeekSent = 0, seekTimer = null;
  api.local = (action, data = {}) => {
    if (!api.active) return;
    const t = screen.currentTime;
    if (action === 'load') {
      api.current = { src: data.src, mine: true };
      const { file, ...rest } = data.src;
      post({ type: 'local', action, src: rest.kind === 'file' ? { kind: 'file', name: rest.name } : rest, file: file || null, t: 0, playing: true });
      setStatus(`Playing for everyone: ${titleOf(data.src)}`);
    } else if (action === 'seek') {
      // A dragged seek bar fires many times; send at most 4 a second, and the final one.
      clearTimeout(seekTimer);
      const send = () => { lastSeekSent = performance.now(); post({ type: 'local', action, t: screen.currentTime, playing: screen.state.playing }); };
      if (performance.now() - lastSeekSent > 250) send(); else seekTimer = setTimeout(send, 260);
    } else if (action === 'stop') {
      post({ type: 'local', action, admin: api.admin && !api.current?.mine });
      api.current = null;
      setStatus('Stopped for everyone.');
    } else {
      post({ type: 'local', action, t, playing: action === 'play' });
    }
    onChange();
  };

  async function applyLoad(src, t, playing) {
    api.current = { src, mine: false };
    onChange();
    // Autoplay rules only allow a video nobody tapped for if it starts silent.
    screen.setMuted(true);
    setStatus(`Now showing for everyone: ${titleOf(src)}…`);
    try {
      if (src.kind === 'film') {
        const v = playlist[src.index] || playlist[0];
        await screen.load(v.sources, v.title);
      } else {
        await screen.loadUrl(src.url);
      }
      if (t > 1) screen.seekTo(t);
      if (playing === false) screen.pause(); else await screen.play();
      setStatus(screen.state.source === 'embed'
        ? `Now showing for everyone: ${titleOf(src)} · tap Play on the screen to join in`
        : `Now showing for everyone: ${titleOf(src)}`);
    } catch (e) {
      setStatus(`Could not play what someone shared: ${e instanceof Error ? e.message : e}`, true);
    }
    onChange();
  }

  const drift = (t) => Math.abs(screen.currentTime - t);
  function applyRemote(m) {
    if (m.action === 'load') return applyLoad(m.src, m.t || 0, m.playing);
    if (!api.current) return;
    if (m.action === 'play') { if (drift(m.t) > 1) screen.seekTo(m.t); screen.play(); }
    else if (m.action === 'pause') { screen.pause(); if (drift(m.t) > 0.5) screen.seekTo(m.t); }
    else if (m.action === 'seek') screen.seekTo(m.t);
    else if (m.action === 'tick') {
      if (drift(m.t) > 1.5) screen.seekTo(m.t);
      if (m.playing && !screen.state.playing) screen.play();
      if (!m.playing && screen.state.playing) screen.pause();
    } else if (m.action === 'stop') {
      screen.stop();
      api.current = null;
      setStatus(m.admin ? 'An admin stopped the video for everyone.' : 'The person who started it stopped the video.');
    }
    onChange();
  }

  addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.gp !== 1 || e.source !== window.parent) return;
    if (!HOSTS.some((re) => re.test(e.origin))) return;
    if (!host) host = e.origin;
    if (e.origin !== host) return;
    if (m.type === 'hello') {
      api.active = true;
      post({ type: 'ready' });
      onChange();
    } else if (m.type === 'role') {
      api.admin = !!m.admin; api.signedIn = !!m.signedIn; onChange();
    } else if (m.type === 'remote') {
      applyRemote(m);
    } else if (m.type === 'getState') {
      const c = api.current;
      post({ type: 'state', reqId: m.reqId, src: c && c.src.kind !== 'file' ? c.src : null, t: screen.currentTime, playing: screen.state.playing });
    } else if (m.type === 'uploaded') {
      if (api.current?.src?.kind === 'file') api.current.src = { kind: 'upload', url: m.url, name: api.current.src.name };
      onChange();
    } else if (m.type === 'status') {
      setStatus(m.text, !!m.error);
    }
  });
  return api;
}
