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
| **Arrow keys** (air) | Up shove-it, down 180, left kickflip, right heelflip; diagonals varial / hardflip |
| **Shift + arrows** (air) | Press a screen direction to choose a grab/tweak; hold to lock it through spins |
| **R** | Restart the run |
| **Esc** | Pause / resume |
| **M** | Mute / unmute sound |

The camera automatically follows the rider from a fixed downhill direction and distance. WASD controls the skater; steering never orbits the camera, and speed never zooms it. There are no manual camera controls.

Switching tabs or losing window focus pauses the game and clears held keys.

## Course and rider

The deterministic course streams through cedar groves, an old town, and rocky ridges. It stays mostly downhill, with smoothly changing grades, genuinely level stretches and short rises of about 1.5 degrees. Grade transitions extend over 210 m so they remain rideable at high speed. Each district lasts four 70 m chunks. The view stays clear to 120 m and fades gently to the sky by 300 m (previously 45–120 m). Terrain streams beyond this range. Optional wedge jumps, raised pads, cones, and grind rails sit outside a clear center corridor; the first chunk is clear for learning the controls. The landscape extends 260 m to each side, with continuous rolling ground, roadside paths, forest belts, village clusters, stone foundations, fences, picnic tables, rock outcrops, and distant peaks. Trees, houses, parked cars, benches, planters, lamps, signs, and the terrain all have collision generated from their meshes. R restarts the same course so you can practice a line.

The rider has shorter, sturdier legs and uses a sideways stance with consistent elbow/knee bend directions, connected limb lengths, and feet planted on the grip during crouches and carves. Smooth weight shifts, a pushing cycle, subtle coasting sway, and landing compression make the stance less rigid. Knee flex responds to speed, carving, braking, grinds, and landings while both soles stay planted during coasting. Visible wheel contacts are fitted to the road and ramp surfaces independently of suspension travel; grind height matches the truck geometry. The board has a rounded maple deck, raised ends, grip tape, trucks, and rotating wheels.

Generation rules live in `src/world/generation.ts`; scenery in `src/world/scenery.ts`. Static scenery is merged by material within each chunk. The road mesh and collider follow the same sampled height profile. The player, camera, and all streamed geometry shift together horizontally and vertically at chunk boundaries to keep coordinates near the origin.

## Speed and grinds

Speed gains taper toward a 199 mph ceiling: the rider reaches 180 mph in roughly 40 seconds on the rolling course (about 30 seconds on uninterrupted downhill). Flats preserve momentum and small rises slow the rider naturally. W starts a push only at or below 20 mph; a stroke already underway finishes if speed crosses the cutoff, then no new stroke starts until speed drops again. Downhill acceleration continues without pushing above 20 mph. S brakes, and the physical velocity is capped even in the air. Physics runs at 120 Hz for the faster travel.

Ollie onto a rail with the board aligned along it to automatically catch a 50–50 grind. Keep the balance marker centered using A/D; holding too far to one side slips off. Release Space to ollie out, or ride off the end. S brakes on rails too. Grinds preserve momentum and include gravity and sliding friction; they work facing either direction. Longer 48 m rail sections appear every fourth chunk, with shorter rails mixed into other encounters.

Shift changes only the arrow trick controls: movement, gravity, and A/D steering continue normally. Hold Shift with an arrow in the air for a whole-body grab tweak; release either key to let go. Each arrow press chooses a direction from the rider’s current facing on screen: toward the chest pushes the board outward, away from the chest pulls it behind into a tomahawk-style grab, and toward the nose or tail gives a boned extension. A left-facing rider uses Left to push out and Right to grab behind. The selected trick stays locked through spins until the arrow is released; the next press recalculates it. The backward grab keeps the hips raised, folds the knees below the waist and lifts the board behind the rider. Hands and feet follow the translated/tilted board throughout the hold. Grabs cannot start during a flip or grind, and landing clears the grab.

A/D rotations are unrestricted. An airborne 180 can land switch while retaining downhill momentum. The camera stays pointed downhill throughout.

## Sound

Audio starts after clicking or pressing Enter to ride. Separate, band-limited wheel rumble and soft wind textures respond to actual speed; a gentle airborne wind baseline keeps jumps from going silent; rolling stops in the air, rail grinding has a metallic scrape, and braking/carving add a wheel scrub. Push strokes, ollies, tricks, landings, rail catches/exits, and bails have distinct effects triggered by physics transitions.

Press M or use the Sound button to mute. The volume slider and mute setting persist locally. Pausing, changing tabs, or losing focus fades and suspends audio; resuming reuses the audio graph. Ollies and landings use short, unpitched wood/truck "chk" contacts, with a second truck contact on landing. Metallic rail clinks use brief resonant transients. Wind stays quiet, and output filtering removes hiss and excess bass. Effects are synthesized locally with Web Audio, with no external audio assets or downloads. If audio is unavailable, the game remains playable.

## Environment collision

Static solid meshes are baked into one triangle collider per chunk before render batching. This includes tree trunks and crowns, walls and roofs, car bodies and wheels, benches and tables, fence posts and rails, signs, lamps, rocks, and ground. Open spaces such as gaps under benches remain open. Thin road paint uses the underlying road surface. Road and guardrail collision follow their visible graded meshes, with one combined collider per chunk.

The ground uses the same deterministic height triangles for rendering, physics, and scenery placement, so adjoining chunks meet without cracks. Trees and buildings stand vertically. Benches, picnic tables, buildings, parked cars and planters sit on solid level terraces that cover their terrain footprints; fences align to the local slope. The outer landscape supports riding and ragdoll collisions beyond the road. Landscape randomness is separate from encounter layouts, preserving the existing jump/grind sequence.

## Crashes

Hard obstacle impacts, severe landings, failed flip tricks, and leaving the generated landscape trigger a ragdoll crash. The rider separates from the board with their incoming momentum; the existing character mesh is driven by 11 rigid bodies and 10 joints; hands and shoes share compound bodies with their forearms and shins. Knees and elbows use limited hinges, while shoulders, hips, neck, and waist remain flexible. The board tumbles independently and the fixed downhill camera follows the rider.

Ride controls are disabled during the tumble. The run restarts after about 3.2 seconds, or press R to restart immediately. Pausing freezes the crash as well. Ragdoll bodies are created only on a crash and completely removed on recovery, including their joints; extra collision substeps are restored afterward.

## Performance

Physics stays at 120 Hz, while presentation and wheel-contact fitting run once per display frame. The rider and chase target interpolate between simulation steps to avoid uneven motion on high refresh rate screens. Rigid deck, head, and shoe details are combined by material; static scenery matrices and rail metadata are cached, and surfaces that do not need to cast shadows skip that pass.

The renderer caps its initial drawing buffer at about two million pixels, with a maximum pixel ratio of 1.5. Sustained slow frames reduce resolution gradually; stable fast frames restore it. The course visibility remains 300 m. Chunk preparation runs ahead of crossings in small cooperative steps during browser idle time when available. Prop construction, collision baking, and material batching yield between batches; partial chunks remain hidden until ready. Synchronous completion remains a fallback if the rider reaches the next window before preparation finishes. Shared construction geometry reduces allocation, and each scenery chunk uses one fixed body/collider. Paused scenes only redraw when needed, and HUD text updates at 10 Hz.

`npm run bench` runs a 60-second CPU simulation and reports frame work and idle chunk preparation separately. It warms up physics first, as the game does before starting, and excludes browser/GPU rendering, so these timings are not FPS measurements.

## Check

```bash
npm test
npm run build
```

Tests cover 10,000 generated layouts, input consumption, and two minutes of actual Rapier simulation with repeated jumps, a wedge launch, braking, high-speed acceleration, 180s, switch landings, rail catches/exits, and bounded streamed geometry/colliders. Additional tests cover grind balance, rail endpoints, the speed curve, joint geometry, planted soles, smooth pose transitions, the push cutoff and complete stroke behavior, coasting sway and load response, visibility/streaming coverage, interpolation across origin shifts, adaptive resolution, shorter leg proportions, and wheel contact gaps on asphalt and ramps (within 2 mm). Environment tests compare mesh and collider ray hits, check gaps under benches, verify terrain seams and support heights, fire a physical object into a generated tree, exercise incremental streaming, and ride the outer terrain. Crash tests cover high-speed joint stability, tucked grab poses, world rebasing, obstacle impacts, severe landings, small bumps, recovery, and physics cleanup. Grab tests cover Shift routing, release/landing behavior, flip exclusion, and hand-to-board contact. Audio tests cover event timing, repeated-state suppression, speed mixing, synthesized buffers, smooth loop boundaries and frequency balance, mute/volume persistence, and pause/resume cleanup using a simulated audio context. Tests run without a browser; rendering and the final sound mix still need browser playtesting.
