import { test, expect } from '@playwright/test';

async function openTheater(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.THEATER?.registry?.count?.() > 700, null, { timeout: 30_000 });
  return errors;
}

test.describe('desktop control parity', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('desktop exposes the same USE, GRID, and MEDIA HUD actions', async ({ page }) => {
    const errors = await openTheater(page);
    await page.getByRole('button', { name: 'Enter Theater' }).click();
    await page.evaluate(() => document.exitPointerLock?.());

    const useButton = page.getByRole('button', { name: 'Use nearby door or seat' });
    const gridButton = page.getByRole('button', { name: 'Toggle inspection grid' });
    const mediaButton = page.getByRole('button', { name: 'Open media controls' });
    await expect(useButton).toBeVisible();
    await expect(gridButton).toBeVisible();
    await expect(mediaButton).toBeVisible();

    await gridButton.click();
    expect(await page.evaluate(() => THEATER.inspector.enabled)).toBe(true);

    await mediaButton.click();
    await expect(page.locator('#video-panel')).toBeVisible();
    expect(await page.evaluate(() => document.body.classList.contains('panel-open'))).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('mobile gesture ownership', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('double taps cannot zoom and a right-side drag rotates the camera instead of scrolling', async ({ page, context }) => {
    const errors = await openTheater(page);
    await page.getByRole('button', { name: 'Enter Theater' }).tap();
    await expect(page.getByRole('button', { name: 'Use nearby door or seat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle inspection grid' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open media controls' })).toBeVisible();

    const styles = await page.evaluate(() => ({
      isTouch: THEATER.input.isTouch,
      bodyTouchAction: getComputedStyle(document.body).touchAction,
      bodyOverscroll: getComputedStyle(document.body).overscrollBehavior,
      lookTouchAction: getComputedStyle(document.getElementById('look-zone')).touchAction,
      buttonTouchAction: getComputedStyle(document.getElementById('menu-btn')).touchAction,
    }));
    expect(styles).toEqual({
      isTouch: true,
      bodyTouchAction: 'none',
      bodyOverscroll: 'none',
      lookTouchAction: 'none',
      buttonTouchAction: 'manipulation',
    });

    await page.touchscreen.tap(300, 360);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(300, 360);
    await page.waitForTimeout(350);
    const afterDoubleTap = await page.evaluate(() => ({
      scale: visualViewport?.scale ?? 1,
      scrollX,
      scrollY,
    }));
    expect(afterDoubleTap.scale).toBe(1);
    expect(afterDoubleTap.scrollX).toBe(0);
    expect(afterDoubleTap.scrollY).toBe(0);

    const yawBefore = await page.evaluate(() => THEATER.player.yaw);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 300, y: 360, id: 7, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 245, y: 330, id: 7, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);

    const afterDrag = await page.evaluate(() => ({
      yaw: THEATER.player.yaw,
      scrollX,
      scrollY,
      move: THEATER.player.move.toArray(),
    }));
    expect(Math.abs(afterDrag.yaw - yawBefore)).toBeGreaterThan(0.05);
    expect(afterDrag.scrollX).toBe(0);
    expect(afterDrag.scrollY).toBe(0);
    expect(afterDrag.move).toEqual([0, 0]);

    // Losing browser focus or a captured touch must never leave movement
    // latched, which is the recovery path after an interrupted iOS gesture.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 90, y: 420, id: 9, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 90, y: 360, id: 9, radiusX: 4, radiusY: 4, force: 1 }],
    });
    expect(await page.evaluate(() => THEATER.player.move.length())).toBeGreaterThan(0);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const recovered = await page.evaluate(() => ({
      move: THEATER.player.move.toArray(),
      run: THEATER.player.run,
      joystickVisible: document.getElementById('joystick-base').classList.contains('active'),
    }));
    expect(recovered).toEqual({ move: [0, 0], run: false, joystickVisible: false });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(errors).toEqual([]);
  });
});
