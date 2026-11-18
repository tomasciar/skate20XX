import * as THREE from 'three';
import {sceneryMaterial as material} from './variety.ts';

/**
 * Props and buildings. Every builder faces +Z (its front door, if any) with the footprint centered
 * on the origin; `userData.placement` tells the placer whether it needs a level terrace ('pad'),
 * should lie on the local slope ('slope'), or simply stands upright on the ground. `userData.shadow`
 * picks the baked ground shadow: 'round' for crowns and boulders, 'none' for flat paving, a soft box otherwise.
 */
export const wood = material(0x886044), stone = material(0x879295), white = material(0xf1ead8);
export const dark = material(0x263b43), glass = material(0x6f9aa8, 0.35, 0.25), orange = material(0xf27635);
export const coneOrange = material(0xff651a, 0, 0.65);
export const leaf = material(0x668c55), metal = material(0x53646b, 0.5, 0.5);
export const paints = [0xdab786, 0x88a6a0, 0xc99578, 0xa9bfd0, 0xe8d28c, 0xece6d8, 0xa9604a].map(c => material(c, 0, 0.85));
export const roofs = [0x874c3f, 0x4d5a63, 0x6b4636].map(c => material(c, 0, 0.75));
export const barnRed = material(0x9c3b2e, 0, 0.85), straw = material(0xd9b95f, 0, 0.95), logEnd = material(0xc79a62, 0, 0.9);
export const sheet = material(0x7f9296, 0.35, 0.55), rust = material(0x8a5a3c, 0.3, 0.7), concrete = material(0xb4b2a8, 0, 0.9);
export const trunkMaterial = material(0x5a4030, 0, 0.9), birchBark = material(0xe4e0d2, 0, 0.8);
export const leaves = [0x2f6b3a, 0x3c7d46, 0x245832, 0x4d8b4a].map(c => material(c, 0, 0.85));
export const cedarLeaf = material(0x1f4a35, 0, 0.9), birchLeaf = material(0x8fb65a, 0, 0.85);
export const autumn = [0xc98a2b, 0xb5562b, 0xd8b23a].map(c => material(c, 0, 0.85));
export const blossom = material(0xe9b8c0, 0, 0.85), snagWood = material(0x8d867a, 0, 0.9);

export const shared = <T extends THREE.BufferGeometry>(geometry: T) => { geometry.userData.shared = true; return geometry; };
export const unitBox = shared(new THREE.BoxGeometry(1,1,1));
export const unitCylinder = shared(new THREE.CylinderGeometry(0.5,0.5,1,12));
export const unitTaper = shared(new THREE.CylinderGeometry(0.3,0.5,1,10));
export const unitPyramid = shared(new THREE.ConeGeometry(Math.SQRT1_2,1,4).rotateY(Math.PI/4));
export const unitBlob = shared(new THREE.IcosahedronGeometry(0.5,1));
export const unitRock = shared(new THREE.DodecahedronGeometry(0.5));
export const unitDome = shared(new THREE.SphereGeometry(0.5,12,5,0,Math.PI*2,0,Math.PI/2));
/** Gable infill: a triangular prism with its ridge along X, unit span (Z), unit height. */
export const unitGable = shared((() => {
  const a=[-0.5,0,0.5],b=[0.5,0,0.5],c=[0.5,1,0],d=[-0.5,1,0],e=[-0.5,0,-0.5],f=[0.5,0,-0.5];
  const triangles=[a,b,c, a,c,d, f,e,d, f,d,c, e,a,d, b,f,c, e,f,b, e,b,a].flat();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(triangles),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(triangles.length/3*2),2));
  geometry.computeVertexNormals();
  return geometry;
})());
export const treeTrunk = shared(new THREE.CylinderGeometry(0.18,0.24,1.6,6));
export const treePine = shared(new THREE.ConeGeometry(1.2,3.5,7));
export const treeCrown = shared(new THREE.IcosahedronGeometry(1.3,1));

export const pick = <T>(list: readonly T[], rng: () => number) => list[Math.floor(rng()*list.length)]!;
export function group(placement?: 'pad' | 'slope') {
  const g = new THREE.Group();
  if (placement) g.userData.placement = placement;
  return g;
}
export function part(g: THREE.Object3D, geometry: THREE.BufferGeometry, size: number[], at: number[], mat: THREE.Material) {
  const m = new THREE.Mesh(geometry, mat);
  m.scale.set(size[0]!, size[1]!, size[2]!);
  m.position.set(at[0]!, at[1]!, at[2]!); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
export const box = (g: THREE.Object3D, size: number[], at: number[], mat: THREE.Material) => part(g, unitBox, size, at, mat);
/** Upright cylinder: diameter, height, center. */
export const post = (g: THREE.Object3D, diameter: number, height: number, at: number[], mat: THREE.Material) =>
  part(g, unitCylinder, [diameter,height,diameter], at, mat);
/** Cylinder lying along X. */
export function log(g: THREE.Object3D, diameter: number, length: number, at: number[], mat: THREE.Material) {
  const m = post(g, diameter, length, at, mat); m.rotation.z = Math.PI/2; return m;
}

/**
 * Pitched roof of two slabs over a wall-colored gable, so the end walls read as walls.
 * `span` is the wall-to-wall distance across the ridge; `alongZ` turns the ridge toward the front.
 */
export function gableRoof(g: THREE.Object3D, length: number, span: number, rise: number, y: number, roof: THREE.Material, wall: THREE.Material, alongZ = false, overhang = 0.45) {
  const r = new THREE.Group(); r.userData.variantPart='roof'; r.position.y = y; if (alongZ) r.rotation.y = Math.PI/2; g.add(r);
  part(r, unitGable, [length,rise,span], [0,0,0], wall);
  const angle = Math.atan2(rise, span/2), slope = Math.hypot(rise, span/2) + overhang;
  r.userData.roofSize=[length+overhang*2,rise+0.15,span+overhang*2*Math.cos(angle)+0.14*Math.sin(angle)];
  for (const side of [-1,1]) {
    const slab = box(r, [length+overhang*2,0.14,slope], [0, rise/2-Math.sin(angle)*overhang/2+0.07, side*(span/4+Math.cos(angle)*overhang/2)], roof);
    slab.rotation.x = side*angle;
  }
  box(r, [length+overhang*2,0.12,0.34], [0,rise+0.1,0], roof);
  return r;
}
/** Facing: 0 front (+Z), 1 right (+X), 2 back, 3 left. `offset` runs along the wall, `out` is the wall's distance from center. */
export function onWall(g: THREE.Object3D, facing: number, offset: number, y: number, out: number, build: (w: THREE.Group) => void) {
  const w = new THREE.Group(); w.rotation.y = facing*Math.PI/2;
  w.position.set(...([[offset,y,out],[out,y,-offset],[-offset,y,-out],[-out,y,offset]][facing] as [number,number,number]));
  g.add(w); build(w); return w;
}
export function windowOn(g: THREE.Object3D, facing: number, offset: number, y: number, out: number, width = 0.9, height = 1.15, trim: THREE.Material = white) {
  return onWall(g, facing, offset, y, out, w => {
    box(w, [width+0.22,height+0.22,0.08], [0,0,0.02], trim);
    box(w, [width,height,0.1], [0,0,0.04], glass);
    box(w, [width+0.36,0.07,0.2], [0,-height/2-0.14,0.07], trim);
  });
}
export function doorOn(g: THREE.Object3D, facing: number, offset: number, y: number, out: number, width = 1, height = 2.05, mat: THREE.Material = wood) {
  return onWall(g, facing, offset, y+height/2, out, w => {
    box(w, [width+0.24,height+0.14,0.08], [0,0.05,0.02], white);
    box(w, [width,height,0.1], [0,0,0.04], mat);
    box(w, [0.08,0.08,0.08], [width*0.32,0,0.12], metal);
  });
}

export const foundationMaterial = stone;
