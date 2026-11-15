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

## Performance and collision

Keep geometry, material, and collision complexity controlled per section. The current pipeline bakes solid visible meshes into chunk collision; set `object.userData.collision = false` for decorative parts that should not collide. Snow changes materials only. Existing placement metadata (`pad`, `slope`, upright) remains shared by both modes.
