import type * as THREE from 'three';
import {CHUNK_LENGTH} from '../generation.ts';
import {makeTree,treeStyleFor} from '../scenery.ts';
import {prepareEnvironmentObject} from '../appearance.ts';
import type {District,TreeStyle} from './catalog.ts';

/** Builders describe one physical layout, shared by skateboarding and snowboarding. */
export type Plant = (object:THREE.Object3D,x:number,along:number,yaw?:number)=>void;
export type DistrictContext = {district:District;index:number;entering:boolean;rng:()=>number;plant:Plant};
export const facing = (side:number)=>side>0?-Math.PI/2:Math.PI/2;
export const ALONG = Math.PI/2;

export function createLayoutContext({district,index,rng,plant}:DistrictContext) {
  const queue: (() => void)[] = [], taken: { x: number; along: number; radius: number }[] = [];
  const free = (x: number, along: number, radius: number) =>
    taken.every(t => Math.hypot(t.x-x, t.along-along) > t.radius+radius);
  /** Reserve ground and build later, so main features claim their space before filler is scattered. */
  function place(make: () => THREE.Object3D, x: number, along: number, yaw = 0, radius = 0) {
    if (radius) taken.push({ x, along, radius });
    queue.push(() => { const object=make();prepareEnvironmentObject(object);plant(object, x, along, yaw); });
  }
  function scatter(count: number, make: () => THREE.Object3D, near: number, far: number, radius: number, spin = true) {
    for (let i = 0; i < count; i++) {
      const side = rng() < 0.5 ? -1 : 1, x = side*(near+rng()*(far-near)), along = 2+rng()*(CHUNK_LENGTH-4);
      if (free(x, along, radius)) place(make, x, along, spin ? rng()*Math.PI*2 : 0, radius);
    }
  }
  const tree = (style?: TreeStyle, scale = 1) => () => {
    const made = makeTree(rng, style ?? treeStyleFor(district, rng)); made.scale.multiplyScalar(scale); return made;
  };
  const forest = (count: number, near = 26, far = 136, style?: TreeStyle) => {
    for (let i = 0; i < count; i++) {
      const side = i%2 ? -1 : 1, x = side*(near+rng()*(far-near)), along = 3+rng()*64;
      if (free(x, along, 2.5)) place(tree(style, 1.1+rng()*0.65), x, along, rng()*Math.PI*2, 1.5);
    }
  };
  const side = () => rng() < 0.5 ? -1 : 1;
  function* build() {
    for(let i=0;i<queue.length;i++) {queue[i]!();if(i%3===2)yield;}
  }
  return {index,rng,free,place,scatter,tree,forest,side,build};
}
export type LayoutContext = ReturnType<typeof createLayoutContext>;
