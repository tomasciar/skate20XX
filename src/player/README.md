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

`characters/visuals.ts` assembles the registered models, keeps character/mode visibility tags, and batches rigid details. The shared rig in `visuals/skaterVisual.ts` calls those assembly functions and animates the bones. Character-specific props, such as Finn's sword, belong to the registry and model builders. They attach to the existing bones so captured crash parts inherit them too.

Shared geometry, head profiles, hands and cached limb alternatives live in `characters/geometry.ts`. Small authoring helpers, hair and insignia are alongside it. Image assets remain in `src/assets/faces/`; moving a face module must preserve its asset URL and lazy loading/cache behavior.

## Adding a character

1. Add its roster ID, name, palette and proportions in `catalog.ts`.
2. Implement its model details under `models/`, reusing existing geometry and authoring helpers where appropriate.
3. Register its builders and optional attachments in `registry.ts`. The exhaustive record requires an entry for every roster ID; the rig does not need a new dispatch branch.
4. For a facial decal, add the PNG and prompt/reference record under `src/assets/faces/`, then register its projection in `faces/`.
5. Check both riding modes, grips, planted soles, crash attachments, portraits and the existing per-rider geometry budgets.

Movement and scoring modules should not import individual character builders. Pose modules describe motion; model builders describe appearance. Folder organization itself does not change simulation timing or rendering performance.

`models/sahur.ts` is an example of a non-human rider: overlapping cylindrical body/head sections, cached slender limb meshes, baked wood/end grain, sculpted eyes, barefoot geometry and a wrist-mounted bat. The skin applicator restores standard geometry, vertex-colour flags and footwear when switching away, including in crash clones. Cosmetic batching preserves authored vertex colours while applying the authoring material tint.
