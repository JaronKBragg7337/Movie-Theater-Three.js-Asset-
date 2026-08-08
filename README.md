# Grand Palace Cinema — a three.js movie theater asset

A complete, walkable movie theater for three.js worlds: exterior building,
lobby, and a 448-seat auditorium with a working screen. Every seat can be sat
in. Every asset has a permanent ID and a grid address. One key turns on a full
inspection layer.

**Zero binary assets.** All geometry and all textures are generated
procedurally at load time, so there is nothing to download and no third-party
texture licence to inherit. **CC0** — public domain, use it for anything.

---

## Quick look

live page: https://jaronkbragg7337.github.io/Movie-Theater-Three.js-Asset-/

or 

```bash
npx serve . -l 5173
```

Then open <http://localhost:5173>. You spawn on the forecourt facing the
marquee. Walk to the doors, press **E**, and walk in. There is no scene
transition and no loading screen between outside and your seat — the entire
building is one scene.

---

## Controls

| | Desktop | Mobile |
|---|---|---|
| Walk | `W A S D` / arrows | Left half of screen — drag anywhere |
| Look | Mouse (pointer lock) | Right half of screen — drag |
| Run | `Shift` | Push the stick to the edge |
| Open door / sit | `E` | On-screen action button |
| Stand up | `Esc` or `E` | Action button |
| Inspection layer | `G` | — |
| Video panel | 🎬 button | ⚙ button |

The mobile joystick is **invisible until touched**. Put a finger down anywhere
on the left 45% of the screen and the stick materialises under it; lift and it
vanishes. Nothing occludes the view while you are just looking around.

---

## The screen

The screen starts on a live Academy countdown leader (drawn to a canvas each
frame, so it is never black) and accepts:

- **Built-in playlist** — ten Blender Foundation open movies (CC-BY). Every
  entry offers H.264/AAC MP4 from Blender's official video service and
  VP9/Opus WebM from Wikimedia Commons. The player ranks candidates with
  `canPlayType()`, falls back on decode failure, and only declares success
  after a decoded frame has rendered through WebGL.
- **Direct media URL** — paste an `.mp4`, `.webm`, `.mov`, `.m4v`, `.ogv`, or
  native-HLS link. It remains a real three.js `VideoTexture`, so screen-frame
  sampling and film-driven auditorium lighting continue to work.
- **YouTube or TikTok share URL** — normal watch/share links are recognised and
  displayed on the physical theater screen with each provider's supported
  iframe player. Because browser security does not expose those cross-origin
  frames to WebGL, provider embeds deliberately use neutral screen spill.
- **Local upload** — pick a file; it plays from a blob URL.

For direct URLs, the CORS header matters: the auditorium lighting is driven by
sampling the video frame down to 12×12 pixels and feeding the average colour
and luminance into the screen's `RectAreaLight`. WebGL also requires CORS
permission before it can upload a cross-origin video frame as a texture. A
host that does not grant it cannot be used as a direct `VideoTexture`; use a
CORS-enabled media URL or one of the supported provider share links instead.

> **Note:** browsers refuse to load or decode media in a hidden/background tab.
> If the screen stays on the countdown leader, make sure the tab is visible.

---

## Asset IDs and the world grid

Every asset is registered with a **permanent ID** derived from deterministic
build order — `SEAT#47` is the same seat on every reload, in every browser.

The world sits on a **1 metre grid** with a speakable address:

```
L{tier}-H{column}-R{row}     e.g.  L0-H14-R8
```

- `L` — floor tier. `0` is the orchestra flat, `1..14` are the seating risers,
  `-1` is the stage. The lobby and everything outside sit on tier `14`, because
  the auditorium floor rakes *below* street level exactly as a real
  stadium-seating house does — you enter at the top of the rake.
- `H` — grid column along +X, measured from the west wall.
- `R` — grid row along +Z, measured from the screen wall.

So a bug report can be one line:

> "I'm at L0-H14-R8. SEAT#47 is floating. DOOR#3 isn't aligned with WALL#12."

…and anyone — human or agent — can reproduce that exact view.

### Inspection layer (press `G`)

- The 1 m grid, drawn stepped so it follows the seating deck, with every fifth
  line highlighted so you can count cells by eye.
- Floating ID + grid labels on the nearest ~120 assets (pooled sprites, so the
  cost does not scale with the 700+ registered assets).
- Collision volumes in red, asset AABBs in green.
- A live **floating / buried / overlap report**. Anything whose base sits more
  than 2 cm off its declared support plane is flagged by ID and grid address,
  with the error in centimetres. The same report grid-scans the auditorium,
  thresholds, lobby, and forecourt for missing walking surfaces or collision /
  rendered-height drift, including probes on both sides of every riser edge.
  Click a finding to teleport to it.
- A teleport box that accepts either a grid address (`L0-H14-R8`) or an asset
  ID (`SEAT#47`).

### Console API

```js
THEATER.goto('L0-H14-R8')   // or THEATER.goto('SEAT#47')
THEATER.where()             // grid address of the camera
THEATER.sit('H12')          // sit in a named seat
THEATER.report()            // { total, counts, issues[] }
THEATER.validateWalkables() // re-run the rendered-surface grid audit
THEATER.openAllDoors()
THEATER.removeTestEnvironment()
```

---

## Dropping it into your own world

Everything is parented to a single `THREE.Group`, so the whole cinema moves,
rotates, and scales as one object:

```js
import { buildTheater }  from './src/theater.js';
import { buildBuilding } from './src/building.js';
import { DoorSet }       from './src/doors.js';

const root = new THREE.Group();
myWorld.add(root);

const theater  = buildTheater(root, materials);
const doorSet  = new DoorSet(root, materials);
const building = buildBuilding(root, materials, doorSet);

root.position.set(120, 0, -40);
root.rotation.y = Math.PI / 2;

building.site.removeFromParent();   // drop the bundled forecourt
```

The forecourt — asphalt, kerbs, benches, car-park masts, night sky — is a
separate group named `TEST_ENVIRONMENT` for exactly this reason. It exists so
the building has something to stand on in the demo; delete it and drop the
building into your own terrain.

`floorHeightAt(z)` and `levelAt(z)` in `src/layout.js` remain the compact layout
reference queries. In the demo, movement and inspection use
`WalkableSurfaceMap` from `src/walkable.js`: it raycasts the exact geometries
used to render the apron, risers, cross-aisle, house thresholds, lobby, and
forecourt. The mathematical query is only a fallback and an independent drift
check. If your world transforms the root, convert queries to root-local space
first.

**Currently single-instance:** the asset registry is module-level, so two
theaters in one page would share an ID space. Splitting the registry per
instance is the one change needed for multi-instance use.

---

## How the fidelity is built

**Everything is assembled, not booleaned.** A seat is not a box with a
cushion-coloured top — it is a cast end standard with a lightening window, a
floor plate on four anchor bolts, a cross-tube with collar clamps and a pinch
bolt, a hinge boss with a pivot pin and retaining washer, a walnut armrest with
a leather elbow pad on a steel spine and three countersunk screws, a cupholder
with a knurled rim and pressed drain slots, a tip-up pan on gravity return, and
piped welt seams around every cushion. Seats default to the folded-up position
and drop when you sit, because that is what the mechanism does.

**Consistent texel density.** Geometry UVs are projected in *metres*
(`geom.planarUV`), and every material's texture repeat is `1 / tileMetres`. A
4 cm bolt head and a 30 m wall therefore land on the same texels-per-metre
budget. No surface is stretched relative to its neighbour.

**Anti-tiled procedural PBR.** Textures are built from periodic value-noise
(exactly wrapping, so tiles never seam) layered at deliberately mismatched
scales — fibre-scale detail against 3–6 m macro variation — so repeats do not
read as repeats. Normal maps are Sobel-derived from height fields; roughness
varies per-surface with edge wear and traffic polish baked in (velour is
lighter and less rough where people have sat; brass is polished on the highs
and oxidised in the recesses).

**Real dimensions throughout.** 0.62 m seat pitch, 1.15 m row pitch, 0.44 m
seat height, 0.64 m armrest, 2.39:1 scope screen at 20 m wide, 0.36 m risers.
`src/layout.js` is the single source of truth and every builder reads from it.

### Performance

- **Instancing.** 448 seats are 8 `InstancedMesh` draw calls, split by
  material, with the tip-up pan as its own instanced group so individual seats
  animate by writing one matrix. Only seats that are actually moving are
  updated each frame.
- **Merged architecture.** The room, lobby, and façade collapse to one merged
  mesh per material — the whole building is a couple of dozen draw calls.
- **Distance-culled light pool.** The building has ~60 practical fixtures.
  three.js forward-renders every light in every fragment shader, so instead of
  60 lights there is a fixed pool (14 desktop / 6 mobile) that is re-pointed
  each frame at whichever fixtures are nearest the camera. Constant shader
  cost, no recompiles, and the lamps you can see are always the lit ones.
- **Per-instance UV atlas.** Seat number plates sample one 8×8 brass atlas via
  an instanced attribute and a small `onBeforeCompile` patch — 448 individually
  numbered tags, one draw call.
- Bloom is desktop-only; mobile drops it and the light pool along with it.

---

## Layout

```
src/
  layout.js      every dimension, in metres — the single source of truth
  geom.js        rounded boxes, extruded profiles, piping, bolts, planar UVs
  builder.js     per-material geometry bins → merged meshes; pierced walls
  textures.js    all procedural PBR maps, decals, signage, posters
  seat.js        the seat assembly and its hinged group
  theater.js     auditorium: risers, walls, proscenium, screen wall, ceiling
  building.js    lobby, concession, box office, façade, canopy, forecourt
  doors.js       hinged interactive leaves + collision that follows the swing
  videoscreen.js video texture, playlist, and screen-driven room lighting
  media.js       direct/provider URL recognition and codec capability ranking
  walkable.js    rendered-floor raycasts + grid/ID mismatch validation
  controls.js    pointer-lock FPS + the invisible mobile joystick
  registry.js    permanent IDs, grid maths, floating/buried validation
  inspector.js   the `G` layer
  main.js        materials, instancing, interaction, render loop, public API
```

---

## Known limits

- **Video needs a visible tab.** Browsers will not decode media in a
  background tab; this is a browser policy, not a bug in the asset.
- **Provider embeds use neutral spill.** YouTube and TikTok correctly remain
  inside their cross-origin official players, so their pixels cannot drive
  auditorium-light sampling. Direct URLs and local uploads still do.
- **No shadow maps.** The auditorium is lit by an area light from the screen,
  which casts no shadows in three.js anyway. The exterior moon fill is kept
  deliberately weak because without shadows a strong directional light would
  leak through the walls. Contact darkening under seats is a cheap decal.
- **Single instance per page** (see above).

---

## Validation

The repository includes unit and phone-viewport browser tests:

```bash
npm ci
npm test
```

The browser suite checks the full rendered walkable-surface report, the mobile
forward/back convention, official-provider embed isolation/occlusion, and the
actual H.264 decode → `VideoTexture` → WebGL path for Big Buck Bunny, Sintel,
and Tears of Steel. A successful media URL response alone does not pass.

---

## Licence

**CC0 1.0 Universal** — public domain. See [LICENSE](LICENSE) for the scope
and for the third-party notes on three.js (MIT) and the Blender open movies
(CC-BY) referenced by the demo playlist.
