# Riding surfaces and world scale

Visual shape, riding support and obstruction are related but have different jobs.
Keep sharp visual architecture. Make collision forgiving only where a specific
feature benefits from it, and keep the board's response continuous.

## Collision authoring policy

Exact visible solids remain the default. Rounding is **opt-in**, never an automatic
blanket over a district or every prop. Use a small, authored support profile for
sidewalk risers and similarly minor transitions. The current implementation opts
in only the continuous roadside sidewalks: `physics/curbSurface.ts` eases their
shoulders over 0.22 world units while preserving the flat walking surface.

Doorways, small openings, underpasses and narrow passages should almost always
retain exact collision. Do not shrink usable clearance, bridge a gap, or extend
one side's rounding into another object's entrance. Preserve grind edges,
deliberate jump lips, thin rails and intentional drop-offs as well. Rounding a
large obstacle later must retain an obstructing steep face; it must not create an
unintended ramp onto its roof. Check approaches from both directions.

An authored support mesh is a sibling of the visual mesh. Its
`userData.collisionProxy = true` and `visible = false` keep it out of rendering;
the visual mesh opts out of collision. Both use the same source coordinates and
course warp. Collision baking includes the support, and static batching disposes
its geometry after physics has copied it. The proxy joins the existing chunk
collider, with no extra physics body or streaming lifetime. Never put a proxy
under a parent with `collision = false`.

Test actual rider crossings and passage clearance, not just a mesh's bounding box.
Do not globally inflate colliders or replace the world with a height field: roofs
and the usable ground below them must remain separate surfaces.

## Contact, takeoff and wall riding

`movement/suspension.ts` supplies physical wheel contacts. `board.ts` limits the
rate of support-normal changes; `visuals/surfaceSupport.ts` fits wheel height but
rejects a plane that disagrees with the sampled surface normals. This prevents a
board straddling different-height horizontal surfaces from inventing a steep
support plane between them. Actual curved ramps still supply their own normals.

`movement/deckFrame.ts` captures the takeoff frame and holds it for 0.18 seconds.
Ordinary jumps and yaw spins then gently shed inherited pitch/roll toward the
normal airborne stance, retaining heading. Recovery is exponential with a bounded
angular rate, so it never snaps upright. Using flip mode disables this assist for
the remainder of that air, including when flipping is paused; deliberate rotations
remain manual. Recovery changes orientation only, not flight velocity. A short query grace during floating-origin
rebases keeps a temporarily missing probe from inventing a new flight; it does
not supply suspension force or override an intentional launch. Flip input still acts through the aerial
rotation system. Landing clears that launch offset before following the new
support surface. Badly tilted touchdowns are checked even when flip mode was
never enabled. Keep the short takeoff hold and manual-rotation priority when tuning recovery;
instant levelling erases a banked launch, while locking all inherited tilt through
the whole flight makes ordinary landings unnecessarily difficult.

`movement/wallRide.ts` permits brief glancing contact above 35 calibrated mph with
a broad fixed wall. The rider must approach from a bank or the air, rather than
automatically climbing a wall from flat ground. Three close-range queries require
a consistent actual face at multiple heights and longitudinal positions. A real
opening breaks support immediately. Head-on impacts, narrow posts and ceilings
retain their ordinary obstruction behavior.

Wheel forces still need real wheel contact. A limited inward assist maintains
brief wall contact, fades over the last 0.4 seconds of a 1.6-second ride, and stops
on departure or an ollie. Gravity remains active and tips the rolling direction
downward. Steering acts in the wall plane. Near the floor, a short transition
returns the board to ground support without teleporting it. Obstruction tests
exempt only the currently eligible wall normal, not every nearby object.

Keep these assists bounded, reuse query workspaces, and avoid per-object runtime
controllers. Add regression rides for new entry/exit shapes before increasing
catch distance, adhesion or smoothing allowances.

## Scale and measurements

`src/units.ts` is the measurement boundary. The default boy's standing anatomical
height is 1.285 simulation units from sole to crown, derived from hip height, head
mount and head geometry; helmets, hair and riding crouch are excluded. Treat that
height as 1.75 metres: one world unit is about 1.362 metres. This fixed reference
does not change with rider choice, animation or equipment.

The physics engine, planners, authoring dimensions and streaming distances remain
in world units. Their velocities are world units per second. HUD distance, MPH,
grind/manual distance and distance-based scoring use `metres()`/`mph()` at their
boundaries. Use `speedFromMph()` for rules specified in real MPH, such as the
20-mph new-push cutoff and the wall-catch threshold. Do not multiply a world
velocity directly by a metres-per-second conversion constant.

Existing gravity, boost strengths and movement tuning remain game-tuned in world
units, preserving the established feel. Correcting the measurement scale does not
make those accelerations Earth gravity. New physical measurements should use the
shared conversions; never rescale the entire world when changing the readout.
Planner distances in environment examples refer to source world coordinates;
the HUD displays their calibrated metre equivalents.

Displayed run distance remains forward progress down the course, rather than an
odometer including every carve and jump. MPH uses the full 3D velocity. Both
use the same fixed length calibration.
