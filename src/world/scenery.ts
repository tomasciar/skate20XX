import * as THREE from 'three';
import { DISTRICT_NAMES } from './generation.ts';
import type { District } from './generation.ts';
import {surface} from './appearance.ts';
import {ENVIRONMENT_BY_ID} from './environments/catalog.ts';
import type {TreeStyle} from './environments/catalog.ts';
export type {TreeStyle} from './environments/catalog.ts';

/**
 * Props and buildings. Every builder faces +Z (its front door, if any) with the footprint centered
 * on the origin; `userData.placement` tells the placer whether it needs a level terrace ('pad'),
 * should lie on the local slope ('slope'), or simply stands upright on the ground. `userData.shadow`
 * picks the baked ground shadow: 'round' for crowns and boulders, 'none' for flat paving, a soft box otherwise.
 */
const material = (color: number, metalness = 0, roughness = 0.8) => surface(new THREE.MeshStandardMaterial({ color, roughness, metalness }),'scenery');
const wood = material(0x886044), stone = material(0x879295), white = material(0xf1ead8);
const dark = material(0x263b43), glass = material(0x6f9aa8, 0.35, 0.25), orange = material(0xf27635);
const coneOrange = material(0xff651a, 0, 0.65);
const leaf = material(0x668c55), metal = material(0x53646b, 0.5, 0.5);
const paints = [0xdab786, 0x88a6a0, 0xc99578, 0xa9bfd0, 0xe8d28c, 0xece6d8, 0xa9604a].map(c => material(c, 0, 0.85));
const roofs = [0x874c3f, 0x4d5a63, 0x6b4636].map(c => material(c, 0, 0.75));
const barnRed = material(0x9c3b2e, 0, 0.85), straw = material(0xd9b95f, 0, 0.95), logEnd = material(0xc79a62, 0, 0.9);
const sheet = material(0x7f9296, 0.35, 0.55), rust = material(0x8a5a3c, 0.3, 0.7), concrete = material(0xb4b2a8, 0, 0.9);
const trunkMaterial = material(0x5a4030, 0, 0.9), birchBark = material(0xe4e0d2, 0, 0.8);
const leaves = [0x2f6b3a, 0x3c7d46, 0x245832, 0x4d8b4a].map(c => material(c, 0, 0.85));
const cedarLeaf = material(0x1f4a35, 0, 0.9), birchLeaf = material(0x8fb65a, 0, 0.85);
const autumn = [0xc98a2b, 0xb5562b, 0xd8b23a].map(c => material(c, 0, 0.85));
const blossom = material(0xe9b8c0, 0, 0.85), snagWood = material(0x8d867a, 0, 0.9);

const shared = <T extends THREE.BufferGeometry>(geometry: T) => { geometry.userData.shared = true; return geometry; };
const unitBox = shared(new THREE.BoxGeometry(1,1,1));
const unitCylinder = shared(new THREE.CylinderGeometry(0.5,0.5,1,12));
const unitTaper = shared(new THREE.CylinderGeometry(0.3,0.5,1,10));
const unitPyramid = shared(new THREE.ConeGeometry(Math.SQRT1_2,1,4).rotateY(Math.PI/4));
const unitBlob = shared(new THREE.IcosahedronGeometry(0.5,1));
const unitRock = shared(new THREE.DodecahedronGeometry(0.5));
const unitDome = shared(new THREE.SphereGeometry(0.5,12,5,0,Math.PI*2,0,Math.PI/2));
/** Gable infill: a triangular prism with its ridge along X, unit span (Z), unit height. */
const unitGable = shared((() => {
  const a=[-0.5,0,0.5],b=[0.5,0,0.5],c=[0.5,1,0],d=[-0.5,1,0],e=[-0.5,0,-0.5],f=[0.5,0,-0.5];
  const triangles=[a,b,c, a,c,d, f,e,d, f,d,c, e,a,d, b,f,c, e,f,b, e,b,a].flat();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(triangles),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(triangles.length/3*2),2));
  geometry.computeVertexNormals();
  return geometry;
})());
const treeTrunk = shared(new THREE.CylinderGeometry(0.18,0.24,1.6,6));
const treePine = shared(new THREE.ConeGeometry(1.2,3.5,7));
const treeCrown = shared(new THREE.IcosahedronGeometry(1.3,1));

const pick = <T>(list: readonly T[], rng: () => number) => list[Math.floor(rng()*list.length)]!;
function group(placement?: 'pad' | 'slope') {
  const g = new THREE.Group();
  if (placement) g.userData.placement = placement;
  return g;
}
function part(g: THREE.Object3D, geometry: THREE.BufferGeometry, size: number[], at: number[], mat: THREE.Material) {
  const m = new THREE.Mesh(geometry, mat);
  m.scale.set(size[0]!, size[1]!, size[2]!);
  m.position.set(at[0]!, at[1]!, at[2]!); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
const box = (g: THREE.Object3D, size: number[], at: number[], mat: THREE.Material) => part(g, unitBox, size, at, mat);
/** Upright cylinder: diameter, height, center. */
const post = (g: THREE.Object3D, diameter: number, height: number, at: number[], mat: THREE.Material) =>
  part(g, unitCylinder, [diameter,height,diameter], at, mat);
/** Cylinder lying along X. */
function log(g: THREE.Object3D, diameter: number, length: number, at: number[], mat: THREE.Material) {
  const m = post(g, diameter, length, at, mat); m.rotation.z = Math.PI/2; return m;
}

/**
 * Pitched roof of two slabs over a wall-colored gable, so the end walls read as walls.
 * `span` is the wall-to-wall distance across the ridge; `alongZ` turns the ridge toward the front.
 */
function gableRoof(g: THREE.Object3D, length: number, span: number, rise: number, y: number, roof: THREE.Material, wall: THREE.Material, alongZ = false, overhang = 0.45) {
  const r = new THREE.Group(); r.position.y = y; if (alongZ) r.rotation.y = Math.PI/2; g.add(r);
  part(r, unitGable, [length,rise,span], [0,0,0], wall);
  const angle = Math.atan2(rise, span/2), slope = Math.hypot(rise, span/2) + overhang;
  for (const side of [-1,1]) {
    const slab = box(r, [length+overhang*2,0.14,slope], [0, rise/2-Math.sin(angle)*overhang/2+0.07, side*(span/4+Math.cos(angle)*overhang/2)], roof);
    slab.rotation.x = side*angle;
  }
  box(r, [length+overhang*2,0.12,0.34], [0,rise+0.1,0], roof);
  return r;
}
/** Facing: 0 front (+Z), 1 right (+X), 2 back, 3 left. `offset` runs along the wall, `out` is the wall's distance from center. */
function onWall(g: THREE.Object3D, facing: number, offset: number, y: number, out: number, build: (w: THREE.Group) => void) {
  const w = new THREE.Group(); w.rotation.y = facing*Math.PI/2;
  w.position.set(...([[offset,y,out],[out,y,-offset],[-offset,y,-out],[-out,y,offset]][facing] as [number,number,number]));
  g.add(w); build(w); return w;
}
function windowOn(g: THREE.Object3D, facing: number, offset: number, y: number, out: number, width = 0.9, height = 1.15, trim: THREE.Material = white) {
  return onWall(g, facing, offset, y, out, w => {
    box(w, [width+0.22,height+0.22,0.08], [0,0,0.02], trim);
    box(w, [width,height,0.1], [0,0,0.04], glass);
    box(w, [width+0.36,0.07,0.2], [0,-height/2-0.14,0.07], trim);
  });
}
function doorOn(g: THREE.Object3D, facing: number, offset: number, y: number, out: number, width = 1, height = 2.05, mat: THREE.Material = wood) {
  return onWall(g, facing, offset, y+height/2, out, w => {
    box(w, [width+0.24,height+0.14,0.08], [0,0.05,0.02], white);
    box(w, [width,height,0.1], [0,0,0.04], mat);
    box(w, [0.08,0.08,0.08], [width*0.32,0,0.12], metal);
  });
}

export function makeCone() {
  const g = group(); g.userData.shadow = 'none';
  box(g, [0.5, 0.06, 0.5], [0, 0.03, 0], dark);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.65, 10), coneOrange);
  cone.position.y = 0.38; g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.12, 10), white);
  band.position.y = 0.38; g.add(band); return g;
}

// ---------------------------------------------------------------- trees

export const treeStyleFor = (district: District, rng: () => number) => pick(ENVIRONMENT_BY_ID.get(district)!.trees, rng);
export function makeTree(rng: () => number, style: TreeStyle = 'broadleaf') {
  const tree = group();
  tree.userData.shadow = style === 'snag' ? 'box' : 'round';
  const trunk = (mat: THREE.Material, height = 1.6, width = 1) => {
    const m = new THREE.Mesh(treeTrunk, mat); m.scale.set(width,height/1.6,width); m.position.y = height/2; m.castShadow = true; tree.add(m); return m;
  };
  const crown = (geometry: THREE.BufferGeometry, mat: THREE.Material, size: number[], at: number[]) => {
    const m = new THREE.Mesh(geometry, mat); m.scale.set(size[0]!,size[1]!,size[2]!); m.position.set(at[0]!,at[1]!,at[2]!);
    m.castShadow = true; tree.add(m); return m;
  };
  if (style === 'pine' || style === 'cedar') {
    const cedar = style === 'cedar', mat = cedar ? cedarLeaf : pick(leaves, rng);
    const tiers = cedar ? 2 : 3, spread = cedar ? 0.62+rng()*0.2 : 0.85+rng()*0.4, height = cedar ? 2.3+rng()*0.9 : 1.25+rng()*0.5;
    trunk(trunkMaterial, cedar ? 2.2 : 1.6);
    // Stacked, shrinking tiers read as a conifer from the fixed chase angle.
    for (let i = 0, y = cedar ? 1.5 : 1.0; i < tiers; i++) {
      const scale = 1 - i*(cedar ? 0.3 : 0.26);
      crown(treePine, mat, [spread*scale, height/3.5*(1+0.12*i)*scale+0.18, spread*scale], [0, y+height*scale/2*0.9+0.4, 0]).rotation.y = rng()*Math.PI;
      y += height*scale*(cedar ? 0.62 : 0.5);
    }
  } else if (style === 'snag') {
    trunk(snagWood, 3.2+rng()*1.5, 0.8);
    for (let i = 0; i < 3; i++) {
      const branch = box(tree, [0.09,0.9+rng()*0.7,0.09], [0,1.6+i*0.7,0], snagWood);
      branch.rotation.set(0, rng()*Math.PI*2, 0.9+rng()*0.5); branch.translateY(0.4);
    }
  } else {
    const birch = style === 'birch', fruit = style === 'fruit';
    const mat = birch ? birchLeaf : style === 'autumn' ? pick(autumn, rng) : fruit ? (rng() < 0.35 ? blossom : leaves[3]!) : pick(leaves, rng);
    const height = fruit ? 1.1 : birch ? 2.6 : 1.6;
    trunk(birch ? birchBark : trunkMaterial, height, birch ? 0.55 : fruit ? 0.7 : 1);
    const size = fruit ? 0.62 : birch ? 0.6 : 1;
    crown(treeCrown, mat, [size*(0.75+rng()*0.5), size*(0.7+rng()*0.6), size*(0.75+rng()*0.5)], [0, height+size*0.6, 0]);
    // Offset lobes break up the single-ball silhouette.
    for (let i = 0, lobes = fruit ? 1 : 2+Math.floor(rng()*2); i < lobes; i++) {
      const angle = rng()*Math.PI*2, reach = size*(0.55+rng()*0.35), lobe = size*(0.45+rng()*0.3);
      crown(treeCrown, mat, [lobe,lobe*(0.8+rng()*0.3),lobe], [Math.cos(angle)*reach, height+size*(0.35+rng()*0.75), Math.sin(angle)*reach]);
    }
  }
  const s = style === 'fruit' ? 0.9+rng()*0.3 : 0.65+rng()*1.0;
  tree.scale.set(s, style === 'fruit' ? s : 0.75+rng()*1.05, s);
  return tree;
}
export function makeBush(rng: () => number, mat: THREE.Material = leaf) {
  const g = group(); g.userData.shadow = 'round';
  for (let i = 0, count = 2+Math.floor(rng()*3); i < count; i++) {
    const size = 0.7+rng()*0.6;
    part(g, unitBlob, [size*1.2,size*0.85,size*1.2], [i ? (rng()-0.5)*1.3 : 0, size*0.3, i ? (rng()-0.5)*1.3 : 0], mat);
  }
  return g;
}
export function makeRocks(rng: () => number, scale = 1) {
  const g = group(); g.userData.shadow = 'round';
  for (let i = 0; i < 3; i++) {
    const size = (1.4+rng()*2)*scale;
    const rock = part(g, unitRock, [size*(1+rng()), size*(0.7+rng()), size], [i ? (rng()-0.5)*3*scale : 0, 0.4*scale, i ? (rng()-0.5)*3*scale : 0], stone);
    rock.rotation.set(rng(), rng(), rng());
  }
  return g;
}
export function makeStump(rng: () => number) {
  const g = group(), d = 0.5+rng()*0.4; g.userData.shadow = 'round';
  post(g, d, 0.45, [0,0.22,0], trunkMaterial); post(g, d*0.86, 0.04, [0,0.46,0], logEnd); return g;
}

// ---------------------------------------------------------------- village

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
  return g;
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
  return g;
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
  return g;
}
export function makeCar(rng: () => number) {
  const g = group('pad'), paint = pick(paints, rng), van = rng() < 0.25;
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
  return g;
}
export function makeBench() {
  const g = group('pad');
  box(g, [2.5, 0.14, 0.7], [0, 0.6, 0], wood);
  box(g, [2.5, 0.65, 0.12], [0, 1, 0.32], wood);
  for (const x of [-0.9, 0.9]) box(g, [0.12, 0.6, 0.65], [x, 0.3, 0], metal);
  return g;
}
export function makePlanter(rng: () => number) {
  const g = group('pad');
  box(g, [1.6, 0.5, 1.6], [0, 0.25, 0], wood);
  for (let i = 0; i < 4; i++) part(g, unitBlob, [1.1,1.1,1.1], [i ? (rng()-0.5) : 0, 0.7, i ? (rng()-0.5) : 0], i === 2 ? blossom : leaf);
  return g;
}
export function makeBusStop() {
  const g = group('pad');
  box(g, [3.2,0.1,1.5], [0,0.05,0], concrete);
  for (const x of [-1.5,1.5]) for (const z of [-0.6,0.6]) box(g, [0.08,2.3,0.08], [x,1.2,z], metal);
  box(g, [3,1.6,0.06], [0,1.35,-0.6], glass);
  for (const x of [-1.5,1.5]) box(g, [0.06,1.6,1.1], [x,1.35,-0.05], glass);
  box(g, [3.5,0.1,1.7], [0,2.38,0.05], dark).rotation.x = 0.06;
  box(g, [2.2,0.1,0.42], [0,0.5,-0.3], wood);
  for (const x of [-0.9,0.9]) box(g, [0.08,0.45,0.36], [x,0.27,-0.3], metal);
  return g;
}
export function makeWell() {
  const g = group('pad');
  post(g, 1.9, 0.8, [0,0.4,0], stone); post(g, 1.45, 0.06, [0,0.8,0], dark);
  for (const x of [-0.85,0.85]) box(g, [0.14,2.1,0.14], [x,1.45,0], wood);
  gableRoof(g, 2.2, 1.5, 0.55, 2.45, roofs[0]!, wood, false, 0.2);
  log(g, 0.16, 1.7, [0,2.1,0], wood);
  return g;
}
export function makeShed(rng: () => number) {
  const g = group('pad'), paint = pick(paints, rng);
  box(g, [2.6,2.1,2.2], [0,1.05,0], paint);
  box(g, [3,0.1,2.7], [0,2.32,0], roofs[1]!).rotation.x = 0.16;
  doorOn(g, 0, 0, 0, 1.1, 0.85, 1.85);
  return g;
}
export function makeHedge(length = 7) {
  const g = group('slope');
  box(g, [length,1.05,0.75], [0,0.5,0], leaf);
  box(g, [length-0.3,0.2,0.55], [0,1.1,0], leaves[1]!);
  return g;
}
/** Paved strip laid on the slope: garden paths and driveways. Too thin to matter to a wheel. */
export function makePaving(length: number, width: number, mat: THREE.Material = concrete) {
  const g = group('slope'); g.userData.collision = false; g.userData.shadow = 'none';
  box(g, [length,0.05,width], [0,0.03,0], mat).castShadow = false;
  return g;
}

// ---------------------------------------------------------------- grove

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
  return g;
}
export function makeShelter() {
  const g = group('pad');
  box(g, [4.4,0.12,3.4], [0,0.06,0], concrete);
  for (const x of [-1.9,1.9]) for (const z of [-1.4,1.4]) box(g, [0.16,2.4,0.16], [x,1.3,z], wood);
  gableRoof(g, 4.2, 3.2, 0.9, 2.5, roofs[2]!, wood, false, 0.4);
  box(g, [4,1,0.08], [0,0.9,-1.4], wood);
  box(g, [3,0.1,0.5], [0,0.55,-1], wood);
  for (const x of [-1.2,1.2]) box(g, [0.1,0.5,0.45], [x,0.3,-1], metal);
  return g;
}
export function makeLogPile(rng: () => number, diameter = 0.42, length = 2.6) {
  const g = group('slope');
  for (let row = 0, y = diameter/2; row < 3; row++, y += diameter*0.87) for (let i = 0; i < 3-row; i++) {
    const x = (i-(2-row)/2)*diameter;
    const piece = post(g, diameter, length, [0,y,x], trunkMaterial); piece.rotation.z = Math.PI/2; piece.rotation.y = (rng()-0.5)*0.03;
    for (const end of [-1,1]) { const cap = post(g, diameter*0.86, 0.04, [end*length/2,y,x], logEnd); cap.rotation.z = Math.PI/2; }
  }
  return g;
}

// ---------------------------------------------------------------- ridge

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
  return g;
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
  return g;
}
export function makeHut(rng: () => number) {
  const g = group('pad'), w = 4.6+rng(), d = 4, h = 2.3;
  box(g, [w,h,d], [0,h/2,0], stone);
  gableRoof(g, w, d, 1.5, h, roofs[1]!, stone, false, 0.35);
  doorOn(g, 0, -w*0.15, 0, d/2, 0.9, 1.9, barnRed);
  windowOn(g, 0, w*0.24, 1.3, d/2, 0.7, 0.7, barnRed);
  windowOn(g, 2, 0, 1.3, d/2, 0.7, 0.7, barnRed);
  box(g, [0.6,1.6,0.6], [w*0.3,h+1.1,-d*0.2], stone);
  return g;
}
export function makeCairn(rng: () => number) {
  const g = group('slope'); g.userData.shadow = 'round';
  for (let i = 0, y = 0; i < 4; i++) {
    const size = 0.75-i*0.14;
    const rock = part(g, unitRock, [size*1.15,size*0.6,size], [0,y+size*0.3,0], stone); rock.rotation.y = rng()*3; y += size*0.5;
  }
  return g;
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
  return g;
}

// ---------------------------------------------------------------- farm

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
  return g;
}
export function makeSilo(rng: () => number) {
  const g = group('pad'), dmt = 3+rng()*0.8, h = 8+rng()*3;
  post(g, dmt+0.4, 0.3, [0,0.15,0], concrete);
  post(g, dmt, h, [0,h/2+0.3,0], sheet);
  for (let y = 1.5; y < h; y += 1.6) post(g, dmt+0.08, 0.1, [0,y,0], metal);
  part(g, unitDome, [dmt+0.1,dmt*0.7,dmt+0.1], [0,h+0.3,0], metal);
  box(g, [0.5,h,0.12], [0,h/2+0.3,dmt/2+0.05], metal);
  return g;
}
export function makeHayBale(rng: () => number) {
  const g = group('slope'); g.userData.shadow = 'round';
  const bale = post(g, 1.45, 1.3, [0,0.72,0], straw); bale.rotation.z = Math.PI/2; g.rotation.y = rng()*Math.PI; return g;
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
  return g;
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
  return g;
}

// ---------------------------------------------------------------- timber mill

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
  return g;
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
  return g;
}
export function makeLumberStack(rng: () => number) {
  const g = group('pad'), layers = 3+Math.floor(rng()*3);
  for (let i = 0; i < layers; i++) {
    for (const z of [-1,1]) box(g, [0.12,0.1,1.4], [z*1.1,i*0.36+0.05,0], dark);
    box(g, [3.4,0.26,1.35], [0,i*0.36+0.23,0], logEnd);
  }
  return g;
}
export function makeTank(rng: () => number) {
  const g = group('pad'), dmt = 2.8+rng(), h = 3.6+rng()*1.5, mat = rng() < 0.5 ? rust : sheet;
  post(g, dmt+0.5, 0.3, [0,0.15,0], concrete);
  post(g, dmt, h, [0,h/2+0.3,0], mat);
  part(g, unitDome, [dmt,dmt*0.35,dmt], [0,h+0.3,0], mat);
  for (const y of [1,h-0.5]) post(g, dmt+0.08, 0.1, [0,y,0], metal);
  box(g, [0.45,h,0.1], [0,h/2+0.3,dmt/2+0.04], metal);
  return g;
}
export function makeStack() {
  const g = group('pad'), h = 15;
  box(g, [2.6,1.4,2.6], [0,0.7,0], paints[6]!);
  part(g, unitTaper, [2.6,h,2.6], [0,h/2+1.4,0], paints[6]!);
  post(g, 1.75, 0.4, [0,h+1.5,0], dark);
  return g;
}
export function makePowerPole() {
  const g = group();
  post(g, 0.28, 9, [0,4.5,0], trunkMaterial);
  box(g, [2.4,0.14,0.14], [0,8.3,0], trunkMaterial); box(g, [1.6,0.12,0.12], [0,7.5,0], trunkMaterial);
  for (const x of [-1.05,0,1.05]) post(g, 0.12, 0.26, [x,8.5,0], glass);
  post(g, 0.5, 0.7, [0.3,6.6,0], metal);
  return g;
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
  return g;
}

// ---------------------------------------------------------------- shared

/** Legacy mixed roadside prop: kept for callers that only know a district and a variant number. */
export function makeScenery(district: District, variant: number, rng: () => number) {
  if (district === 'village' && variant % 3 === 0) return makeHouse(rng);
  if (district === 'village' && variant % 3 === 1) return makeCar(rng);
  if (district === 'ridge' || variant % 4 === 0) return makeRocks(rng);
  return variant % 3 === 1 ? makeBench() : makePlanter(rng);
}
export function makeSign(district: District, index: number) {
  const g = group();
  for (const x of [-1.1,1.1]) box(g, [0.12, 2.9, 0.12], [x, 1.45, 0], wood);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#193f3b'; ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#ecd7a5'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center'; ctx.font = 'bold 40px sans-serif';
  ctx.fillText(DISTRICT_NAMES[district], 256, 80);
  ctx.font = '26px sans-serif'; ctx.fillText(`${index * 70} m  /  KEEP ROLLING`, 256, 135);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshStandardMaterial({ map }); face.userData.perChunk = true;
  box(g, [3.1, 1.16, 0.12], [0, 2.3, 0], face);
  box(g, [3.3, 0.12, 0.2], [0, 2.95, 0], wood);
  return g;
}

/** Rustic field fences, picnic tables and trail-side shelters share existing materials. */
export function makeFence(length = 9) {
  const g = group('slope');
  for (let x = -length/2; x <= length/2 + 0.01; x += length/3) box(g,[0.13,1.15,0.13],[x,0.575,0],wood);
  for (const y of [0.45,0.9]) box(g,[length,0.10,0.10],[0,y,0],wood);
  return g;
}
/** Yard fencing: steel posts with mesh panels. */
export function makeYardFence(length = 9) {
  const g = group('slope');
  for (let x = -length/2; x <= length/2 + 0.01; x += length/3) post(g,0.09,1.9,[x,0.95,0],metal);
  box(g,[length,1.5,0.04],[0,1.05,0],sheet); box(g,[length,0.06,0.07],[0,1.85,0],metal);
  return g;
}
export function makePicnic() {
  const g = group('pad');
  box(g,[2.5,0.12,1.1],[0,0.85,0],wood);
  for (const z of [-0.9,0.9]) box(g,[2.5,0.12,0.35],[0,0.48,z],wood);
  for (const x of [-0.8,0.8]) {
    box(g,[0.13,0.85,1.7],[x,0.425,0],metal);
  }
  return g;
}
export function makeLamp(side: number, rng: () => number) {
  const root = group(), height = 3.2*(0.85+rng()*0.4);
  post(root, 0.12, height, [0,height/2,0], metal);
  post(root, 0.2, 0.3, [0,0.15,0], dark);
  box(root, [0.9,0.07,0.07], [-side*0.4,height-0.05,0], metal);
  box(root, [0.5,0.1,0.22], [-side*0.7,height-0.1,0], dark);
  box(root, [0.4,0.03,0.16], [-side*0.7,height-0.16,0], white);
  return root;
}

export const foundationMaterial = stone;
