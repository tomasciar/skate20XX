# Adding an environment

Build each environment once. Its layout, props, collision, and gameplay encounters are shared by skateboarding and snowboarding. The shared appearance system supplies summer and winter materials; layout builders do not receive a riding mode or season.

See the [world code guide](../src/world/README.md) for the directory map and chunk construction flow. Runtime layouts import prop builders directly from their family modules; `props/scenery.ts` remains an aggregate API for tools.

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

Use `surface(material, role)` from `rendering/appearance.ts` for special surfaces:

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

Use `sceneryMaterial` from `props/variety.ts` for shared, tintable materials. Its optional fourth argument selects a palette role such as `paint`, `roof`, `wood`, `stone`, `foliage`, `glass`, or `accent`. For example:

```ts
const wall = sceneryMaterial(0xc5a589, 0, 0.8, 'paint');
```

An environment may specify its own optional `paint` palette in the catalog. Other environments use the common palette automatically. Use `markAsset(root, family)` to identify a prefab for shared silhouette variations. Roof groups and city window panels carry `variantPart` tags so their pitch and proportions can vary within their reserved footprints.

`palettes.ts` selects a coherent landscape colourway for each district run, independently of riding mode and placement randomness. It supplies grass and deciduous foliage colours, while conifers retain deep greens. City terrain uses the same green/yellow grass family; concrete and paving belong to built structures. The opening grove previews golden autumn. Ground colours blend across seams using the existing terrain rows; neither terrain geometry nor its collision changes. Seven warm green/yellow colourways include spring pasture, sunlit hills and olive orchard. Higher terrain blends toward warm ochre rather than grey. Add coordinated colourways here rather than new materials or seasonal layout branches.

`structures/architecture.ts` supplies rowhouses, colonnades, gabled warehouses, terraces and lofts. Layouts substitute them into existing frontage slots with the same placement reservations. Seven shared materials carry their colour variation. Pitched roofs are closed solids with outward-facing triangles; an inverted wedge exposes its bottom against the wall top and causes depth flicker. Keep facade overlays clear of backing surfaces and check new roof normals from above as well as matching collision.

The current families include tree crowns, angular and rounded rocks, low and steep roofs, vehicle body proportions, city window patterns and stepped towers, round/rectangular/wrapped bales, faceted tanks, timber/metal stacks, and painted fences. Containers and street terminals each provide twelve designs with identical solid collision within their family; thin painted details add no collision.

A second independent seed combines the original variants with gable, hip, saltbox, and single-slope roof profiles; flat, slanted, curved, and short awnings; slatted and backless benches; vehicle stripes, roof racks, and signs; and conical silo/tank caps. These details reuse shared geometry and materials. Roofs stay inside their original horizontal envelope, and each roof profile is a closed solid that shares its visible surface with collision.

Tints become half-float vertex colours during static batching, sharing the original materials. Constant colour attributes use a bounded cache of 512 entries. Batching restores half-float decoding after merging. Winter materials retain the vertex colours beneath the shared snow coating; no material or texture is created for each colour combination. Shopfront lettering uses one shared sixteen-label atlas, still 512 by 512 pixels.

Thin glazing and sign overlays use `facadeMaterial` for a small depth bias that survives winter material cloning. City window panels also stand 45 mm ahead of their backing walls; avoid coplanar decoration or very small gaps that can flicker at the course's long view distance.

Run `tests/variety.test.ts` for repeatability, shared collision, colour encoding, and merged summer/winter checks. `npm run bench:world` reports per-environment object and triangle counts, render batches, and CPU chunk-preparation time. It excludes browser/GPU rendering.

## Performance and collision

Keep geometry, material, and collision complexity controlled per section. The current pipeline bakes solid visible meshes into chunk collision; set `object.userData.collision = false` for decorative parts that should not collide. Snow changes materials only. Existing placement metadata (`pad`, `slope`, upright) remains shared by both modes.

## Rideable surroundings and roof routes

`exploration.ts` describes shared terrain banks, winding ground corridors and taller building sites. The rolling belt near the road stays manageable; farther hills retain stronger relief. Road shoulders and footpaths meet the landscape within a few centimetres, and short ridge guardrails leave planned entrances open. The main road geometry and grade remain unchanged.

`explorationExclusions` reserves ground routes, roof approaches, building footprints and exit areas before ordinary scenery is queued. The ground line detours behind the warehouse and alongside taller buildings rather than terminating inside them. These plans are pure, seeded by course position and independent of riding mode. New layouts receive the same reservations through `DistrictContext.exclusions`.

`workshop.ts` supplies the existing low roof line. `warehouseSite.ts` plans the long depot and its separate loading ramp; `warehouse.ts` supplies their geometry. `sideBuildings.ts` adds tall, elongated buildings with main roofs from 12 to 36 m and upper setbacks. A broad terrain bank meets each roof at its uphill end; a lower exit bank offers a landing beyond it. The first taller building previews this at 132–312 m on the left. Later sites alternate sides, height and length without increasing their width substantially.

The owner of each large building remains in the existing trailing stream until the player has passed its roof. Adjacent chunks reserve the entire footprint and landing area. Mesh construction, warping, collision and batching run incrementally. Materials from `structures/parts.ts` are shared and retain winter support; no extra lights, textures, trigger bodies or automatic movement are needed. Terrain colliders weld internal edges so off-road carving cannot hit triangle seams as though they were walls. The circular-opening feature and scoring trigger have been removed.

Run `tests/exploration.test.ts` for connected clearings, shoulder heights, terrain access to roofs, building dimensions and complete off-road/rooftop rides. `tests/worldExpansion.test.ts` checks regional palettes, roof normals, existing roof lines, seasonal switching and origin rebasing. Both work in skate and snowboard modes.


## Roof launches and rideable architecture

`roofPlan.ts` chooses one roof exit in three per building family. `roofLaunch.ts` supplies a closed curved kicker, with a flat lane beside it. Roof geometry, collision and player momentum produce the launch; no artificial impulse is applied. Source geometry includes the course seams before warping. Enabled roof sites reserve 160 m of landing space, including neighbouring chunks. Flat exits keep their shorter clearances.

`ridingSites.ts` plans occasional pavilions and open banked channels along existing ground routes. Early examples appear at 568–624 m on the right and 708–764 m on the left. A site is skipped when it would overlap another building approach or rooftop landing. Adjacent chunks reserve the complete footprint and exit before filler scenery is queued.

`ridingStructures.ts` constructs closed solids using the same terrain samples for their bases. Sloping pavilion roofs provide an elevated line with recessed facade glazing. Banked channels have a broad open center and eased entries/exits, letting riders carve their sides while moving downhill. A shared depth-biased surface finish prevents the zero-height joins from flickering; facade trim stays decorative against solid backing. All parts use ordinary static batching, collision and winter coating.

See [world interaction references](world-interactions.md) for the researched design examples and the adaptations used here. `tests/ridingStructures.test.ts` checks grass colours, matched visible/physical surfaces, launch/bypass placement, full structure rides and roof-kicker landings in both riding modes.


## Standalone banks and sharper side routes

`terrainBanks.ts` plans three building-independent bank types: a crest boost, a crest kicker and an empty grassy crest. Their height belongs to `landscape.ts`, so render support, scenery placement and terrain collision all sample the same continuous surface. Core/edge samples are included in the terrain grid. `terrainBankExclusions` reserves a branch from the normal ground route, the bank center and a landing corridor. The banks repeat sparsely and keep the asphalt and shoulders unchanged.

`bankFeatures.ts` only supplies the crest furniture. Boost markings have no raised collision; detection uses the pad's exact horizontal bounds and sampled ground height, so airborne flyovers do not activate it. It uses the existing speed-target boost behavior, retaining faster incoming momentum. The launch bank reuses the closed curved kicker. The plain bank adds no object at all.

Taller buildings branch toward their crest before the steep part of the hill. Approach length follows building height to keep the entry grade manageable, and lookup looks ahead by the maximum approach lead rather than a fixed chunk offset. This avoids introducing the tall bank partway through its rise. Their landing banks also lengthen with height. Facades above 24 m combine floors into larger window bays to bound detail cost, and the final band fits below the roof.

The `cliff` entry in `ridingSites.ts` sweeps a 12 m shelf through a sharper S-turn, fully beside the main road. `ridingPathX` supplies the curve for both geometry and scenery reservations. The surface is gently banked toward the turn, with eased entry/exit ramps and closed stone sides. Shared low-poly outcrops sit outside its riding width. The source chunk remains retained past the end of the shelf.

When warping shared geometry, clone its `userData` too before changing ownership flags: Three.js `BufferGeometry.clone()` retains the metadata object by reference. Removing `shared` from that object corrupts ownership of later instances. `tests/terrainAdventure.test.ts` verifies unchanged shared templates and finite streamed geometry through resets, complete rides on the banks, the early taller roof and the sharper shelf in both modes, along with boost detection and terrain continuity.

## Composed places

`planning/places.ts` adds occasional areas across several chunks: a terraced plaza,
an asymmetric high-rise street with connected parking roofs, and an industrial
loading yard with a roof bridge and an open banked channel. They are independent
of district and riding mode. Their silhouettes, open ground and connected lines
provide larger contrasts than individual prop variations. City and village
frontages also use several seeded lot arrangements, setbacks and small offsets;
ordinary street density stays bounded.

The first examples start at 420 m on the left, 1,390 m on the right, and 2,020 m on
the left. Approaches begin earlier. Later locations use seeded offsets in broad
sectors, alternate area types, and skip candidates that conflict with existing
building approaches, banks or riding structures. A bounded planning cache avoids
repeating those checks for every terrain sample. Skipped candidates leave ordinary
landscape rather than forcing a dense encounter.

`structures/places.ts` supplies the geometry. A place's surfaces are sliced into
ordinary 70 m chunks on a shared 5 m longitudinal lattice, including the existing
course seams. Ground grading, scenery clearances and surface patches follow the
same plan. Terraces have eased banks; roof entries and exits are broad, and a long
crossing connects the two roofs. Bridges and parking decks are slabs with open
space below. The industrial roof kicker has a flat bypass. The main road remains
available beside every route; no automatic steering, scoring trigger or launch
impulse is needed.

Place clearings replace filler before its assets are constructed. Detail geometry
uses shared architecture/prop materials and joins the existing static batches.
There are no new lights, texture atlases, physics bodies or retention windows.
Approach markings and surface finishes use depth bias against their solid backing.
Tall towers carry a common `levelBase` anchor through course warping so their walls
stay vertical and their floors remain level across chunks; foundations extend
below the hill. Rideable banks and decks continue to follow the hill profile.

Use `tests/places.test.ts` for long-run planning, complete terrace/roof/bridge rides
in both modes, bridge underpasses, seasonal material sharing, tower alignment and
content budgets. New compositions should reuse the existing patch and chunk
ownership model; add a new abstraction only when a concrete layout needs it.

The detail pass lives in `structures/placeDetails.ts`: the plaza has glazed
shopfronts, coloured awnings, planted tree beds, paving joints, lamps and low
skateable ledges. Parking decks have stall paint, capped edge walls, column
markings, bridge ribs and rooftop air handlers. The industrial yard adds separate
roller doors with ribs and jambs, bollards, drains, freight pallets and cylindrical
pipes on a gantry. Equipment sits along roof margins and clear of the connected
riding line. Towers include lobby glazing and entrance canopies, facade fins,
window/floor divisions, front and rear windows and rooftop setbacks.

Detail uses the existing materials; shop lettering reuses the city’s shared
sixteen-label atlas through `makeShopSign`. Glazing and thin floor bands use only
their visible outward faces, backed by solid walls. Ground-backed surface bases
omit buried bottom faces; exposed bridge/deck undersides remain closed. These
savings keep the more detailed place meshes under the existing 6,500-triangle
budget per chunk. Solid equipment, ledges, awnings and pipe supports enter the
normal chunk collider; paint, window panels and thin trim remain decorative.

`placeFurnishings.ts` adds the larger silhouettes: stone arches with an open riding
lane below, a gabled café kiosk and outdoor seating, planted borders, a parking
stair house, stacked shipping containers and capped storage silos. Towers also
have projecting balconies and a supported rooftop water tank. Furnishings keep
ordinary chunk ownership and solid collision, and stay clear of the connected
roof and terrace lines.

`rendering/architectureFinish.ts` supplies shared 256-pixel brick, concrete,
stone/paving, sheet-metal and window-interior tiles. City buildings and the shared
architectural families use the same tiles. Colours still come from the existing
material/tint palettes; textures add mortar, panel joints, blinds and wear rather
than another material for every colour. Finish maps are lazy and cached by type,
retain mipmaps, and carry into the existing winter coating. Paint stays a separate
untextured finish for awnings, chairs and plants.

UVs use metres in the source structure before course warping, or the prop's local
transform during batching. This preserves indexed geometry and anchors patterns
through origin rebasing. `architectureUV` marks already-projected meshes so batching
does not remap them. Sign-atlas and explicitly mapped asphalt UVs remain intact.
The flat interiors of deck surfaces need only their across-width endpoints;
terrace banks, channel transitions and swept exits retain their required samples.
This saves triangles for the additional furnishings.

Parking decks, their entry/exit banks and loading yards use the **same asphalt
material as the main road**, retaining that road's seasonal treatment. Roof kickers
also use asphalt, with a cached depth-biased finish for their flush entry. Pale
stone paving is confined to plaza surfaces. `tests/places.test.ts` checks the road
material contract in both seasons, shared texture ownership and metre-scale UVs,
arch normals and physical headroom, full rides and the per-chunk geometry budget.
