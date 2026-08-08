import test from 'node:test';
import assert from 'node:assert/strict';
import { L, floorHeightAt, rowY, rowZ } from '../../src/layout.js';

test('legacy floor boundaries match every rendered riser boundary', () => {
  const epsilon = 0.001;
  for (let row = 0; row < L.rows; row++) {
    const boundary = rowZ(row) - L.rowPitch / 2;
    assert.equal(floorHeightAt(boundary + epsilon), rowY(row));
    if (row > 0) assert.equal(floorHeightAt(boundary - epsilon), rowY(row - 1));
  }
});
test('rear deck and lobby share the same grade height', () => {
  assert.equal(floorHeightAt(L.rearDeckEndZ - 0.01), L.gradeY);
  assert.equal(floorHeightAt(L.lobbyZ0 + 0.01), L.gradeY);
});
