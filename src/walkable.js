import * as THREE from 'three';
import { L, floorHeightAt, levelAt } from './layout.js';
import { gridLabel, worldToGrid } from './registry.js';

const rayMaterial = new THREE.MeshBasicMaterial({
  visible: false,
  side: THREE.FrontSide,
});

/**
 * Attach an exact rendered floor geometry to its permanent asset record.
 * The mesh is raycast-only: it shares the authored geometry but is never
 * submitted as another draw call.
 */
export function createWalkableSurface(geometry, asset, options = {}) {
  const mesh = new THREE.Mesh(geometry, rayMaterial);
  mesh.name = `WALKABLE:${asset.id}`;
  mesh.userData.walkable = true;
  mesh.userData.assetId = asset.id;
  mesh.userData.level = asset.level;
  mesh.userData.compareLayout = options.compareLayout !== false;
  mesh.updateMatrixWorld(true);
  return mesh;
}
export class WalkableSurfaceMap {
  constructor(surfaces) {
    this.surfaces = surfaces.filter(Boolean);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.ray.direction.set(0, -1, 0);
    this.raycaster.near = 0;
    this.raycaster.far = 80;
    this._normal = new THREE.Vector3();
    this._validation = [];
  }

  sampleAt(x, z) {
    this.raycaster.ray.origin.set(x, 40, z);
    const hits = this.raycaster.intersectObjects(this.surfaces, false);
    for (const hit of hits) {
      if (!hit.face) continue;
      this._normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (this._normal.y < 0.55) continue;
      return {
        height: hit.point.y,
        level: hit.object.userData.level ?? levelAt(z),
        assetId: hit.object.userData.assetId || 'WALKABLE',
        compareLayout: hit.object.userData.compareLayout !== false,
        point: hit.point.clone(),
      };
    }
    return null;
  }

  heightAt(x, z) {
    return this.sampleAt(x, z)?.height ?? floorHeightAt(z);
  }

  levelAt(x, z) {
    return this.sampleAt(x, z)?.level ?? levelAt(z);
  }

  nearestAssetId(x, z) {
    let best = null;
    let bestDistance = Infinity;
    for (const surface of this.surfaces) {
      surface.geometry.computeBoundingBox();
      const box = surface.geometry.boundingBox;
      const dx = x < box.min.x ? box.min.x - x : x > box.max.x ? x - box.max.x : 0;
      const dz = z < box.min.z ? box.min.z - z : z > box.max.z ? z - box.max.z : 0;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = surface.userData.assetId;
      }
    }
    return best || 'WALKABLE';
  }

  /**
   * Grid-scan every navigable part of the demo and compare the legacy
   * collision formula with the actual rendered top faces. Transition probes
   * on both sides of every riser boundary prevent a coarse scan hiding an
   * off-by-one step.
   */
  validate({ tolerance = 0.025, step = 0.5 } = {}) {
    const issues = [];
    const seen = new Set();
    const regions = [
      { name: 'AUDITORIUM', x0: -L.halfWidth + 0.25, x1: L.halfWidth - 0.25, z0: L.screenZ + L.stageDepth, z1: L.rearDeckEndZ },
      ...L.audDoors.map((x) => ({ name: 'HOUSE THRESHOLD', x0: x - L.audDoorW / 2 + 0.1, x1: x + L.audDoorW / 2 - 0.1, z0: L.rearDeckEndZ, z1: L.lobbyZ0 })),
      { name: 'LOBBY', x0: -L.lobbyHalfW + 0.25, x1: L.lobbyHalfW - 0.25, z0: L.lobbyZ0, z1: L.lobbyZ1 },
      { name: 'FORECOURT', x0: -L.bldgHalfW - 6, x1: L.bldgHalfW + 6, z0: L.facadeZ, z1: L.facadeZ + 24 },
    ];

    const add = (kind, id, x, y, z, detail, level = levelAt(z)) => {
      const grid = gridLabel(worldToGrid(new THREE.Vector3(x, y, z), level));
      const key = `${kind}:${grid}`;
      if (seen.has(key) || issues.length >= 120) return;
      seen.add(key);
      issues.push({ id, kind, grid, detail, pos: new THREE.Vector3(x, y, z) });
    };

    const probe = (x, z, region) => {
      const rendered = this.sampleAt(x, z);
      if (!rendered) {
        const y = floorHeightAt(z);
        add(
          'WALKABLE_GAP', this.nearestAssetId(x, z), x, y, z,
          `${region.name}: collision has y=${y.toFixed(3)} but no rendered walking surface was hit`,
        );
        return;
      }
      if (!rendered.compareLayout) return;
      const collision = floorHeightAt(z);
      const delta = collision - rendered.height;
      if (Math.abs(delta) > tolerance) {
        add(
          'WALKABLE_MISMATCH', rendered.assetId, x, rendered.height, z,
          `${region.name}: collision y=${collision.toFixed(3)}, rendered y=${rendered.height.toFixed(3)} (${(delta * 100).toFixed(1)} cm)`,
          rendered.level,
        );
      }
    };

    for (const region of regions) {
      for (let x = region.x0 + step / 2; x < region.x1; x += step) {
        for (let z = region.z0 + step / 2; z < region.z1; z += step) probe(x, z, region);
      }
    }

    const front = L.firstRowZ - L.rowPitch / 2;
    const transitionXs = [0, -L.aisleW / 2, L.aisleW / 2];
    for (let r = 0; r < L.rows; r++) {
      const boundary = front + r * L.rowPitch;
      for (const x of transitionXs) {
        probe(x, boundary - 0.01, { name: `RISER ${r} FRONT` });
        probe(x, boundary + 0.01, { name: `RISER ${r} BACK` });
      }
    }

    this._validation = issues;
    return issues;
  }

  get validation() {
    return this._validation;
  }
}
