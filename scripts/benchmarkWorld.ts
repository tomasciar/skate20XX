import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {populateDistrict} from '../src/world/districts.ts';
import {DISTRICTS,seededRandom} from '../src/world/generation.ts';
import {bakeSceneryCollision} from '../src/world/collision.ts';
import {createRamp} from '../src/world/ramp.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const environments:Record<string,unknown>={};
for(const district of DISTRICTS) {
  let objects=0,renderTriangles=0,collisionTriangles=0;
  for(let index=0;index<12;index++) {
    const root=new THREE.Group();
    for(const _ of populateDistrict({district,index,entering:false,rng:seededRandom(index*7919+3),plant:object=>{
      objects++;root.add(object);object.traverse(mesh=>{if(mesh instanceof THREE.Mesh)renderTriangles+=(mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count)/3;});
    }})){void _;}
    collisionTriangles+=bakeSceneryCollision(root)!.indices.length/3;
  }
  environments[district]={meanObjects:objects/12,meanRenderTriangles:renderTriangles/12,meanCollisionTriangles:collisionTriangles/12};
}
await RAPIER.init();
const world=new RAPIER.World({x:0,y:-18,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world,{startPlatform:false});
const preparations:number[]=[],batches:number[]=[],triangles:number[]=[];
try {
  for(let index=0;index<54;index++) {
    const start=performance.now();ramp.scroll(70);while(!ramp.prepareNextChunk(Infinity)){}
    if(index>5)preparations.push(performance.now()-start);
    const chunk=ramp.mesh.children.find(root=>root.position.z===0)!;batches.push(chunk.children.length);
    let count=0;chunk.traverse(mesh=>{if(mesh instanceof THREE.Mesh)count+=(mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count)/3;});triangles.push(count);
  }
  preparations.sort((a,b)=>a-b);
  console.log(JSON.stringify({environments,streaming:{
    medianPreparationMs:preparations[Math.floor(preparations.length/2)],p95PreparationMs:preparations[Math.floor(preparations.length*0.95)],
    meanBatchesPerChunk:batches.reduce((a,b)=>a+b,0)/batches.length,meanTrianglesPerChunk:triangles.reduce((a,b)=>a+b,0)/triangles.length,
  },note:'CPU generation and content counts only; excludes browser/GPU rendering. Preparation is measured in full here and is spread over frames during gameplay.'},null,2));
} finally {world.free();}
