import {markAsset} from './variety.ts';
import {white, dark, glass, orange, metal, paints, barnRed, straw, logEnd, trunkMaterial, leaves, pick, group, box, post} from './parts.ts';

export function makeCar(rng: () => number) {
  const g = group('pad'), paint = pick(paints, rng), van = rng() < 0.25;g.userData.vehicleStyle=van?'van':'car';
  box(g, [1.85,0.62,4.1], [0,0.68,0], paint);
  box(g, [1.7,0.18,4.2], [0,0.42,0], dark);
  if (van) { box(g, [1.8,0.95,2.9], [0,1.45,-0.5], paint); box(g, [1.62,0.6,0.08], [0,1.5,0.96], glass); for (const x of [-1,1]) box(g, [0.06,0.5,1.3], [x*0.9,1.5,0.1], glass); }
  else {
    box(g, [1.62,0.62,2.1], [0,1.28,-0.15], glass);
    box(g, [1.7,0.08,1.9], [0,1.62,-0.15], paint);
    for (const x of [-1,1]) for (const z of [-1.15,0.85]) box(g, [0.08,0.62,0.1], [x*0.8,1.28,z], paint);
  }
  for (const x of [-0.92, 0.92]) for (const z of [-1.3, 1.3]) {
    const wheel = post(g, 0.7, 0.24, [x,0.36,z], dark); wheel.rotation.z = Math.PI/2;
    const hub = post(g, 0.36, 0.26, [x,0.36,z], metal); hub.rotation.z = Math.PI/2;
  }
  for (const x of [-0.65, 0.65]) { box(g, [0.35,0.18,0.05], [x,0.78,2.06], white); box(g, [0.32,0.14,0.05], [x,0.78,-2.06], orange); }
  box(g, [1.3,0.12,0.06], [0,0.52,2.1], metal);
  return markAsset(g,'car');
}

export function makeTractor(rng: () => number) {
  const g = group('pad'), paint = rng() < 0.5 ? barnRed : leaves[1]!;
  box(g, [1.1,0.8,2], [0,1.15,0.9], paint); box(g, [1.3,0.25,3.2], [0,0.75,0.2], dark);
  box(g, [1.3,1.3,1.3], [0,1.75,-0.55], glass); box(g, [1.45,0.1,1.45], [0,2.44,-0.55], paint);
  post(g, 0.12, 0.9, [0.35,1.95,1.5], metal);
  for (const x of [-0.85,0.85]) {
    post(g, 1.5, 0.42, [x,0.75,-0.7], dark).rotation.z = Math.PI/2; post(g, 0.6, 0.44, [x,0.75,-0.7], straw).rotation.z = Math.PI/2;
    post(g, 0.8, 0.28, [x*0.9,0.4,1.5], dark).rotation.z = Math.PI/2;
  }
  return markAsset(g,'tractor');
}

export function makeLogTruck(rng: () => number) {
  const g = group('pad'), paint = pick([barnRed, paints[3]!, leaves[1]!], rng);
  box(g, [2.2,1.5,1.9], [0,1.5,2.9], paint); box(g, [2,0.7,0.08], [0,1.85,3.86], glass);
  box(g, [2.2,0.3,7.6], [0,0.85,0], dark);
  for (const x of [-1,1]) for (const z of [-2.6,0.4]) box(g, [0.1,1.5,0.1], [x*1.02,1.7,z], metal);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 3-row; i++) {
    const piece = post(g, 0.62, 5.4, [(i-(2-row)/2)*0.64,1.32+row*0.56,-1.1], trunkMaterial); piece.rotation.x = Math.PI/2;
    for (const end of [-1,1]) post(g, 0.54, 0.04, [(i-(2-row)/2)*0.64,1.32+row*0.56,-1.1+end*2.7], logEnd).rotation.x = Math.PI/2;
  }
  for (const x of [-1,1]) for (const z of [-2.8,-1.7,2.7]) post(g, 0.95, 0.36, [x*0.95,0.48,z], dark).rotation.z = Math.PI/2;
  return markAsset(g,'log-truck');
}
