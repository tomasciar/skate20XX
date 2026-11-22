# Adding an environment

Authoring coordinates below are source world units; the HUD uses the fixed
1.75 m rider calibration. See [riding surfaces and world scale](physics-surfaces.md)
for unit conversions and the opt-in collision policy. Keep small openings and
entryways exact when adding forgiving collision support.

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

## Authored places and the opening Foundry Quarter

Prioritize a strong, permanent stretch over adding another random prop family.
Compose its entrances, building edges, ground line, elevated line and return to
the main route together. Large courts need internal circulation and usable
features; empty asphalt and distant buildings do not make a place. Keep room for
fast riding within those edges. Background lots can remain procedural.

Foundry Quarter occupies source coordinates 210–600 near the start. Its red-brick
shops, cream trim, covered pavement and teal/red awnings frame the existing
warehouse rather than replacing it. Cafe seating stays under the awnings; low
banks split the service court into optional lines. The left arcade roof exits
diagonally onto the existing descending roof bank, leaving the plaza approach
open below. The later launch bank remains clear.

The warehouse roof has a broad, gently curved link into the inner riding lane of
a three-level circular car park. A separate driveway leaves the outside branch
road **after** its rollers. An eight-unit-wide spiral makes two continuous turns,
gaining 9.2 units of real world height at roughly 3.5% grade; it can be ridden
using normal carving and pushing. Level decks and a central four-faced clock
tower give the district one recognizable silhouette. Upper landings extend
after the ramp seam, leaving the incoming spiral's headroom clear. A broad exit
descends back toward the lower court.

Parking bays and stationary cars occupy the outside of the circular decks,
leaving an inner lane open. Two slow kinematic cars maneuver in the service court
at 465 and 535, beyond the warehouse landing corridor; they never cross the main
road. Static shop details, cars, paint, tower and decks join the normal material
batches. Only these two actors update each physics step. Collision remains exact,
and summer/winter share the same routes and geometry.

The design draws on connected retail courtyards and reused industrial buildings,
including [Coal Drops Yard](https://heatherwick.com/projects/buildings/coal-drops-yard/),
as a spatial reference rather than a replica. Build subsequent places with the
same attention to connected movement and enclosure.

`tests/foundryQuarter.test.ts` checks spiral collision and headroom, full climbs
in both modes, the warehouse-to-deck ride, geometry budgets and moving-car
rebasing/lifetime. For a browser inspection, import `scripts/previewFoundry.ts`
through Vite and call `previewFoundry('overview' | 'street' | 'court' | 'spiral')`.
The helper renders the actual world and stays out of the game bundle.

## Biomes and full-width alternate roads

The catalog now includes Harbor Heights, Red Rock Canyon, Blossom Gardens and
Alpine Village alongside the original six environments. The opening still starts
in Cedar Grove and reaches Downtown at 210 source units. Harbor begins at 490,
the canyon at 910, gardens at 1,120 and alpine at 1,470. Later bags visit every
registered environment in a seeded order. These preview positions refer to source
coordinates, not the calibrated HUD metre readout.

Each new layout has several lot arrangements: working harbor versus residential
boathouses, adobe settlements versus roadside service stations, courtyard streets
versus conservatory grounds, and lodge clusters versus lift stations. Shared
building primitives and materials live in `props/districtBuildings.ts`. Eight
building silhouettes, stepped mesas and harbor cranes add different massing rather
than just more color variants. Seasonal coating and scenery tints remain shared.
`terrain/biomes.ts` shapes distant canyon walls, alpine slopes, coastal lowlands
and gentler gardens outside the riding belt, blending changes across boundaries.
The new biome palettes also persist for whole district runs.

`planning/branchRoads.ts` describes optional stone-paved roads 14–18 source units
wide and roughly 580–700 long. They split from and return to the main road,
with boulevard, parkway, esplanade and rock-cut variants. The first fork starts
at 55 and rejoins at 705, on the right. Subsequent sectors vary their side, reach,
width and sweep; candidates that collide with existing buildings, banks or
composed places are skipped. Planning uses a bounded cache and no runtime AI.

The terrain sampler grades the road bed and shoulders before generating collision.
`structures/branchRoads.ts` clips each side-road surface to the **actual terrain
triangles**, including the original cross-cell diagonal. Paint follows the same
triangles with a small depth separation. The paving meets the main deck at its exact edge and height. Its warm stone blocks keep their joints visible under a lighter winter coating. It adds no second collider, no bounding box and no raised
platform. Ten-unit samples in the outer riding belt improve road-bed resolution
without refining the entire valley. Road crossings remove both the visible
sidewalk and its invisible support proxy. Never leave collision across a visible
junction or inflate a narrow passage to make a road easier to ride.

`structures/branchFeatures.ts` adds optional banked edges, rock cuts and open
galleries with rideable roofs and outside access banks. The main lane beneath a
gallery remains clear. Roofs and access banks share the same longitudinal height
reference, so differing cross-section samples cannot introduce a step at a join.
Beams sit below the slab rather than poking through the riding surface. All
feature solids, including slab undersides, use exact
visible collision; ordinary chunk ownership slices them at the course lattice.
Approaches, riding surfaces, columns and landing space are reserved before filler
scenery is built. District-colored building frontage can follow the outer road.
The main downhill road remains available beside every branch.

`tests/branchRoads.test.ts` covers deterministic planning/cache eviction, road
clearings, road/terrain alignment, sidewalk openings, exact underpasses, seasonal
materials and a complete split-to-rejoin ride in both modes. The biome tests cover
early discovery, boundary continuity, shared assets and roof collision. Run
`npm run bench:world` after expanding these families; keep the per-chunk budgets
bounded instead of adding a separate scenery or collider layer.

### Branch play lanes and architectural details

`planning/branchPlay.ts` composes optional loading docks, roller lanes and transfer
jumps beside alternate roads. The first fork previews a dock at 300–380 source
units, its grind rail at 331–349, rollers at 395–460, and a rooftop transfer at
352–429. Other branches vary the mix. The main road, branch center lane and outside
roof access retain their flat bypasses. Transfers use actual launch and landing
solids with a seven-unit gap; no trigger or artificial launch force is involved.

Ground play lanes sample their own supporting terrain across their width so an
entry cannot inherit a small step from a different road-center height. Rooftop
ramps instead share the gallery's common height reference, with their solid bases
confined above the roof. They never extend columns through the underpass. Curved
surfaces use a one-unit longitudinal lattice, preserving the five-unit course
seams. Rooftop ramps use a cached depth-biased deck finish for stable zero-height joins.

`structures/branchPlay.ts` supplies these surfaces and the dock rails. Rail meshes
and registry endpoints are rigid and already course-warped: do not warp them a
second time in the chunk builder. Each rail has one owner chunk and uses the same
catch, balance, ollie-out, seasonal appearance and origin rebase system as other
rails. Thin edge paint and attached trim are decorative; the riding solids and
rail geometry retain exact collision.

`props/districtBuildingDetails.ts` adds attached shutters, signs, roof equipment,
timberwork, planting boxes, gutters and glazing frames to the eight building
families. Conservatory ribs follow the dome's actual meridian vertices rather
than an approximate smooth arch. Signs reuse the existing shared atlas. Large
roof equipment remains solid; small details against an existing wall do not add
collision. `districtStreetProps.ts` supplies harbor crates and bollards, cacti,
garden lanterns and ski racks. Layouts replace some bush placements with these
props rather than adding an extra density layer.

`tests/branchPlay.test.ts` verifies full dock/roller/transfer rides and catching and
ollieing out of the new rails in both modes, including a later ground-level
transfer. It also checks exact collision, underpass clearance and geometry
budgets. Fork paint now opens at paved junctions alongside the sidewalk gaps.

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

Reserve asphalt for the main downhill road. Parking decks and loading yards use cast concrete, arcade roofs use sheet metal, and branch streets use warm stone setts. Roof kickers share the deck finish with a depth bias at their flush entry. Each plaza or deck surface supplies its own visible and physical top. `tests/places.test.ts` checks the road
material contract in both seasons, shared texture ownership and metre-scale UVs,
arch normals and physical headroom, full rides and the per-chunk geometry budget.
