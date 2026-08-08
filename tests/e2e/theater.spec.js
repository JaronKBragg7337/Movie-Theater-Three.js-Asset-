import { test, expect } from '@playwright/test';

async function openTheater(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.THEATER?.registry?.count?.() > 700, null, { timeout: 30_000 });
  return errors;
}

test('rendered walkable geometry, IDs, and collision heights agree', async ({ page }) => {
  const errors = await openTheater(page);
  const result = await page.evaluate(() => {
    const issues = THEATER.validateWalkables();
    const thresholds = [-6.2, 6.2].map((x) => THEATER.walkable.sampleAt(x, 10.1));
    const rearRow = THEATER.walkable.sampleAt(0, -3);
    return {
      issues,
      thresholds,
      rearRow,
      reportIssues: THEATER.report().issues,
      assets: THEATER.registry.count(),
    };
  });

  expect(errors).toEqual([]);
  expect(result.assets).toBeGreaterThan(700);
  expect(result.issues).toEqual([]);
  expect(result.reportIssues).toEqual([]);
  expect(result.thresholds.every((sample) => sample?.assetId.startsWith('THRESHOLD#'))).toBe(true);
  expect(result.thresholds.every((sample) => Math.abs(sample.height - 5.04) < 0.001)).toBe(true);
  expect(result.rearRow.assetId).toMatch(/^RISER#/);
  expect(result.rearRow.height).toBeCloseTo(2.88, 3);
});

test('mobile forward remains joystick-up / negative local Z', async ({ page }) => {
  await openTheater(page);
  const movement = await page.evaluate(() => {
    const p = THEATER.player;
    p.keys.clear();
    p.mode = 'walk';
    p.pos.set(0, THEATER.walkable.heightAt(0, 20), 20);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
    p.move.set(0, -1);
    const start = p.pos.z;
    p.update(0.1);
    const up = p.pos.z - start;
    p.vel.set(0, 0, 0);
    p.move.set(0, 1);
    const middle = p.pos.z;
    p.update(0.1);
    const down = p.pos.z - middle;
    p.pos.set(0, THEATER.walkable.heightAt(0, -22.8), -22.8);
    p.vel.set(0, 0, 0);
    p.move.set(0, -1);
    for (let i = 0; i < 20; i++) p.update(0.05);
    const stageApproach = { z: p.pos.z, y: p.pos.y };
    p.move.set(0, 0);
    return { up, down, stageApproach };
  });
  expect(movement.up).toBeLessThan(0);
  expect(movement.down).toBeGreaterThan(0);
  expect(movement.stageApproach.z).toBeGreaterThan(-23.2);
  expect(movement.stageApproach.y).toBeCloseTo(0, 3);
});

test('reported iPhone playlist failures render real H.264 VideoTextures', async ({ page }) => {
  await openTheater(page);
  const results = [];
  for (const index of [0, 1, 2]) {
    const result = await page.evaluate(async (playlistIndex) => {
      THEATER.screen.setMuted(true);
      const selected = await THEATER.playBuiltIn(playlistIndex);
      // Opening logos may be intentionally black. Keep sampling the actual
      // playing texture until a visible decoded frame reaches WebGL.
      const video = THEATER.screen.video;
      await Promise.race([
        video.play().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      let verify = THEATER.screen.verifyRenderedVideoTexture();
      const deadline = performance.now() + 15_000;
      while (verify.averageLuminance <= 0.5 && performance.now() < deadline) {
        if (typeof video.requestVideoFrameCallback === 'function') {
          await Promise.race([
            new Promise((resolve) => video.requestVideoFrameCallback(resolve)),
            new Promise((resolve) => setTimeout(resolve, 750)),
          ]);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        verify = THEATER.screen.verifyRenderedVideoTexture();
      }
      return {
        selected: selected.label,
        state: { ...THEATER.screen.state },
        readyState: THEATER.screen.video.readyState,
        width: THEATER.screen.video.videoWidth,
        height: THEATER.screen.video.videoHeight,
        currentTime: THEATER.screen.video.currentTime,
        textureAttached: THEATER.screen.material.map === THEATER.screen.videoTexture,
        verify,
      };
    }, index);
    results.push(result);
  }

  for (const result of results) {
    expect(result.selected).toBe('H.264 MP4');
    expect(result.state.source).toBe('video');
    expect(result.state.decodedFrame).toBe(true);
    expect(result.readyState).toBeGreaterThanOrEqual(2);
    expect(result.width).toBeGreaterThanOrEqual(16);
    expect(result.height).toBeGreaterThanOrEqual(16);
    expect(result.currentTime).toBeGreaterThan(0);
    expect(result.textureAttached).toBe(true);
    expect(result.verify.ok).toBe(true);
    expect(result.verify.glError).toBe(0);
    expect(result.verify.averageLuminance).toBeGreaterThan(0.5);
  }
});

test('provider URLs use embeds and neutral spill instead of a raw video source', async ({ page }) => {
  await openTheater(page);
  const result = await page.evaluate(async () => {
    const player = THEATER.player;
    player.keys.clear();
    player.move.set(0, 0);
    player.vel.set(0, 0, 0);
    player.pos.set(0, THEATER.walkable.heightAt(0, -12), -12);
    player.yaw = 0;
    player.pitch = 0.18;
    player.update(0.016);
    THEATER.camera.updateMatrixWorld(true);
    const youtube = await THEATER.screen.loadUrl('https://www.youtube.com/watch?v=M7lc1UVf-VE&t=3s');
    THEATER.screen.updateEmbedVisibility(THEATER.camera, THEATER.player.colliders);
    const visibleInHouse = THEATER.screen.embedObject.visible;
    player.pos.set(0, THEATER.walkable.heightAt(0, 20), 20);
    player.pitch = 0;
    player.update(0.016);
    THEATER.camera.updateMatrixWorld(true);
    THEATER.screen.updateEmbedVisibility(THEATER.camera, THEATER.player.colliders);
    return {
      youtube,
      source: THEATER.screen.state.source,
      sampling: THEATER.screen.state.sampling,
      neutralMode: THEATER.screen.state.renderCheck?.mode,
      textureAttached: THEATER.screen.material.map === THEATER.screen.videoTexture,
      visibleInHouse,
      visibleThroughLobbyWall: THEATER.screen.embedObject.visible,
    };
  });

  expect(result.youtube.provider).toBe('youtube');
  expect(result.youtube.embedUrl).toMatch(/^https:\/\/www\.youtube\.com\/embed\//);
  expect(result.source).toBe('embed');
  expect(result.sampling).toBe(false);
  expect(result.neutralMode).toBe('provider-embed-neutral-spill');
  expect(result.textureAttached).toBe(false);
  expect(result.visibleInHouse).toBe(true);
  expect(result.visibleThroughLobbyWall).toBe(false);
});
