# SKATE5

A browser downhill skateboarding game built with Three.js, Rapier physics, TypeScript, and Vite.

## Run

Use Node.js 22.19+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Click or press Enter to start.

## Controls

| Input | Action |
| --- | --- |
| **W / S** | Push / brake |
| **A / D** | Carve on the road; freely rotate in the air (180s / 360s); balance on rails |
| **Space** | Hold to crouch, release to ollie |
| **Space** (air) | Toggle flip mode: W/S front/backflip, A/D barrel roll, combine for diagonals; press again to return to A/D steering |
| **Arrow keys** (air) | Up shove-it, down 180, left kickflip, right heelflip; diagonals varial / hardflip |
| **Shift + arrows** (air) | Press a screen direction to choose a grab/tweak; hold to lock it through spins |
| **R** | Restart the run |
| **Esc** | Pause / resume |
| **M** | Mute / unmute sound |

The camera automatically follows the rider and eases around the road’s bends at a fixed follow distance. WASD controls the skater; steering never orbits the camera, and speed never zooms it. There are no manual camera controls.

Switching tabs or losing window focus pauses the game and clears held keys.

## Course and rider

The deterministic course streams through six districts: Cedar Grove, Old Town, Summit Ridge, Golden Acres farmland, the Timber Mill and Downtown. Downtown first appears at 210 m, with shopfronts, apartment and office blocks, skyline towers, pocket plazas, parked cars and urban street furniture. The same city layout supports skate and snowboard modes, including automatic winter coverage. Districts arrive in runs of 3 to 7 chunks (210 to 490 m) in a seeded order that never repeats one back to back; the run always opens in the grove and visits every district within the first two kilometres. A sign marks each district boundary. It stays mostly downhill, with smoothly changing grades, genuinely level stretches and short rises of about 1.5 degrees. After a straight 280 m opening, broad sweeping bends and a smaller wave meander through the landscape. Heading changes gradually, with kilometre-scale bend radii so high-speed turns need small corrections. The road, paint, barriers, footpaths, terrain, level foundations and baked shadows share the centerline. Props remain rigid and face the local road; grind rails and ledges stay straight and align with their section of the bend. Grade transitions extend over 210 m so they remain rideable at high speed. The view stays clear to 120 m and fades gently to the sky by 300 m (previously 45–120 m). Terrain streams beyond this range. Optional wedge jumps, raised pads, cones, grind rails, and low concrete ledges sit outside a clear center corridor; the first chunk is clear for learning the controls. The landscape extends 260 m to each side. The valley slowly changes shape along the route, with one flank rising into a hillside while the other opens out, and ground cover takes on each district's colour, blending over the first 20 m of a new district. Every building, tree, vehicle, fence and prop has collision generated from its mesh. R restarts the same course so you can practice a line.

The rider has shorter, sturdier legs and uses a left-foot-forward sideways stance with the head aimed down the course as the body turns, consistent elbow/knee bend directions, connected limb lengths, and feet planted on the grip during crouches and carves. Smooth weight shifts, a pushing cycle, subtle coasting sway, and landing compression make the stance less rigid. Knee flex responds to speed, carving, braking, grinds, and landings while both soles stay planted during coasting. Visible wheel contacts are fitted to the road and ramp surfaces independently of suspension travel; grind height matches the truck geometry. The board has a rounded maple deck, raised ends, grip tape, trucks, and rotating wheels.

### Districts and architecture

Everything is laid out from the road outward: guardrail at 8 m, a footpath from 9.6 to 11.4 m, street furniture just behind it, then lots. Buildings always turn their front door toward the road and neighbouring lots never overlap.

- **Old Town**: three lots per side per chunk. Houses have one or two storeys, pitched roofs over painted gables, windows on every wall, a front step (often a porch), a chimney, a garden path, hedges, and sometimes a driveway with a parked car or a shed behind. Shops have a parapet roof, awning, display windows and a sign band. A chapel with a bell tower, pocket parks around a well, a bus shelter, regular street lamps and trees on the lot lines fill in the street; cottages sit further up the hillside.
- **Cedar Grove**: dense conifers with birch and broadleaf, undergrowth and boulders, plus a log cabin with a porch and woodpile, a trail shelter, or a picnic clearing.
- **Summit Ridge**: bare ground, boulders, cairns and sparse pines, with a lookout tower, a stone hut, a radio mast, or wind turbines on the far slopes.
- **Golden Acres**: roadside fences with a gate at the farm track, a farmhouse with barn, silos, windpump, tractor and hay bales on one side, and orchards, baled fields or fenced pasture on the other.
- **Timber Mill**: a fenced yard with a sawmill shed or warehouse and loading dock, log decks, stacked lumber, a log truck, tanks and a brick stack; the opposite side is felled to stumps with a plantation in rows beyond, and power poles follow the road.

Generation rules live in `src/world/generation.ts`, district layouts in `src/world/districts.ts`, and buildings and props in `src/world/scenery.ts`. Static scenery is merged by material within each chunk. The road mesh and collider follow the same sampled height profile. The player, camera, particles and all streamed geometry shift together sideways, vertically and along the course at chunk boundaries to keep coordinates near the origin.

## Speed and grinds

There is no fixed speed cap. Gravity accelerates the rider while rolling resistance and air drag oppose the motion; drag grows with speed, and holding Space to tuck reduces it. Resistance is tuned for the fast arcade feel: upright riding reaches about 180 mph in 40 seconds on the rolling course, while a tuck can carry the rider beyond 200 mph. Flats, climbs and hard carves shed momentum. Airborne motion and grinds also retain higher speeds and slow progressively through drag. W starts a push only at or below 20 mph; a stroke already underway finishes if speed crosses the cutoff, then no new stroke starts until speed drops again. S brakes. Physics runs at 120 Hz. Tuning values live in `src/player/speed.ts`.

Ollie onto a rail or the steel coping of a concrete ledge with the board aligned along it to automatically catch a 50–50 grind. Ledges are lower than rails (about half a metre) and solid, so riding into the end of one is a crash. Keep the balance marker centered using A/D; holding too far to one side slips off. Release Space to ollie out, or ride off the end. S brakes on rails too. Grinds preserve momentum and include gravity and sliding friction; they work facing either direction. Longer 48 m rail sections appear every fourth chunk, with shorter rails mixed into other encounters.

Shift changes only the arrow trick controls: movement, gravity, and A/D steering continue normally. Hold Shift with an arrow in the air for a whole-body grab tweak; release either key to let go. Each arrow press chooses a direction from the rider’s current facing on screen: toward the chest pushes the board outward, away from the chest pulls it behind into a tomahawk-style grab, and toward the nose or tail gives a boned extension. A left-facing rider uses Left to push out and Right to grab behind. The selected trick stays locked through spins until the arrow is released; the next press recalculates it. The backward grab keeps the hips raised, folds the knees below the waist and lifts the board behind the rider. Hands and feet follow the translated/tilted board throughout the hold. Grabs cannot start during a flip or grind, and landing clears the grab.

## Carving

Steering shifts the rider's weight onto an edge rather than turning the board directly: the lean builds over a fraction of a second, the deck rolls on its trucks, and the turn follows the lean. At walking pace the board pivots tightly. Above roughly 30 mph the arc is limited by lateral grip, so the turning circle widens as speed rises and high-speed lines have to be set up early. The wheels roll where the board points, with only a slight slip. A full-grip carve scrubs a little speed, so wide S-turns are a way to check a fast descent, while gentle steering is nearly free. Landing with the board across the direction of travel slides and sheds speed before it rolls out. The rider leans over the inside edge of the turn as travelled, including when riding switch, folding over the toes on a toeside turn and sitting back on a heelside one, and both soles stay flat on the tilted grip. Tuning values are in `src/player/carve.ts`.

In the air, A/D rotations are unrestricted. An airborne 180 can land switch while retaining downhill momentum. The camera follows the course through bends while the rider turns independently.

## Flips

Press Space in the air to switch WASD from steering to whole-body rotation: W frontflips, S backflips, A/D barrel roll, and combined keys rotate diagonally. The keys follow the course, not the board: W always tumbles forward down the hill and D always rolls to the right of the screen, whether the rider is facing regular, switch or sideways. A full rotation takes about a second, so flips need real airtime from a fast ollie or a jump. Press Space again to stop rotating and get A/D steering back; the current tilt is kept, and another press resumes flipping. An on-screen label shows the current mode. The rider rotates around their center while the trajectory, momentum and camera target are unaffected, and the head tumbles with the body. Arrow board tricks and Shift grabs work during flips.

Landing within about 40 degrees of upright rides away and names any completed rotation (Frontflip, Backflip, Barrel Roll, Corkscrew, with Double/Triple counts). Touching down further over ragdolls. Rails can only be caught upright. A Space press in the air never charges or triggers an ollie, even if it is still held on landing.

## Board tricks

Board tricks (Shift + arrows in the air) can be chained: once the board is caught, flick again, as many times as the airtime allows. A press made mid-trick is buffered and starts on the catch. Keep the trick input held to keep the board turning: a single takes 0.45 s and each extra rotation adds about 0.22 s, up to a quadruple (Double/Triple/Quadruple Kickflip, 360/540/720 Shove-It). Releasing finishes the rotation in progress. Landing names the whole combo; touching down mid-rotation is a bail. Tuning values are at the top of `src/player/tricks.ts`.

## Landings

A touchdown is judged by how hard the wheels hit the surface and how well the board points along its travel (landing switch counts as aligned). Up to 20 m/s into the surface always rides away. Beyond that, a board within 15 degrees of its travel absorbs an extra 0.25 m/s of impact per m/s of rolling speed, so big airs at 200 mph are landable when they are straight; the allowance fades to nothing by 45 degrees, where a heavy touchdown bails. Gentle crooked landings still slide and shed speed rather than crash. Landing within 5 degrees is Perfect and within 15 is Clean: both pump a little of the touchdown back into rolling speed (10% / 5%, at most 2 m/s), and the grade is shown after the trick or flip name, or on its own after a heavy touchdown. Mid-flip, tilt from the surface counts as misalignment. Tuning values are in `src/player/landing.ts`.

## Sound

Audio starts after clicking or pressing Enter to ride. Separate, band-limited wheel rumble and soft wind textures respond to actual speed; a gentle airborne wind baseline keeps jumps from going silent; rolling stops in the air, rail grinding has a metallic scrape, and braking/carving add a wheel scrub. Push strokes, ollies, tricks, landings, rail catches/exits, and bails have distinct effects triggered by physics transitions. Ollie clicks follow successful physics pops, including rail exits, so grade changes and suspension contact chatter stay quiet.

Press M or use the Sound button to mute. The volume slider and mute setting persist locally. Pausing, changing tabs, or losing focus fades and suspends audio; resuming reuses the audio graph. Ollies and landings use short, unpitched wood/truck "chk" contacts, with a second truck contact on landing. Metallic rail clinks use brief resonant transients. Wind stays quiet, and output filtering removes hiss and excess bass. Effects are synthesized locally with Web Audio, with no external audio assets or downloads. If audio is unavailable, the game remains playable.

## Environment collision

Static solid meshes are baked into one triangle collider per chunk before render batching. This includes tree trunks and crowns, walls and roofs, car bodies and wheels, benches and tables, fence posts and rails, signs, lamps, rocks, and ground. Open spaces such as gaps under benches remain open. Thin road paint uses the underlying road surface. Road and guardrail collision follow their visible graded meshes, with one combined collider per chunk.

The ground uses the same deterministic height triangles for rendering, physics, and scenery placement, so adjoining chunks meet without cracks. Trees and buildings stand vertically. Benches, picnic tables, buildings, parked cars and planters sit on solid level terraces that cover their terrain footprints; fences align to the local slope. The outer landscape supports riding and ragdoll collisions beyond the road. Landscape randomness is separate from encounter layouts, preserving the existing jump/grind sequence.

## Crashes

Hard obstacle impacts, severe landings, inverted or sideways touchdowns after a flip, failed flip tricks, and leaving the generated landscape trigger a ragdoll crash. The rider separates from the board with their incoming momentum; the existing character mesh is driven by 11 rigid bodies and 10 joints; hands and shoes share compound bodies with their forearms and shins. Knees and elbows use limited hinges, while shoulders, hips, neck, and waist remain flexible. The board tumbles independently and the course-following camera follows the rider.

Ride controls are disabled during the tumble. The run restarts after about 3.2 seconds, or press R to restart immediately. Pausing freezes the crash as well. Ragdoll bodies are created only on a crash and completely removed on recovery, including their joints; extra collision substeps are restored afterward.

## Rendering

A procedural sky (`src/render/sky.ts`) draws a horizon-to-zenith gradient that meets the fog colour exactly, a sun with glow, drifting clouds and two hazy far ranges in one draw call. The sky also lights the scene, so metal, glass and paint pick up its colour. Scenery shadows are baked: each chunk carries one mesh of soft shadow patches draped on the ground and road, built with the chunk from every prop's size and the sun direction (`src/world/shadows.ts`). They cost one draw call per chunk, appear with the chunk and stay visible out to the fog. The real-time shadow map is reserved for the rider and board: a 1024 px map over 14 m, snapped to whole texels, so the rider's shadow is sharp and the shadow pass draws almost nothing. The road has a 1024 px texture with wheel-path wear, aggregate and fine cracks; the terrain multiplies a grass detail texture into its per-district vertex colours. Grinds throw sparks, and landings, braking and hard carves raise dust, from a fixed pool of particles (`src/render/particles.ts`).

## Performance

Physics stays at 120 Hz, while presentation and wheel-contact fitting run once per display frame. The rider and chase target interpolate between simulation steps to avoid uneven motion on high refresh rate screens. Settled wheel contacts stop fitting once the support plane converges, using reusable scratch vectors. Terrain height rows and course profile samples are cached with bounded storage. Scenery batching preserves indexed vertices, reducing stored scenery vertices by about 28% in the initial window without changing triangles or draw calls. Rigid deck, head, and shoe details are combined by material; static scenery matrices and rail metadata are cached, and surfaces that do not need to cast shadows skip that pass.

The renderer caps its initial drawing buffer at about two million pixels, with a maximum pixel ratio of 1.5. Sustained slow frames reduce resolution gradually; stable fast frames restore it. The course visibility remains 300 m. Chunk preparation runs ahead of crossings in small cooperative steps every frame, resuming where it left off until three chunks beyond the visible window are ready, so crossing into new road only moves and culls chunks. Prop construction, collision baking, and material batching yield between batches; partial chunks remain hidden until ready. Synchronous completion remains a fallback if the rider reaches the next window before preparation finishes. Shared construction geometry reduces allocation, and each scenery chunk uses one fixed body/collider. Paused scenes only redraw when needed, and HUD text updates at 10 Hz.

`npm run bench` uses a headless test driver to steer around the curves (the game always uses player input), runs a 60-second CPU simulation and reports frame work and idle chunk preparation separately. It warms up physics first, as the game does before starting, and excludes browser/GPU rendering, so these timings are not FPS measurements.

See [environment authoring](docs/environments.md) for adding districts and props that share layouts, collision, and seasonal appearance across skate and snowboard modes.

`npm run bench:world` measures environment density, render/collision triangles, static batches, and CPU chunk preparation. Scenery variants use seeded shared pieces and compact vertex colours across all six districts, including winter mode; the benchmark excludes browser/GPU rendering.

## Check

```bash
npm test
npm run build
```

Tests cover 10,000 generated layouts, district run lengths and ordering, street-facing lots that keep the road and footpath clear, doors and roofs on every building type, collision for every scenery builder, the carving model (grip-limited arcs, turn-in, speed scrub, planted soles on a tilted deck), particles, input consumption, and two minutes of actual Rapier simulation with repeated jumps, a wedge launch, braking, high-speed acceleration, 180s, switch landings, rail catches/exits, and bounded streamed geometry/colliders. Additional tests cover grind balance, rail endpoints, slope/stance-dependent speed balance, uncapped momentum on the road/in the air/on rails, joint geometry, planted soles, smooth pose transitions, the push cutoff and complete stroke behavior, coasting sway and load response, visibility/streaming coverage, interpolation across origin shifts, adaptive resolution, shorter leg proportions, and wheel contact gaps on asphalt and ramps (within 2 mm). Environment tests compare mesh and collider ray hits, check gaps under benches, verify terrain seams, level foundations, graded road and rail surfaces, vertical origin shifts and support heights, fire a physical object into a generated tree, exercise incremental streaming, and ride the outer terrain. Crash tests cover high-speed joint stability, tucked grab poses, world rebasing, obstacle impacts, severe landings, small bumps, recovery, and physics cleanup. Grab tests cover Shift routing, release/landing behavior, flip exclusion, hand/foot contact with the tilted board, rider-relative holds through full spins, and backward-grab torso clearance. Flip tests cover full and diagonal rotations, continuous axis changes, Space routing between ollies and the flip toggle, rotation about the rider's center without disturbing momentum or the camera, steering with a held tilt, independence from board tricks and grabs, head orientation, named landings, and inverted-touchdown crashes. Audio tests cover event timing, repeated-state suppression, speed mixing, synthesized buffers, smooth loop boundaries and frequency balance, mute/volume persistence, and pause/resume cleanup using a simulated audio context. Tests run without a browser; rendering and the final sound mix still need browser playtesting.
