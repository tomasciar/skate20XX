# Adding an environment

Build each environment once. Its layout, props, collision, and gameplay encounters are shared by skateboarding and snowboarding. The shared appearance system supplies summer and winter materials; layout builders do not receive a riding mode or season.

1. Add an entry to `src/world/environments/catalog.ts` with a stable ID, display name, default tree mix, and ground palette `[left colour, right colour, rock amount]`. Keep existing IDs and catalog ordering stable. Ground colours blend across district boundaries automatically.
2. Add a layout module beside `grove.ts`, `village.ts`, etc. Use `LayoutContext` helpers to reserve space, queue props, and scatter scenery. Register the builder in `registry.ts`; TypeScript requires one builder for every catalog entry.
3. Run the environment contract tests and the build:

   ```sh
   node --experimental-strip-types --test tests/environments.test.ts tests/districts.test.ts tests/mode.test.ts
   npm run build
   ```

Each registered environment is automatically included in the streaming and skate/snow compatibility checks. Keep placement clear of the road and paths; reuse the common terrain placement and incremental construction helpers.

## Props and seasonal appearance

Props queued through `place`, `scatter`, and `forest` receive the `scenery` surface role automatically when their materials have no explicit role. Standard scenery materials gain snow on upward-facing surfaces, including new architecture. This uses the same geometry and collision in both seasons. Custom material shader hooks are composed with the winter coating.

Use `surface(material, role)` from `appearance.ts` for special surfaces:

| Role | Winter treatment |
| --- | --- |
| `scenery` | Snow coating on upward-facing standard-material surfaces |
| `road` | Packed snow texture and colour |
| `terrain` | Powder texture and snow coating |
| `path`, `barrier` | Winter palette and snow coating |
| `line` | Winter road-marking colour |
| `obstacle` | Keep the source material and readable gameplay colours |

Reuse materials across props to retain material batching and cached winter variants. ShaderMaterial and other custom material types need an explicit seasonal implementation; use MeshStandardMaterial for automatic snow coverage. Materials with `userData.perChunk` retain their source material and texture ownership, as used by district signs.

The existing UI maps skate mode to summer and snowboard mode to winter through `seasonForRideMode`. Appearance itself accepts seasons, independently of the environment and player physics. No separate snow layout, winter prop builder, or per-environment mode switch is needed.

## Seeded asset variety

Every queued prop receives a separate visual seed based on its district, chunk, and placement slot. Shape and palette choices never consume the placement RNG. Existing object counts, positions, gameplay encounter IDs, and density therefore stay stable when visual variations are expanded.

Use `sceneryMaterial` from `variety.ts` for shared, tintable materials. Its optional fourth argument selects a palette role such as `paint`, `roof`, `wood`, `stone`, `foliage`, `glass`, or `accent`. For example:

```ts
const wall = sceneryMaterial(0xc5a589, 0, 0.8, 'paint');
```

An environment may specify its own optional `paint` palette in the catalog. Other environments use the common palette automatically. Use `markAsset(root, family)` to identify a prefab for shared silhouette variations. Roof groups and city window panels carry `variantPart` tags so their pitch and proportions can vary within their reserved footprints.

The current families include tree crowns, angular and rounded rocks, low and steep roofs, vehicle body proportions, city window patterns and stepped towers, round/rectangular/wrapped bales, faceted tanks, timber/metal stacks, and painted fences. Containers and street terminals each provide twelve designs with identical solid collision within their family; thin painted details add no collision.

A second independent seed combines the original variants with gable, hip, saltbox, and single-slope roof profiles; flat, slanted, curved, and short awnings; slatted and backless benches; vehicle stripes, roof racks, and signs; and conical silo/tank caps. These details reuse shared geometry and materials. Roofs stay inside their original horizontal envelope, and each roof profile is a closed solid that shares its visible surface with collision.

Tints become half-float vertex colours during static batching, sharing the original materials. Constant colour attributes use a bounded cache of 512 entries. Batching restores half-float decoding after merging. Winter materials retain the vertex colours beneath the shared snow coating; no material or texture is created for each colour combination. Shopfront lettering uses one shared sixteen-label atlas, still 512 by 512 pixels.

Thin glazing and sign overlays use `facadeMaterial` for a small depth bias that survives winter material cloning. City window panels also stand 45 mm ahead of their backing walls; avoid coplanar decoration or very small gaps that can flicker at the course's long view distance.

Run `tests/variety.test.ts` for repeatability, shared collision, colour encoding, and merged summer/winter checks. `npm run bench:world` reports per-environment object and triangle counts, render batches, and CPU chunk-preparation time. It excludes browser/GPU rendering.

## Performance and collision

Keep geometry, material, and collision complexity controlled per section. The current pipeline bakes solid visible meshes into chunk collision; set `object.userData.collision = false` for decorative parts that should not collide. Snow changes materials only. Existing placement metadata (`pad`, `slope`, upright) remains shared by both modes.
