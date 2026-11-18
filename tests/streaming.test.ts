import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createRamp,RAMP} from '../src/world/ramp.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});

test('incremental preparation isolates collision construction from geometry work, while boot can finish synchronously',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world);
  const clone=THREE.BufferGeometry.prototype.clone,transform=THREE.BufferGeometry.prototype.applyMatrix4;
  const createCollider=world.createCollider.bind(world);
  let frame=0;
  const work:{geometry:number;collision:number}[]=[];
  const record=()=>work[frame]??=( {geometry:0,collision:0});
  THREE.BufferGeometry.prototype.clone=function(){record().geometry++;return clone.call(this);};
  THREE.BufferGeometry.prototype.applyMatrix4=function(matrix){record().geometry++;return transform.call(this,matrix);};
  world.createCollider=(desc,parent)=>{
    if(desc.shape.type===RAPIER.ShapeType.TriMesh)record().collision++;
    return createCollider(desc,parent);
  };
  try {
    ramp.scroll(RAMP.chunkLength);
    // A deliberately large finite budget proves frame boundaries are enforced independently of timing.
    let done=false;
    for(frame=0;frame<30 && !done;frame++)done=ramp.prepareNextChunk(100_000);
    assert.ok(done,'finite preparation should complete');
    const heavy=work.filter(slice=>slice.collision>0);
    assert.equal(heavy.length,1);
    assert.equal(heavy[0].geometry,0,'collision construction must not share a frame with geometry generation or batching');
    assert.ok(work.some(slice=>slice.geometry>0));
    assert.ok(ramp.mesh.children.every(chunk=>chunk.visible),'completed chunks must be visible');
    // Infinite-budget loading/reset paths consume the same boundaries without stopping halfway.
    ramp.scroll(RAMP.chunkLength);assert.equal(ramp.prepareNextChunk(Infinity),true);
    assert.ok(ramp.mesh.children.every(chunk=>chunk.visible));
  } finally {
    THREE.BufferGeometry.prototype.clone=clone;THREE.BufferGeometry.prototype.applyMatrix4=transform;
    world.createCollider=createCollider;world.free();
  }
});
