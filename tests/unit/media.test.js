import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVideoUrl,
  embedUrlFor,
  rankPlayableSources,
  resolveVideoUrl,
} from '../../src/media.js';

test('direct media URLs remain direct VideoTexture candidates', () => {
  const result = classifyVideoUrl('https://cdn.example.test/movie.MP4?signature=abc');
  assert.equal(result.kind, 'direct');
  assert.equal(result.sources[0].type, 'video/mp4');
  assert.match(result.sources[0].url, /movie\.MP4\?signature=abc$/);
});
test('normal YouTube share forms resolve to the official player', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m2s',
    'https://youtu.be/M7lc1UVf-VE?t=62',
    'https://www.youtube.com/shorts/M7lc1UVf-VE',
  ]) {
    const result = classifyVideoUrl(url);
    assert.equal(result.kind, 'embed');
    assert.equal(result.provider, 'youtube');
    assert.equal(result.id, 'M7lc1UVf-VE');
  }
  const embed = embedUrlFor(classifyVideoUrl('https://youtu.be/M7lc1UVf-VE?t=62'), 'https://cinema.example');
  assert.match(embed, /^https:\/\/www\.youtube\.com\/embed\/M7lc1UVf-VE\?/);
  assert.match(embed, /playsinline=1/);
  assert.match(embed, /origin=https%3A%2F%2Fcinema\.example/);
});

test('canonical TikTok shares resolve to the official player', () => {
  const result = classifyVideoUrl('https://www.tiktok.com/@scout2015/video/6718335390845095173');
  assert.deepEqual(
    { kind: result.kind, provider: result.provider, id: result.id },
    { kind: 'embed', provider: 'tiktok', id: '6718335390845095173' },
  );
  assert.match(embedUrlFor(result), /^https:\/\/www\.tiktok\.com\/player\/v1\/6718335390845095173\?/);
});

test('TikTok short links use the official oEmbed resolver', async () => {
  const fakeFetch = async (url) => {
    assert.match(url, /^https:\/\/www\.tiktok\.com\/oembed\?url=/);
    return {
      ok: true,
      json: async () => ({ embed_product_id: '6718335390845095173' }),
    };
  };
  const result = await resolveVideoUrl('https://vm.tiktok.com/ZMexample/', fakeFetch);
  assert.equal(result.kind, 'embed');
  assert.equal(result.id, '6718335390845095173');
});

test('codec capability ranking prefers a probably-supported H.264 source', () => {
  const video = {
    canPlayType(type) {
      if (type.includes('video/mp4')) return 'probably';
      if (type.includes('video/webm')) return '';
      return 'maybe';
    },
  };
  const ranked = rankPlayableSources(video, [
    { url: 'movie.webm', type: 'video/webm; codecs="vp9, opus"', label: 'VP9 WebM' },
    { url: 'movie.mp4', type: 'video/mp4; codecs="avc1.64001f, mp4a.40.2"', label: 'H.264 MP4' },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].label, 'H.264 MP4');
});

test('unsupported webpage URLs fail with a useful message', () => {
  assert.throws(
    () => classifyVideoUrl('https://example.com/watch/123'),
    /not a direct media file or a supported YouTube\/TikTok link/,
  );
});
