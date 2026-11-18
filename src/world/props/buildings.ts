import {markAsset} from './variety.ts';
import {wood, stone, white, dark, glass, orange, metal, paints, roofs, barnRed, logEnd, sheet, concrete, trunkMaterial, leaves, unitPyramid, pick, group, part, box, post, log, gableRoof, onWall, windowOn, doorOn} from './parts.ts';

export function makeHouse(rng: () => number) {
  const g = group('pad');
  const w = 6.4+rng()*2.4, d = 6+rng()*1.4, storeys = rng() < 0.45 ? 2 : 1, h = storeys*2.7+0.2;
  const paint = pick(paints, rng), roof = pick(roofs, rng), frontGable = rng() < 0.35, base = 0.45;
  box(g, [w+0.3,base,d+0.3], [0,base/2,0], stone);
  box(g, [w,h,d], [0,base+h/2,0], paint);
  gableRoof(g, frontGable ? d : w, frontGable ? w : d, (frontGable ? w : d)*0.34, base+h, roof, paint, frontGable);
  const door = (rng()-0.5)*w*0.3;
  doorOn(g, 0, door, base, d/2);
  box(g, [1.7,0.2,0.9], [door,base-0.1,d/2+0.45], stone);
  box(g, [1.2,base-0.2,0.45], [door,(base-0.2)/2,d/2+1.1], stone);
  if (rng() < 0.6) {
    // Porch roof on two posts over the front step.
    box(g, [2.3,0.1,1.25], [door,base+2.45,d/2+0.6], roof).rotation.x = 0.14;
    for (const x of [-1,1]) box(g, [0.1,2.35,0.1], [door+x*1,base+1.2,d/2+1.1], white);
  }
  for (let floor = 0; floor < storeys; floor++) {
    const y = base+1.5+floor*2.7;
    for (const x of [-w*0.31,w*0.31]) if (floor > 0 || Math.abs(x-door) > 1.3) windowOn(g, 0, x, y, d/2);
    if (floor > 0 && Math.abs(door) < 0.8) windowOn(g, 0, 0, y, d/2, 0.7);
    for (const facing of [1,3]) for (const z of [-d*0.22,d*0.22]) windowOn(g, facing, z, y, w/2);
    for (const x of [-w*0.28,w*0.28]) windowOn(g, 2, x, y, d/2);
  }
  doorOn(g, 2, w*0.02, base, d/2, 0.9, 2);
  // Chimney through the roof slope, clear of the ridge.
  const cx = frontGable ? w*0.22 : w*0.27, cz = frontGable ? -d*0.2 : -d*0.2;
  box(g, [0.7,h*0.2+2.4,0.7], [cx,base+h+1.0,cz], stone);
  box(g, [0.85,0.14,0.85], [cx,base+h+2.25+h*0.1,cz], dark);
  return markAsset(g,'house');
}

export function makeShop(rng: () => number) {
  const g = group('pad');
  const w = 7+rng()*2.5, d = 7, h = 6.1, base = 0.3, paint = pick(paints, rng), accent = pick([orange, roofs[0]!, dark, leaves[1]!], rng);
  box(g, [w+0.2,base,d+0.2], [0,base/2,0], stone);
  box(g, [w,h,d], [0,base+h/2,0], paint);
  // Flat roof behind a parapet, with a cornice line.
  box(g, [w+0.3,0.22,d+0.3], [0,base+h+0.11,0], white);
  for (const z of [-1,1]) box(g, [w+0.1,0.5,0.2], [0,base+h+0.45,z*(d/2-0.05)], paint);
  for (const x of [-1,1]) box(g, [0.2,0.5,d+0.1], [x*(w/2-0.05),base+h+0.45,0], paint);
  box(g, [1.4,0.8,1.1], [w*0.2,base+h+0.6,-d*0.15], metal);
  // Shopfront: recessed door between two display windows under a sloped awning.
  doorOn(g, 0, 0, base, d/2, 1.1, 2.2, dark);
  for (const x of [-1,1]) windowOn(g, 0, x*(w*0.25+0.35), base+1.45, d/2, w*0.5-1.6, 1.9, dark);
  box(g, [w-0.3,0.1,1.5], [0,base+2.85,d/2+0.62], accent).rotation.x = 0.3;
  box(g, [w-0.3,0.3,0.06], [0,base+2.5,d/2+1.33], accent);
  box(g, [w*0.62,0.62,0.12], [0,base+3.55,d/2+0.07], dark);
  box(g, [w*0.62-0.3,0.08,0.14], [0,base+3.55,d/2+0.08], white);
  const count = w > 8.3 ? 3 : 2;
  for (let i = 0; i < count; i++) windowOn(g, 0, (i-(count-1)/2)*(w/count), base+4.7, d/2, 1, 1.3);
  for (const facing of [1,3]) for (const z of [-d*0.24,d*0.24]) windowOn(g, facing, z, base+4.7, w/2, 0.9, 1.3);
  doorOn(g, 2, -w*0.2, base, d/2, 0.95, 2.05, metal);
  return markAsset(g,'shop');
}

export function makeChapel(rng: () => number) {
  const g = group('pad');
  const w = 6, d = 10, h = 4.6, base = 0.5, wall = rng() < 0.5 ? white : paints[5]!, roof = roofs[1]!;
  box(g, [w+0.3,base,d+3.5], [0,base/2,0.9], stone);
  box(g, [w,h,d], [0,base+h/2,-0.6], wall);
  const nave = gableRoof(g, d, w, w*0.5, base+h, roof, wall, true); nave.position.z = -0.6;
  // Bell tower at the street end, with a spire.
  box(g, [3,9.5,3], [0,base+4.75,d/2+0.4], wall);
  const towerZ = d/2+0.4;
  for (const [facing,offset,out] of [[0,0,towerZ+1.5],[1,-towerZ,1.5],[3,towerZ,1.5]] as const)
    onWall(g, facing, offset, base+8, out, belfry => box(belfry, [0.9,1.3,0.1], [0,0,0.02], dark));
  box(g, [3.4,0.25,3.4], [0,base+9.6,d/2+0.4], white);
  part(g, unitPyramid, [3.1,4.2,3.1], [0,base+11.8,d/2+0.4], roof);
  box(g, [0.1,0.9,0.1], [0,base+14.3,d/2+0.4], metal); box(g, [0.5,0.1,0.1], [0,base+14.45,d/2+0.4], metal);
  doorOn(g, 0, 0, base, d/2+1.9, 1.5, 2.6);
  box(g, [2.4,0.2,1], [0,base-0.1,d/2+2.4], stone);
  for (const facing of [1,3]) for (const z of [-3.2,-0.6,2]) onWall(g, facing, z+0.6, base+2.5, w/2, wnd => {
    box(wnd, [0.85,2.5,0.08], [0,0,0.02], stone); box(wnd, [0.6,2.2,0.1], [0,0,0.04], glass);
  });
  return markAsset(g,'chapel');
}

export function makeShed(rng: () => number) {
  const g = group('pad'), paint = pick(paints, rng);
  box(g, [2.6,2.1,2.2], [0,1.05,0], paint);
  box(g, [3,0.1,2.7], [0,2.32,0], roofs[1]!).rotation.x = 0.16;
  doorOn(g, 0, 0, 0, 1.1, 0.85, 1.85);
  return markAsset(g,'shed');
}

export function makeCabin(rng: () => number) {
  const g = group('pad'), w = 5.2+rng()*1.2, d = 4.4, h = 2.5, base = 0.4;
  box(g, [w+0.2,base,d+2.2], [0,base/2,0.9], stone);
  box(g, [w,h,d], [0,base+h/2,0], wood);
  // Log courses and corner posts.
  for (let i = 1; i < 5; i++) box(g, [w+0.12,0.05,d+0.12], [0,base+i*0.5,0], dark);
  gableRoof(g, w, d, d*0.42, base+h, leaves[2]!, wood);
  // Covered porch across the front.
  box(g, [w+0.4,0.1,2], [0,base+h+0.05,d/2+0.85], leaves[2]!).rotation.x = 0.2;
  for (const x of [-w/2+0.15,0,w/2-0.15]) box(g, [0.14,h-0.1,0.14], [x,base+h/2,d/2+1.7], wood);
  box(g, [w,0.08,0.08], [0,base+0.95,d/2+1.7], wood);
  doorOn(g, 0, w*0.18, base, d/2, 0.95, 2);
  windowOn(g, 0, -w*0.22, base+1.45, d/2, 0.9, 0.9);
  for (const facing of [1,3]) windowOn(g, facing, 0, base+1.45, w/2, 0.9, 0.9);
  box(g, [0.9,h+3,0.9], [-w/2-0.3,base+(h+3)/2,-d*0.15], stone);
  return markAsset(g,'cabin');
}

export function makeShelter() {
  const g = group('pad');
  box(g, [4.4,0.12,3.4], [0,0.06,0], concrete);
  for (const x of [-1.9,1.9]) for (const z of [-1.4,1.4]) box(g, [0.16,2.4,0.16], [x,1.3,z], wood);
  gableRoof(g, 4.2, 3.2, 0.9, 2.5, roofs[2]!, wood, false, 0.4);
  box(g, [4,1,0.08], [0,0.9,-1.4], wood);
  box(g, [3,0.1,0.5], [0,0.55,-1], wood);
  for (const x of [-1.2,1.2]) box(g, [0.1,0.5,0.45], [x,0.3,-1], metal);
  return markAsset(g,'shelter');
}

export function makeHut(rng: () => number) {
  const g = group('pad'), w = 4.6+rng(), d = 4, h = 2.3;
  box(g, [w,h,d], [0,h/2,0], stone);
  gableRoof(g, w, d, 1.5, h, roofs[1]!, stone, false, 0.35);
  doorOn(g, 0, -w*0.15, 0, d/2, 0.9, 1.9, barnRed);
  windowOn(g, 0, w*0.24, 1.3, d/2, 0.7, 0.7, barnRed);
  windowOn(g, 2, 0, 1.3, d/2, 0.7, 0.7, barnRed);
  box(g, [0.6,1.6,0.6], [w*0.3,h+1.1,-d*0.2], stone);
  return markAsset(g,'hut');
}

export function makeBarn(rng: () => number) {
  const g = group('pad'), w = 9+rng()*2, d = 11, h = 4.4, base = 0.3;
  box(g, [w+0.2,base,d+0.2], [0,base/2,0], stone);
  box(g, [w,h,d], [0,base+h/2,0], barnRed);
  gableRoof(g, d, w, w*0.36, base+h, roofs[1]!, barnRed, true, 0.5);
  // Sliding doors with cross bracing under a hay-loft hatch.
  onWall(g, 0, 0, base+1.75, d/2, door => {
    box(door, [3.7,3.5,0.08], [0,0,0.02], white);
    for (const x of [-0.9,0.9]) {
      box(door, [1.7,3.3,0.1], [x,0,0.04], barnRed);
      for (const tilt of [-1,1]) box(door, [0.12,3.6,0.12], [x,0,0.06], white).rotation.z = tilt*0.45;
    }
  });
  onWall(g, 0, 0, base+h+w*0.12, d/2, loft => { box(loft, [1.3,1.2,0.08], [0,0,0.02], white); box(loft, [1.05,0.95,0.1], [0,0,0.04], dark); });
  for (const facing of [1,3]) for (const z of [-3,0,3]) windowOn(g, facing, z, base+2.6, w/2, 0.8, 0.8);
  return markAsset(g,'barn');
}

export function makeSawmill(rng: () => number) {
  const g = group('pad'), w = 13+rng()*3, d = 7, h = 4.2;
  box(g, [w+0.6,0.3,d+0.6], [0,0.15,0], concrete);
  for (let x = -w/2; x <= w/2+0.01; x += w/4) for (const z of [-d/2,d/2]) box(g, [0.24,h,0.24], [x,h/2+0.3,z], wood);
  gableRoof(g, w, d, 1.5, h+0.3, sheet, wood, false, 0.6);
  box(g, [w,h*0.55,0.12], [0,h*0.72+0.3,-d/2], wood);
  // Saw carriage with a log on it, and cut boards stacked beside.
  box(g, [w*0.55,0.5,1.1], [-w*0.1,0.55,0.4], metal);
  log(g, 0.75, w*0.42, [-w*0.12,1.18,0.4], trunkMaterial);
  post(g, 1.5, 0.08, [w*0.2,1.3,0.4], metal).rotation.x = Math.PI/2;
  for (let i = 0; i < 4; i++) box(g, [3.2,0.22,1.2], [w*0.28,0.45+i*0.3,-1.9], logEnd);
  return markAsset(g,'sawmill');
}

export function makeWarehouse(rng: () => number) {
  const g = group('pad'), w = 11+rng()*3, d = 8.5, h = 5, base = 1, wall = rng() < 0.5 ? sheet : paints[1]!;
  box(g, [w+0.2,base,d+0.2], [0,base/2,0], concrete);
  box(g, [w,h,d], [0,base+h/2,0], wall);
  for (let x = -w/2+1; x < w/2; x += 2) box(g, [0.08,h,d+0.06], [x,base+h/2,0], metal);
  gableRoof(g, w, d, 1.3, base+h, dark, wall, false, 0.3);
  // Loading dock with a roller door, steps and an office door.
  box(g, [w*0.6,base,2.2], [-w*0.15,base/2,d/2+1.1], concrete);
  onWall(g, 0, -w*0.15, base+1.8, d/2, door => { box(door, [3.7,3.7,0.08], [0,0.05,0.02], dark); box(door, [3.4,3.5,0.1], [0,0,0.04], metal); });
  doorOn(g, 0, w*0.34, base, d/2, 0.95, 2.05, dark);
  for (let i = 0; i < 3; i++) box(g, [1.3,base-i*0.32,0.45], [w*0.34,(base-i*0.32)/2,d/2+0.25+i*0.45], concrete);
  for (const facing of [1,3]) for (const z of [-2.2,2.2]) windowOn(g, facing, z, base+3.6, w/2, 1.4, 0.8, dark);
  return markAsset(g,'warehouse');
}
