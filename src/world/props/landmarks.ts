import * as THREE from 'three';
import {markAsset} from './variety.ts';
import {wood, white, dark, glass, orange, metal, paints, roofs, straw, logEnd, sheet, rust, concrete, trunkMaterial, unitTaper, unitPyramid, unitDome, group, part, box, post, onWall, doorOn} from './parts.ts';

export function makeLogPile(rng: () => number, diameter = 0.42, length = 2.6) {
  const g = group('slope');
  for (let row = 0, y = diameter/2; row < 3; row++, y += diameter*0.87) for (let i = 0; i < 3-row; i++) {
    const x = (i-(2-row)/2)*diameter;
    const piece = post(g, diameter, length, [0,y,x], trunkMaterial); piece.rotation.z = Math.PI/2; piece.rotation.y = (rng()-0.5)*0.03;
    for (const end of [-1,1]) { const cap = post(g, diameter*0.86, 0.04, [end*length/2,y,x], logEnd); cap.rotation.z = Math.PI/2; }
  }
  return markAsset(g,'log-pile');
}

export function makeLookout() {
  const g = group('pad'), h = 7.5;
  box(g, [4,0.3,4], [0,0.15,0], concrete);
  for (const x of [-1,1]) for (const z of [-1,1]) {
    const leg = box(g, [0.22,h+0.2,0.22], [x*1.55,h/2+0.2,z*1.55], wood);
    leg.rotation.set(z*0.05,0,-x*0.05);
  }
  for (const y of [2.6,5.1]) for (const side of [-1,1]) {
    box(g, [3.2,0.12,0.12], [0,y,side*1.45], wood); box(g, [0.12,0.12,3.2], [side*1.45,y,0], wood);
  }
  box(g, [4,0.18,4], [0,h+0.3,0], wood);
  box(g, [2.7,2.1,2.7], [0,h+1.45,0], paints[5]!);
  for (let facing = 0; facing < 4; facing++) onWall(g, facing, 0, h+1.6, 1.35, w => box(w, [1.9,0.8,0.08], [0,0,0.03], glass));
  for (const side of [-1,1]) { box(g, [4,0.08,0.08], [0,h+1.3,side*1.95], wood); box(g, [0.08,0.08,4], [side*1.95,h+1.3,0], wood); }
  part(g, unitPyramid, [3.6,1.3,3.6], [0,h+3.15,0], roofs[1]!);
  // Ladder up the downhill face.
  for (const x of [-0.25,0.25]) box(g, [0.07,h,0.07], [x,h/2+0.3,1.8], wood);
  for (let y = 0.8; y < h; y += 0.6) box(g, [0.5,0.05,0.05], [0,y,1.8], wood);
  return markAsset(g,'lookout');
}

export function makeMast() {
  const g = group('pad');
  box(g, [5.4,0.3,3], [1.3,0.15,0], concrete);
  for (let i = 0; i < 6; i++) post(g, 0.42-i*0.04, 4, [0,2.3+i*4,0], i%2 ? white : orange);
  post(g, 0.08, 3, [0,25.8,0], metal);
  for (const [y,angle] of [[17,0.4],[20.5,2.6]] as const) {
    const dish = post(g, 1.3, 0.22, [Math.sin(angle)*0.5,y,Math.cos(angle)*0.5], white); dish.rotation.set(Math.PI/2,0,-angle);
  }
  box(g, [2.4,2.3,2.2], [2.6,1.45,0], sheet); box(g, [2.6,0.12,2.4], [2.6,2.66,0], dark);
  doorOn(g, 0, 2.6, 0.3, 1.1, 0.85, 1.9, metal);
  return markAsset(g,'mast');
}

/** Distant landmark: stands upright on the hillside without a terrace. */
export function makeTurbine(rng: () => number) {
  const g = group(), h = 34+rng()*10;
  part(g, unitTaper, [3.4,h,3.4], [0,h/2,0], white);
  box(g, [1.6,1.6,4.2], [0,h+0.5,0.4], white);
  const hub = new THREE.Group(); hub.position.set(0,h+0.5,2.7); hub.rotation.z = rng()*Math.PI; g.add(hub);
  post(hub, 1.3, 1, [0,0,0], white).rotation.x = Math.PI/2;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Group(); blade.rotation.z = i*Math.PI*2/3; hub.add(blade);
    box(blade, [0.9,15,0.18], [0,8,0], white).rotation.y = 0.2;
  }
  return markAsset(g,'turbine');
}

export function makeSilo(rng: () => number) {
  const g = group('pad'), dmt = 3+rng()*0.8, h = 8+rng()*3;
  post(g, dmt+0.4, 0.3, [0,0.15,0], concrete);
  post(g, dmt, h, [0,h/2+0.3,0], sheet);
  for (let y = 1.5; y < h; y += 1.6) post(g, dmt+0.08, 0.1, [0,y,0], metal);
  part(g, unitDome, [dmt+0.1,dmt*0.7,dmt+0.1], [0,h+0.3,0], metal);
  box(g, [0.5,h,0.12], [0,h/2+0.3,dmt/2+0.05], metal);
  return markAsset(g,'silo');
}

export function makeHayBale(rng: () => number) {
  const g = group('slope'); g.userData.shadow = 'round';
  const bale = post(g, 1.45, 1.3, [0,0.72,0], straw); bale.rotation.z = Math.PI/2; g.rotation.y = rng()*Math.PI; return markAsset(g,'hay-bale');
}

export function makeWindpump() {
  const g = group('pad'), h = 8;
  box(g, [2.4,0.2,2.4], [0,0.1,0], concrete);
  for (const x of [-1,1]) for (const z of [-1,1]) {
    const leg = box(g, [0.1,h+0.1,0.1], [x*0.55,h/2+0.2,z*0.55], metal); leg.rotation.set(z*0.11,0,-x*0.11);
  }
  for (const y of [2.5,5]) for (const side of [-1,1]) {
    const reach = 1.9-y*0.2;
    box(g, [reach,0.06,0.06], [0,y,side*reach/2], metal); box(g, [0.06,0.06,reach], [side*reach/2,y,0], metal);
  }
  const fan = new THREE.Group(); fan.position.set(0,h+0.3,0.45); g.add(fan);
  post(fan, 0.3, 0.3, [0,0,0], metal).rotation.x = Math.PI/2;
  for (let i = 0; i < 10; i++) {
    const blade = new THREE.Group(); blade.rotation.z = i*Math.PI/5; fan.add(blade);
    box(blade, [0.34,1.05,0.04], [0,0.75,0], sheet).rotation.y = 0.35;
  }
  box(g, [0.05,0.9,1.5], [0,h+0.3,-0.9], sheet);
  box(g, [0.08,0.08,1.4], [0,h+0.3,-0.3], metal);
  return markAsset(g,'windpump');
}

export function makeLumberStack(rng: () => number) {
  const g = group('pad'), layers = 3+Math.floor(rng()*3);
  for (let i = 0; i < layers; i++) {
    for (const z of [-1,1]) box(g, [0.12,0.1,1.4], [z*1.1,i*0.36+0.05,0], dark);
    box(g, [3.4,0.26,1.35], [0,i*0.36+0.23,0], logEnd);
  }
  return markAsset(g,'lumber-stack');
}

export function makeTank(rng: () => number) {
  const g = group('pad'), dmt = 2.8+rng(), h = 3.6+rng()*1.5, mat = rng() < 0.5 ? rust : sheet;
  post(g, dmt+0.5, 0.3, [0,0.15,0], concrete);
  post(g, dmt, h, [0,h/2+0.3,0], mat);
  part(g, unitDome, [dmt,dmt*0.35,dmt], [0,h+0.3,0], mat);
  for (const y of [1,h-0.5]) post(g, dmt+0.08, 0.1, [0,y,0], metal);
  box(g, [0.45,h,0.1], [0,h/2+0.3,dmt/2+0.04], metal);
  return markAsset(g,'tank');
}

export function makeStack() {
  const g = group('pad'), h = 15;
  box(g, [2.6,1.4,2.6], [0,0.7,0], paints[6]!);
  part(g, unitTaper, [2.6,h,2.6], [0,h/2+1.4,0], paints[6]!);
  post(g, 1.75, 0.4, [0,h+1.5,0], dark);
  return markAsset(g,'stack');
}

export function makePowerPole() {
  const g = group();
  post(g, 0.28, 9, [0,4.5,0], trunkMaterial);
  box(g, [2.4,0.14,0.14], [0,8.3,0], trunkMaterial); box(g, [1.6,0.12,0.12], [0,7.5,0], trunkMaterial);
  for (const x of [-1.05,0,1.05]) post(g, 0.12, 0.26, [x,8.5,0], glass);
  post(g, 0.5, 0.7, [0.3,6.6,0], metal);
  return markAsset(g,'power-pole');
}
