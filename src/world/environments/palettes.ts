import {districtAt} from '../planning/generation.ts';

/** Shared visual colourways; independent of riding mode, geometry and placement randomness. */
export const LANDSCAPE_PALETTES=[
  {id:'evergreen',ground:[0x52744a,0x738957],foliage:[0x244c3d,0x315c46,0x416b4c,0x597a4b,0x647d45],autumn:[0xc58e38,0xb96634,0x8a493e]},
  {id:'golden-autumn',ground:[0xb49a50,0xc3ad60],foliage:[0xcb742d,0xc14e3e,0xe0ad3f,0x8e4153,0x68466e,0x315b44],autumn:[0xd58a30,0xbd493d,0xe2b847,0x84415c,0x735076]},
  {id:'copper-valley',ground:[0x999b45,0xb8ac51],foliage:[0xb25135,0xcb8135,0x983d47,0x6a426a,0xcd9b3c,0x244b41],autumn:[0xa53f3d,0xd29237,0x86445e,0xc76532,0xc9a34e]},
  {id:'meadow',ground:[0x789052,0x9aa356],foliage:[0x42683f,0x62834a,0x799349,0x346558,0xa18e3f],autumn:[0xd2aa43,0xc67e38,0xa7594c,0x80526d]},
  {id:'spring-pasture',ground:[0x609447,0x88ab50],foliage:[0x366448,0x4e8048,0x6e9748,0x295d43,0x829e4b],autumn:[0xd6af44,0xb98236,0xc4693e]},
  {id:'sunlit-hills',ground:[0xc4ae51,0xaaa146],foliage:[0x668144,0x42734b,0xbf8335,0xd6a63c,0x8d505a],autumn:[0xe0b044,0xce8536,0xb9523f]},
  {id:'olive-orchard',ground:[0x7b913d,0xa3aa4c],foliage:[0x456d3c,0x658240,0x315e45,0x8e9b48,0xb18c3b],autumn:[0xc89b3c,0xb57536,0x995847]},
] as const;

export const BIOME_PALETTES={
  harbor:{id:'coastal-meadow',ground:[0x8f9f58,0xc2b878],foliage:[0x386d59,0x67916a,0x7f9e62,0x4a7c68],autumn:[0xc99a46,0xd4b25f,0xa16c4c]},
  canyon:{id:'red-rock',ground:[0xbf9857,0xd5b773],foliage:[0x7c8a47,0x8f9856,0x51694c,0x9b9858],autumn:[0xb7853f,0xc49c57,0x9b724b]},
  gardens:{id:'blossom-green',ground:[0x669b4c,0x95b562],foliage:[0x56854f,0x6e995d,0x478160,0xa3ac65],autumn:[0xcf8790,0xe4b6b8,0xc57890,0xdfbf78]},
  alpine:{id:'alpine-meadow',ground:[0x67844c,0xa4ac64],foliage:[0x315844,0x467452,0x6c8a58,0x859a67],autumn:[0xd2aa4a,0xb98b40,0xb9a15c]},
} as const;

/** Hold a coherent colourway for an entire district run. The opening deliberately previews autumn. */
export function landscapePaletteAt(index:number) {
  const {start,district}=districtAt(index);
  if(district in BIOME_PALETTES)return BIOME_PALETTES[district as keyof typeof BIOME_PALETTES];
  if(start===0)return LANDSCAPE_PALETTES[1];
  const seed=(Math.imul(start+11,0x45d9f3b)^(start>>>3))>>>0;
  return LANDSCAPE_PALETTES[seed%LANDSCAPE_PALETTES.length]!;
}
