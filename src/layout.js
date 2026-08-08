/* ------------------------------------------------------------------ *
 *  Single source of truth for auditorium dimensions.
 *  Every number is metres, checked against real large-format houses.
 * ------------------------------------------------------------------ */

export const L = {
  // Room shell
  halfWidth: 15.0,       // side walls at x = ±15  (30 m across)
  screenZ: -26.0,        // screen wall plane
  backZ: 10.0,           // rear wall plane        (36 m deep)
  ceilY: 12.0,
  wallY: 12.0,

  // Stage / proscenium
  stageDepth: 2.8,       // stage runs screenZ .. screenZ + stageDepth
  stageY: 1.10,
  proscHalfWidth: 11.6,
  proscTop: 11.2,

  // Screen — 2.39:1 scope, masked
  screenW: 20.0,
  screenH: 8.37,
  screenBottom: 2.30,
  screenPlaneZ: -25.35,

  // Seating block
  rows: 16,
  rowPitch: 1.15,
  firstRowZ: -13.0,
  blockLeft: 6,
  blockCentre: 16,
  blockRight: 6,
  aisleW: 1.80,
  seatPitch: 0.62,
  flatRows: 2,           // rows on the orchestra flat before risers begin
  riserStep: 0.36,

  // Circulation
  crossAisleZ: 5.6,      // rear cross aisle centre
  railHeight: 0.98,
};

L.seatsPerRow = L.blockLeft + L.blockCentre + L.blockRight;
L.seatingWidth = L.seatsPerRow * L.seatPitch + 2 * L.aisleW;
L.seatingHalf = L.seatingWidth / 2;
L.lastRowZ = L.firstRowZ + (L.rows - 1) * L.rowPitch;

/* ---------------- Building beyond the auditorium ----------------
 * The auditorium floor rakes down below street level, exactly as in a real
 * stadium-seating house: you enter at the TOP of the rake. So the grade
 * plane — lobby floor, pavement, everything outside — sits at the height of
 * the rear cross-aisle. */
L.gradeY = (L.rows - L.flatRows) * L.riserStep;

// Auditorium <-> lobby wall, with two door openings
L.audWallZ = L.backZ;                 // 10.0
L.audWallT = 0.55;
L.audDoors = [-6.2, 6.2];
L.audDoorW = 2.40;
L.audDoorH = 2.45;

// Lobby volume
L.lobbyZ0 = L.audWallZ + L.audWallT;  // 10.55
L.lobbyZ1 = 34.0;
L.lobbyHalfW = 18.0;
L.lobbyCeil = 6.60;

// Entrance façade
L.facadeZ = L.lobbyZ1;
L.entryDoorW = 1.05;
L.entryDoorH = 2.60;
L.entryDoorX = [-3.30, -2.20, 2.20, 3.30]; // two pairs of double doors

// Outer building envelope
L.bldgHalfW = L.lobbyHalfW + 1.0;     // 19.0
L.bldgBackZ = L.screenZ - 2.5;        // -28.5
L.bldgFrontZ = L.facadeZ + 0.6;
L.bldgHeight = 14.5;                  // above grade
L.canopyZ = L.facadeZ + 5.4;
L.canopyY = L.gradeY + 4.6;

/** Tier index for a given row (0 = orchestra flat). */
export function rowLevel(r) {
  return Math.max(0, r - (L.flatRows - 1));
}

/** Floor height of a given row. */
export function rowY(r) {
  return rowLevel(r) * L.riserStep;
}

/** Z centre line of a given row. */
export function rowZ(r) {
  return L.firstRowZ + r * L.rowPitch;
}

/**
 * X centre of a seat, indexed 0..seatsPerRow-1 left to right.
 * Aisles are inserted between the blocks, so the returned Xs are not
 * uniformly spaced — that is deliberate and matches real seat charts.
 */
export function seatX(i) {
  const half = L.seatingHalf;
  if (i < L.blockLeft) {
    return -half + (i + 0.5) * L.seatPitch;
  }
  if (i < L.blockLeft + L.blockCentre) {
    const j = i - L.blockLeft;
    return -half + L.blockLeft * L.seatPitch + L.aisleW + (j + 0.5) * L.seatPitch;
  }
  const j = i - L.blockLeft - L.blockCentre;
  return -half + (L.blockLeft + L.blockCentre) * L.seatPitch + 2 * L.aisleW + (j + 0.5) * L.seatPitch;
}

/** Centre X of the two aisles. */
export function aisleX(side) {
  const half = L.seatingHalf;
  return side === 0
    ? -half + L.blockLeft * L.seatPitch + L.aisleW / 2
    : -half + (L.blockLeft + L.blockCentre) * L.seatPitch + 1.5 * L.aisleW;
}

/** Row-block boundary Zs: where a riser platform starts and ends. */
export function rowSpanZ(r) {
  const c = rowZ(r);
  return [c - L.rowPitch / 2, c + L.rowPitch / 2];
}

/**
 * Walkable floor height at a local Z. The seating deck is a staircase, so
 * this is a step function — the aisles step with the rows. Everything from
 * the rear wall outwards (lobby, pavement, street) sits on the grade plane.
 */
export function floorHeightAt(z) {
  if (z > L.audWallZ - 0.5) return L.gradeY;
  const front = rowZ(0) - L.rowPitch / 2;
  if (z < front) return 0;
  const back = rowZ(L.rows - 1) + L.rowPitch / 2;
  if (z >= back) return rowY(L.rows - 1);
  const r = Math.floor((z - front) / L.rowPitch);
  return rowY(Math.min(L.rows - 1, Math.max(0, r)));
}

/** Tier index (grid "L" component) at a local Z. */
export function levelAt(z) {
  if (z > L.audWallZ - 0.5) return rowLevel(L.rows - 1);
  const front = rowZ(0) - L.rowPitch / 2;
  if (z < front) return 0;
  const back = rowZ(L.rows - 1) + L.rowPitch / 2;
  if (z >= back) return rowLevel(L.rows - 1);
  const r = Math.floor((z - front) / L.rowPitch);
  return rowLevel(Math.min(L.rows - 1, Math.max(0, r)));
}

export const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
