# Character facial artwork

Goku, Naruto and Kick each have their own face illustration and head profile. Boy and Girl retain procedural faces. `src/player/faceArtwork.ts` maps the facial art over the forehead, cheeks, modeled nose and chin. `src/player/modelGeometry.ts` owns the individual head profiles. Neither changes the skeleton, bone targets, colliders or camera.

Artwork originals live in `src/assets/faces/{goku,naruto,kick}.png`. These transparent feature decals were generated with the built-in `image_gen.imagegen` tool. The complete original prompt for each image is recorded in `src/assets/faces/generation.json`; the originals are retained without edits.

The face material preserves the original animated linework and white eyes without environmental lighting washing them out. Transparent pixels expose the modeled skin underneath. Alpha testing removes faint transparent background noise; hair, helmet rims and other opaque meshes still occlude the face normally.

Goku and Naruto use a small display-time expansion of dark ink in `faceArtwork.ts`. It samples four nearby texels, adds coverage around linework, and adapts to a fraction of a screen pixel at gameplay distance. Bright eye interiors and original PNGs remain intact. Kick retains his original face material.

Goku and Naruto also have a close-fitting scalp mesh based on their own head profiles, beneath the larger locks. Its front edge preserves the forehead, with temple sideburns, ear clearance and a lower nape. The extra Naruto crown/rear locks use fewer segments to stay within the existing rider geometry budget.

## Outfit reference notes

The Turtle School 亀 mark is drawn on both of Goku's gi patches, with the front projection reversed in local X so it reads correctly from the front. The reference distinguishes this early gi from the later King Kai and 悟 variants: [Goku's gi symbols](https://dragonball.guru/all-of-gokus-gi-symbols-explained/) and [Turtle School emblem reference](https://www.thedecalmaster.com/Goku-Symbol-Master-Roshi-Kame-Vinyl-Decal-Sticker/).

Naruto's headband has the spiral, pointed leaf base, upward stem and six rivets, using the [Konoha emblem reference](https://commons.wikimedia.org/wiki/File:Simbolo_konoha.svg) and [licensed ABYstyle headband](https://www.estarland.com/product-description/AnimeMerchandise/Naruto-Shippuden-Konoha-Cosplay-Headband/80164). The back patch is a complete round red field with a dark inset whirl, distinct from the headband's leaf stem; compare the [official VIZ jacket back](https://shop.viz.com/products/naruto-bomber-jacket-naruto-uzumaki). These are code-authored contours in `characterInsignia.ts`, with cloth-surface projection rather than external textures.

`preloadCharacterFace` loads only a selected character's local artwork. It resamples the upload to a maximum 512-pixel edge, preserves alpha, and caches the material/texture across mode changes, restarts and ragdoll clones. The startup path awaits the saved rider's artwork. The rider selector marks paused scenes dirty again when a new image finishes loading. A small procedural design remains visible while loading or if an image fails, and failed loads can be retried.

The pause/start menu shows a close-up of the actual selected head on larger screens. `src/ui/riderPortrait.ts` borrows the game renderer for a 192 x 224 capture, shares the head geometry/materials, restores its viewport/scissor state, and then the normal game scene is redrawn. It adds no second WebGL context or rendering loop.

Kick's revised proportions and open-face helmet use [Martin Hsu's Disney production character sheets](https://www.martinhsudesign.com/disney-character-design), alongside the [Disney Channel press reference](https://disneyadvertising.de/app/uploads/2025/05/Presseinformation-Disney-Channel-Kick-Buttowski.pdf). The shell ends at the low brow and sides/back, leaving the chin open; its red stripe follows the same shell. A small omission in the projected face mesh removes the original illustration's nose without editing the PNG. The fallback and head profile also omit the nose.

Kick's anatomy is rendered at 76% scale with an enlarged head and a rounded suit seat attached to the pelvis. Shoe dimensions and deck contact remain full size. Feet and grip targets convert into the smaller rider's coordinates, and hips adjust slightly if a board tweak would exceed leg reach. Crash colliders match the captured anatomy; clones remember that scale when changing outfits. The board's riding collision solver and normal riding trajectory are independent of this visual scale.

When adding a face, give it a distinct profile and transparent artwork, add its asset URL/projection dimensions to `FACE_ARTWORK`, and review front, profile and three-quarter views. Keep the pupil and mouth geometry in front of the skin, and inspect headgear clearance. Character tests exercise physical invariants, model budgets, visibility, short-rider contact/grip reach, and crash-clone scaling. Face-art tests check packaged PNGs, UVs, caching, downsampling and offline fallback behavior.
