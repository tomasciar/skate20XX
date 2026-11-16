# Rider balance and arm motion

Ordinary riding combines an asymmetric resting stance with small balance responses. The leading arm sits a little forward, the trailing arm hangs closer to the hip, and both elbows retain some flex. The chest opens slightly toward the direction of travel. Slow weight adjustments and breathing stay small enough for straight riding to look settled.

The second tuning pass loosens elbow reach, lifts the hands slightly, and gives the arms more room beside the body. Hips turn underneath the chest, and each shoulder can drop or move forward separately. A slow shift-and-hold weight transfer between the feet gives long coasts visible movement without a vertical bob. Hip and shoulder joint anchors follow these movements in the leg solver, grip conversion, and crash capture.

`src/player/cruisePose.ts` keeps the visual response state separate from physical movement. Turn balance follows through the hips, chest, and arms at different rates. Acceleration shifts weight along the board. Changes in the measured ground incline briefly load or unload the knees, then settle on a constant grade. Input deltas are bounded; startup, landings, switch changes, zero-time menu paints, and long frame gaps cannot invent acceleration or terrain impulses.

`src/player/skaterVisual.ts` blends this state into the riding pose, including manuals and nose manuals. Manuals retain the hip/chest and shoulder movement at reduced strength, while the arms reach away from the supporting axle for balance. The existing axle pivot and planted soles stay in charge of board contact. Pushing, crouching, slides, grabs, airtime, and grinds fade out the cruising layer.

`src/player/airPose.ts` supplies a separate airborne arm layer. A single takeoff sweep eases into an asymmetric apex pose, then the arms open for descent. Yaw and flip inputs produce delayed shoulder and wrist corrections, and board tricks get a small counterbalance. Each arm eases independently. A grabbed hand fades out its air layer so the grip remains exact, while the free arm can still balance. Landing blends back into the ground pose. Resetting or starting a ragdoll clears both pose histories and hand easing.

Airborne rotation also drives the core. The controller measures actual yaw velocity (with wrapped heading differences) and projects its axis into the rider frame, including through inverted flips. Shoulders lead the hips at initiation; arms draw in during sustained rotation and open/check on release. Pitch and roll have bounded loading/release gestures over the existing flip lean. These efforts settle during a held rotation, rather than repeating every revolution. Held grabs reduce core motion to preserve reach. The current horizontal spin and flip control rates are unchanged; yaw speed is shared through `AIR_YAW_SPEED`.

`src/player/board.ts` supplies the ground incline in the direction of travel. Animation wheel roll no longer drives a body bounce. Board orientation, riding physics, planted soles, bone lengths, and the contact solver remain responsible for their existing jobs. The layer uses the shared rider rig and character proportions without adding geometry, draw calls, or animation assets.

For subsequent visual revisions, tune the resting hand positions/reach and chest offset in `skaterVisual.ts`; tune response rates and acceleration/terrain sensitivity in `cruisePose.ts`. Compare moving chase-camera views of straight riding, sustained turns, turn release, and grade transitions. A constant turn should settle into a pose, and a constant grade should not repeatedly compress the knees.

Focused checks:

```sh
node --experimental-strip-types --test tests/cruisePose.test.ts tests/pose.test.ts tests/pump.test.ts tests/grabs.test.ts tests/groundTricks.test.ts tests/characters.test.ts
node --experimental-strip-types --test tests/airRotation.test.ts tests/carve.test.ts tests/trickFeet.test.ts
node --experimental-strip-types --test tests/airPose.test.ts tests/groundTricks.test.ts tests/grabs.test.ts
npm run build
```
