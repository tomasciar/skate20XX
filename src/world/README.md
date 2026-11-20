# World code

`ramp.ts` is the game-facing entry point. It exports `createRamp`, `RampWorld` and
`RAMP` (defined in `config.ts`). It owns chunk lifetime, preparation budgets,
origin rebasing, physics activation and the world's runtime queries.

| Directory | Responsibility |
| --- | --- |
| `planning/` | Deterministic encounter and site plans, route clearings, building approaches and roof-launch selection |
| `terrain/` | Course height/curvature, landscape mesh and matching terrain samples |
| `structures/` | Rideable building, bank, platform and ramp geometry, plus shared architectural parts |
| `props/` | Reusable scenery builders, visual variation and terrain placement |
| `environments/` | District catalog, layouts, placement reservations and landscape colourways |
| `rendering/` | Seasonal appearance, materials, textures, lighting, baked shadows and static batching |
| `physics/` | Static collision baking and movable cone behavior |
| `streaming/` | Incremental chunk content construction and internal chunk ownership types |

## Chunk construction

`streaming/chunkBuilder.ts` adds the road, terrain, district scenery, planned
structures and encounters to a hidden chunk root. It yields between bounded
pieces of work and returns loose cone meshes and the baked-shadow builder.

`ramp.ts` then bakes collision, creates the collider, batches static meshes,
activates loose props and makes the completed chunk visible. Explicit `frame`
yields keep collider construction separate from geometry work during finite-budget
preparation. Boot and reset can consume the same generator synchronously.

Keep disposal, rebasing and ownership in the runtime. Content builders should not
create their own streaming windows or register untracked physics bodies.

## Adding content

- Add reusable scenery to `props/nature.ts`, `buildings.ts`, `vehicles.ts`,
  `furniture.ts`, `landmarks.ts` or `city.ts`. Import the concrete family in runtime
  layouts. `props/scenery.ts` retains the aggregate API used by tests and tools.
- Reuse materials, primitive geometry and builder helpers from `props/parts.ts`.
  Rideable architecture has its own shared parts in `structures/parts.ts`.
- Put new route/site rules in `planning/` and their visible meshes in
  `structures/`. Multi-chunk areas use `planning/places.ts` and
  `structures/places.ts`; each chunk owns only its own surface slices. Reserve
  approaches, footprints and landing space before ordinary
  scenery placement. Build terrain banks into the sampled landscape when possible.
- Put district composition in `environments/`, independently of riding mode.
  See [the environment guide](../../docs/environments.md) for catalog registration,
  seeded variety and winter compatibility.

Shared source geometries remain immutable. Course warping clones both their
geometry and ownership metadata. Collision is baked before rendering batches are
merged; decorative meshes opt out through `userData.collision = false`. Keep
shared material identity and placement RNG order stable when reorganizing builders.
`structures/placeDetails.ts` and `placeFurnishings.ts` add facade-scale detail and
recognizable furnishings. `rendering/architectureFinish.ts` caches their shared
surface tiles and projects UVs in metres without expanding indexed geometry.
Traffic surfaces share the main road material; plaza paving has its own finish.
Tall buildings can carry a shared `levelBase` course anchor; chunk warping then
keeps walls vertical and floors level, including across chunk boundaries.

## Checks

Use the relevant world tests for a content change. `tests/streaming.test.ts`
checks preparation boundaries; environment, variety and riding tests cover shared
materials, seasonal compatibility, collision, rebasing and complete route rides.
Run `npm run build` to check imports and TypeScript. `npm run bench:world` reports
CPU preparation cost and content counts, independently of browser/GPU rendering.

Collision smoothing is an explicit authoring choice, not a default inflation of
scenery. Keep entryways and small gaps exact. Follow the
[surface and measurement policy](../../docs/physics-surfaces.md) for support
proxies, passage clearance, wall riding and source world units.
