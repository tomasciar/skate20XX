import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { courseHeight, courseSlope, courseX, courseCurveSlope } from '../src/world/course.ts';
import { landscapeWorldHeight, makeLandscape, landscapeHeight, LANDSCAPE_X } from '../src/world/landscape.ts';
import { placeScenery } from '../src/world/placement.ts';
import { makeScenery, makePicnic } from '../src/world/scenery.ts';
import { seededRandom } from '../src/world/generation.ts';
import { createRamp, RAMP } from '../src/world/ramp.ts';

const angle=RAMP.angleDeg*Math.PI/180;
const hillRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-angle);
const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});

test('course is mostly downhill, with genuinely flat sections, small rises and continuous seams',()=>{
  const grade=(s:number)=>Math.atan(courseSlope(s))-angle;
  assert.ok(Math.abs(grade(20)+angle)<1e-10);
  assert.ok(Math.abs(grade(525))<1e-10);
  assert.ok(grade(1295)>0 && grade(1295)<2*Math.PI/180);
  let descending=0;
  for(let s=0;s<2240;s+=5) { if(grade(s)<-0.01)descending++;assert.ok(grade(s)>=-angle-1e-10); }
  assert.ok(descending/(2240/5)>0.7);
  for(const start of [-2240,-140,280,490,700,1260,2240,4480,700000]) {
    assert.ok(Math.abs(courseHeight(start-0.00001)-courseHeight(start+0.00001))<0.00001);
    assert.ok(Number.isFinite(courseSlope(start)));
  }
});

test('road bends vary smoothly with broad radii and a straight opening',()=>{
  for(const along of [-140,0,70,140,280])assert.equal(courseX(along),0);
  let low=Infinity,high=-Infinity;
  for(let along=0;along<30000;along+=5) {
    const x=courseX(along),slope=courseCurveSlope(along);
    low=Math.min(low,x);high=Math.max(high,x);
    assert.ok(Math.abs(x)<=45.01);
    assert.ok(Math.abs(slope)<0.21,'bend became too sharp');
    assert.ok(Math.abs(courseCurveSlope(along+5)-slope)/5<1/950,'turn-in became too abrupt');
  }
  assert.ok(low<-35 && high>35,'route needs bends in both directions');
  for(const along of [280,350,700,1260,2240,4480,700000]) {
    assert.ok(Math.abs(courseX(along-0.00001)-courseX(along+0.00001))<0.00001);
  }
});

test('curved landscape support matches its triangles and adjoining chunks stay seamless',async()=>{
  await RAPIER.init();
  const material=new THREE.MeshStandardMaterial(),first=makeLandscape(10,material),second=makeLandscape(11,material);
  const a=first.geometry.getAttribute('position'),b=second.geometry.getAttribute('position');
  for(let i=0;i<LANDSCAPE_X.length;i++) {
    assert.ok(Math.abs(a.getX(a.count-LANDSCAPE_X.length+i)-b.getX(i))<0.00001);
    assert.ok(Math.abs(a.getY(a.count-LANDSCAPE_X.length+i)-b.getY(i))<0.00001);
  }
  const world=new RAPIER.World({x:0,y:0,z:0}),geometry=first.geometry;
  world.createCollider(RAPIER.ColliderDesc.trimesh(geometry.getAttribute('position').array as Float32Array,new Uint32Array(geometry.index!.array)));
  world.step();
  for(const x of [-180,-55,-12,0,18,130])for(const local of [2.3,19.1,68.4]) {
    const along=700+local,height=landscapeHeight(x,along);
    const hit=world.castRay(new RAPIER.Ray({x:x+courseX(along),y:height+15,z:-local},{x:0,y:-1,z:0}),30,true);
    assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-15)<0.001);
  }
  world.free();first.geometry.dispose();second.geometry.dispose();material.dispose();
});

test('furniture and parking foundations stay level and cover their terrain footprint on changing grades',()=>{
  for(const along of [20,320,525,1100,1295]) for(const yaw of [0,Math.PI/2]) {
    const sources=[makeScenery('grove',1,seededRandom(3)),makeScenery('village',1,seededRandom(4)),makePicnic()];
    for(const object of sources) {
      const start=Math.floor(along/70)*70,base=courseHeight(start);
      const root=placeScenery(object,18,along-start,start,base,angle,yaw) as THREE.Group;
      root.updateMatrixWorld(true);
      const pad=root.children[1] as THREE.Mesh;
      pad.geometry.computeBoundingBox();const bounds=pad.geometry.boundingBox!;
      const levels:number[]=[];
      for(const x of [bounds.min.x,0,bounds.max.x]) for(const z of [bounds.min.z,0,bounds.max.z]) {
        const top=root.localToWorld(new THREE.Vector3(x,0,z));
        const bottom=root.localToWorld(new THREE.Vector3(x,-root.userData.padDepth,z));
        const ground=landscapeWorldHeight(top.x,start-top.z);
        assert.ok(top.y+base>=ground-0.001,'pad is buried');
        assert.ok(bottom.y+base<=landscapeWorldHeight(bottom.x,start-bottom.z),'pad floats above terrain');
        levels.push(top.clone().applyQuaternion(hillRotation).y);
      }
      assert.ok(Math.max(...levels)-Math.min(...levels)<1e-8,'furniture support is tilted');
      const objectBounds=new THREE.Box3().setFromObject(object);
      assert.ok(Number.isFinite(objectBounds.min.y));
    }
  }
});

test('streamed road and rail collision matches rendered grades through vertical origin shifts',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world);
  for(const along of [300,495,555,1105,1275,1405,2245,70005]) {
    const cursor=Math.floor(along/70)*70;
    const previous=ramp.distance;
    const shift=ramp.scroll(cursor-previous);
    const expected=ramp.forward.clone().multiplyScalar(previous-cursor).addScaledVector(ramp.surfaceNormal,courseHeight(previous)-courseHeight(cursor)).add(new THREE.Vector3(courseX(previous)-courseX(cursor),0,0));
    assert.ok(shift.distanceTo(expected)<1e-6);
    world.step();scene.updateMatrixWorld(true);
    const origin=new THREE.Vector3(0.7+courseX(along)-courseX(cursor),courseHeight(along)-courseHeight(cursor)+3,-(along-cursor)).applyMatrix4(ramp.mesh.matrixWorld);
    const down=ramp.surfaceNormal.clone().negate();
    const hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,down),5,true);
    assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-2.5)<0.002,`road collision at ${along}`);
    const visual=new THREE.Raycaster(origin,down).intersectObject(ramp.mesh,true)[0];
    assert.ok(visual);assert.ok(Math.abs(hit.timeOfImpact-visual.distance)<0.002);
    for(const rail of ramp.grindRails) {
      const tangent=rail.end.clone().sub(rail.start).normalize(),up=rail.normal!;
      assert.ok(Math.abs(tangent.dot(up))<1e-8);
      const center=rail.start.clone().lerp(rail.end,0.5).add(up);
      const top=world.castRayAndGetNormal(new RAPIER.Ray(center,up.clone().negate()),2,true);
      assert.ok(top);assert.ok(Math.abs(top.timeOfImpact-1)<0.002,`rail surface mismatch ${rail.id}`);
    }
    assert.ok(world.colliders.len()<=RAMP.chunksBehind+1+RAMP.chunksAhead+RAMP.prepareLead+3,`unbounded colliders: ${world.colliders.len()}`);
  }
  world.free();
});
