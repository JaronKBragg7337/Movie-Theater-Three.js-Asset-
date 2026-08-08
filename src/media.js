const DIRECT_MEDIA_TYPES = new Map([
  ['mp4', 'video/mp4'],
  ['m4v', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['webm', 'video/webm'],
  ['ogv', 'video/ogg'],
  ['ogg', 'video/ogg'],
  ['m3u8', 'application/vnd.apple.mpegurl'],
]);

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const TIKTOK_ID_RE = /^\d{10,24}$/;

function parseUrl(input) {
  try {
    const url = new URL(String(input).trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only http:// and https:// media links are supported here.');
    }
    return url;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Only ')) throw error;
    throw new Error('Enter a complete video URL beginning with http:// or https://.');
  }
}
export function directMediaType(input) {
  const url = input instanceof URL ? input : parseUrl(input);
  const filename = url.pathname.split('/').pop() || '';
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
  return DIRECT_MEDIA_TYPES.get(ext) || null;
}

function youtubeId(url) {
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return YOUTUBE_ID_RE.test(id || '') ? id : null;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  let id = url.searchParams.get('v');
  if (!id && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1];
  return YOUTUBE_ID_RE.test(id || '') ? id : null;
}

function youtubeStart(url) {
  const raw = url.searchParams.get('t') || url.searchParams.get('start') || '';
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(raw);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function tiktokId(url) {
  if (!TIKTOK_HOST_RE.test(url.hostname)) return null;
  const match = /\/(?:video|player\/v1|embed\/v2)\/(\d{10,24})(?:\/|$)/i.exec(url.pathname);
  return match && TIKTOK_ID_RE.test(match[1]) ? match[1] : null;
}

/**
 * Classify a URL without touching the network. TikTok short/share links are
 * returned as `tiktok-resolve` and resolved through TikTok's official oEmbed
 * endpoint by resolveVideoUrl().
 */
export function classifyVideoUrl(input) {
  const url = parseUrl(input);
  const mediaType = directMediaType(url);
  if (mediaType) {
    return {
      kind: 'direct',
      url: url.href,
      sources: [{ url: url.href, type: mediaType, label: mediaType }],
    };
  }

  const yt = youtubeId(url);
  if (yt) {
    return {
      kind: 'embed', provider: 'youtube', id: yt,
      start: youtubeStart(url), originalUrl: url.href,
    };
  }

  if (TIKTOK_HOST_RE.test(url.hostname)) {
    const tt = tiktokId(url);
    if (tt) return { kind: 'embed', provider: 'tiktok', id: tt, originalUrl: url.href };
    return { kind: 'tiktok-resolve', originalUrl: url.href };
  }

  throw new Error('That webpage is not a direct media file or a supported YouTube/TikTok link.');
}

/** Resolve provider share URLs through the provider's supported public API. */
export async function resolveVideoUrl(input, fetchImpl = globalThis.fetch) {
  const result = classifyVideoUrl(input);
  if (result.kind !== 'tiktok-resolve') return result;
  if (typeof fetchImpl !== 'function') throw new Error('TikTok share-link resolution is unavailable in this browser.');

  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(result.originalUrl)}`;
  const response = await fetchImpl(endpoint, { mode: 'cors' });
  if (!response.ok) throw new Error(`TikTok could not resolve that shared link (${response.status}).`);
  const data = await response.json();
  const id = String(data.embed_product_id || /data-video-id="(\d+)"/.exec(data.html || '')?.[1] || '');
  if (!TIKTOK_ID_RE.test(id)) throw new Error('TikTok did not return an embeddable video ID for that link.');
  return { kind: 'embed', provider: 'tiktok', id, originalUrl: result.originalUrl };
}

export function embedUrlFor(source, pageOrigin = globalThis.location?.origin || '') {
  if (source.provider === 'youtube') {
    const params = new URLSearchParams({
      // Audible autoplay is blocked on iPhone. Start cued and unmuted so the
      // user's tap lands inside YouTube's own player and legitimately starts
      // playback with sound instead of pausing a forced-muted autoplay.
      autoplay: '0', playsinline: '1', controls: '1',
      enablejsapi: '1', rel: '0', loop: '1', playlist: source.id,
    });
    if (source.start) params.set('start', String(source.start));
    if (/^https?:\/\//.test(pageOrigin)) params.set('origin', pageOrigin);
    return `https://www.youtube.com/embed/${source.id}?${params}`;
  }
  if (source.provider === 'tiktok') {
    const params = new URLSearchParams({
      autoplay: '1', muted: '1', loop: '1', controls: '1',
      progress_bar: '1', play_button: '1', volume_control: '1',
      fullscreen_button: '1', rel: '0', native_context_menu: '1',
    });
    return `https://www.tiktok.com/player/v1/${source.id}?${params}`;
  }
  throw new Error(`Unsupported embed provider: ${source.provider}`);
}

/**
 * Order media candidates using HTMLMediaElement.canPlayType(). Unknown types
 * remain last so local iPhone recordings and signed URLs still get a chance.
 */
export function rankPlayableSources(video, sources) {
  return sources
    .map((source, index) => {
      const support = source.type ? video.canPlayType(source.type) : '';
      const score = support === 'probably' ? 3 : support === 'maybe' ? 2 : source.type ? 0 : 1;
      return { ...source, support, score, index };
    })
    .filter((source) => source.score > 0 || sources.length === 1)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
