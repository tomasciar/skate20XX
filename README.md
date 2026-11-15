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
| **R** | Restart the run |
| **Esc** | Pause / resume |

The camera automatically follows the rider from a fixed downhill direction and distance. WASD controls the skater; steering never orbits the camera, and speed never zooms it. There are no manual camera controls.

Switching tabs or losing window focus pauses the game and clears held keys.

## Course and rider

The deterministic course streams through cedar groves, an old town, and rocky ridges. Each district lasts four 70 m chunks. The view stays clear to 120 m and fades gently to the sky by 300 m (previously 45–120 m). Terrain streams beyond this range. Optional wedge jumps, raised pads, cones, and grind rails sit outside a clear center corridor; the first chunk is clear for learning the controls. Scenery includes trees, houses, parked cars, benches, planters, rocks, lamps, mountains, and distance signs. R restarts the same course so you can practice a line.

The rider uses a sideways stance with consistent elbow/knee bend directions, connected limb lengths, and feet planted on the grip during crouches and carves. Smooth weight shifts, a pushing cycle, subtle coasting sway, and landing compression make the stance less rigid. Knee flex responds to speed, carving, braking, grinds, and landings while both soles stay planted during coasting. Visible wheel contacts are fitted to the road and ramp surfaces independently of suspension travel; grind height matches the truck geometry. The board has a rounded maple deck, raised ends, grip tape, trucks, and rotating wheels.

Generation rules live in `src/world/generation.ts`; scenery in `src/world/scenery.ts`. Static scenery is merged by material within each chunk. The road collider stays continuous while the player, camera, and streamed obstacles shift together at chunk boundaries.

## Speed and grinds

Speed gains taper toward a 199 mph ceiling: on a straight downhill run, the rider reaches 180 mph in roughly 30 seconds. W starts a push only at or below 20 mph; a stroke already underway finishes if speed crosses the cutoff, then no new stroke starts until speed drops again. Downhill acceleration continues without pushing above 20 mph. S brakes, and the physical velocity is capped even in the air. Physics runs at 120 Hz for the faster travel.

Ollie onto a rail with the board aligned along it to automatically catch a 50–50 grind. Keep the balance marker centered using A/D; holding too far to one side slips off. Release Space to ollie out, or ride off the end. S brakes on rails too. Grinds preserve momentum and include gravity and sliding friction; they work facing either direction. Longer 48 m rail sections appear every fourth chunk, with shorter rails mixed into other encounters.

A/D rotations are unrestricted. An airborne 180 can land switch while retaining downhill momentum. The camera stays pointed downhill throughout.

## Check

```bash
npm test
npm run build
```

Tests cover 10,000 generated layouts, input consumption, and two minutes of actual Rapier simulation with repeated jumps, a wedge launch, braking, high-speed acceleration, 180s, switch landings, rail catches/exits, and bounded streamed geometry/colliders. Additional tests cover grind balance, rail endpoints, the speed curve, joint geometry, planted soles, smooth pose transitions, the push cutoff and complete stroke behavior, coasting sway and load response, visibility/streaming coverage, and wheel contact gaps on asphalt and ramps (within 2 mm). They run without a browser; visual rendering still needs a browser check.
