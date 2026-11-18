# Player code

The root contains the player entry points: `board.ts` coordinates the simulation, `controller.ts` translates input, `dimensions.ts` defines shared measurements, and `score.ts` handles run scoring.

| Folder | Responsibility |
| --- | --- |
| `movement/` | Speed, carving, slides, pumping, grinds, air rotation, landings and crash physics |
| `tricks/` | Trick state, input latching and grab definitions |
| `animation/` | Pose response, limb solving, grab transforms and foot animation |
| `visuals/` | Shared rider rig and skateboard/snowboard presentation |
| `characters/` | Character data, appearance selection and registered model assembly |
| `characters/models/` | Character-specific heads, outfits, limb details and props |
| `characters/faces/` | Facial artwork projection, texture loading and native fallback switching |

## Character boundaries

`characters/catalog.ts` owns the roster, persistence, palettes and proportions. It has no runtime dependency on Three.js or model builders. `characters/skin.ts` applies those choices to live riders and crash clones. The existing `src/characters.ts` module remains the public selection API, re-exporting these operations for callers outside the player folder.

`characters/registry.ts` maps every character ID to a typed model definition. Each definition supplies a profile, head/outfit construction, limb details and shoes, with optional thigh, hip and hand attachments. Models can also supply a custom head, cached rig-part geometry, vertex colours, footwear visibility and fitted crash shapes. These optional policies let non-human riders use the existing skeleton without character-ID branches in the rig. Related characters can share builders. The original five designs live in `models/classicRiders.ts`; their geometry and expressions are preserved.

`characters/visuals.ts` registers attachment slots on the shared rig. Selecting a rider authors only that character's required attachments, batches their rigid details, and caches immutable templates. Instances share the templates' geometry and materials. Previously selected attachments are detached and cached per slot, keeping the animated scene small even after visiting the whole roster. The shared rig in `visuals/skaterVisual.ts` animates the bones independently of these attachments.

Slot metadata is plain data so portraits and ragdoll clones can select characters that have not been built for that clone yet. Per-slot caches use weak ownership; they do not keep expired rigs alive. Geometry and materials belong to the template cache, so switching characters and clearing crash clones must not dispose them. Character-specific props, such as Finn's sword, belong to the registry and model builders and attach to the existing bones. Mode and weapon preferences are stored on slots and applied to newly attached details before they become visible.

Shared geometry, head profiles, hands and cached limb alternatives live in `characters/geometry.ts`. Small authoring helpers, hair and insignia are alongside it. Image assets remain in `src/assets/faces/`; moving a face module must preserve its asset URL and lazy loading/cache behavior.

## Adding a character

1. Add its roster ID, name, palette and proportions in `catalog.ts`.
2. Implement its model details under `models/`, reusing existing geometry and authoring helpers where appropriate.
3. Register its builders and optional attachments in `registry.ts`. The exhaustive record requires an entry for every roster ID; the rig does not need a new dispatch branch.
4. For a facial decal, add the PNG and prompt/reference record under `src/assets/faces/`, then register its projection in `faces/`.
5. Check both riding modes, grips, planted soles, crash attachments, portraits and the existing per-rider geometry budgets.

Movement and scoring modules should not import individual character builders. Pose modules describe motion; model builders describe appearance. Folder organization itself does not change simulation timing or rendering performance.

## Animation workspaces

Physics rays, board-alignment math and rendered limb targets use per-player workspaces. `createLimbSolver` and `createGrabTransform` return reusable results for a rig; copy any result that must survive the next call. The standalone `solveLimb`, `solveArm` and `grabTransform` helpers retain fresh-result behavior for independent callers. Crash capture still creates owned vectors because the ragdoll retains that pose.

`npm run bench:rider` reports first construction, animation/matrix CPU costs and scene-object counts before and after visiting the roster. It excludes browser/GPU rendering. `tests/characterLoading.test.ts` covers deferred authoring, asset reuse, detached variants and preferences on newly selected/cloned attachments. Existing character, portrait, weapon and ragdoll tests cover their visible and physical behavior.

`models/sahur.ts` is an example of a non-human rider: overlapping cylindrical body/head sections, cached slender limb meshes, baked wood/end grain, sculpted eyes, barefoot geometry and a wrist-mounted bat. The skin applicator restores standard geometry, vertex-colour flags and footwear when switching away, including in crash clones. Cosmetic batching preserves authored vertex colours while applying the authoring material tint.

## Held weapon visibility

Weapon roots carry `userData.heldWeapon` and their normal character-selection tag. `characters/weapons.ts` combines the saved shown/hidden preference with character selection, so selecting a rider or cloning a crash cannot resurrect a hidden prop. The menu control is in `src/ui/weapons.ts`; it applies the preference to live riders and crash clones when the option changes. Weapon meshes do not create collider shapes or additional physics bodies.
