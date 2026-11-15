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
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { steerAlongCourse } from '../scripts/driveCourse.ts';

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
  for(let s=0;s<2240;s+=5) { if(grade(s)<-0.01)descending++;assert.ok(grade(s)>=-38*Math.PI/180-1e-10); }
  assert.ok(descending/(2240/5)>0.7);
  for(const start of [-2240,-140,280,490,700,1260,2240,4480,700000]) {
    assert.ok(Math.abs(courseHeight(start-0.00001)-courseHeight(start+0.00001))<0.00001);
    assert.ok(Number.isFinite(courseSlope(start)));
  }
});

test('occasional drops vary from steep to very steep while most of the route keeps its gentler profile',()=>{
  const degrees=(along:number)=>(Math.atan(courseSlope(along))-angle)*180/Math.PI;
  for(const [cycle,peak] of [26,34,28,38].entries()) {
    const start=1540+cycle*2240;
    assert.ok(Math.abs(degrees(start+490)+peak)<0.01);
    assert.ok(Math.abs(degrees(start+980)+14)<0.02,'each drop must ease back into the usual descent');
    assert.ok(Math.abs(degrees(525+cycle*2240))<0.001,'keep the flat stretches');
    assert.ok(degrees(1295+cycle*2240)>0,'keep the small rises');
    for(const edge of [start,start+490,start+980]) {
      assert.ok(Math.abs(courseHeight(edge-1e-5)-courseHeight(edge+1e-5))<2e-5,'drop height seam');
    }
  }
  let ordinary=0,steep=0,verySteep=0;
  for(let along=0;along<8960;along+=5) {
    const grade=degrees(along);
    if(grade>=-18)ordinary++;
    if(grade<-22)steep++;
    if(grade<-32)verySteep++;
    assert.ok(grade>=-38.001 && grade<=1.501);
    assert.ok(Math.abs(degrees(along+5)-grade)<0.6,'grade change became abrupt');
    assert.ok(Math.abs(courseHeight(along+5)-courseHeight(along)-courseSlope(along)*5)<1e-8);
  }
  assert.ok(ordinary/(8960/5)>0.7,'steep terrain should remain occasional');
  assert.ok(steep>100 && verySteep>20,'both steep and very steep sections must occur');
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
  for(const along of [20,320,525,1100,1295,2030,4270,8750]) for(const yaw of [0,Math.PI/2]) {
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
        assert.ok(bottom.y+base<=landscapeWorldHeight(bottom.x,start-bottom.z),`pad floats above terrain at ${along}, yaw ${yaw}, gap ${bottom.y+base-landscapeWorldHeight(bottom.x,start-bottom.z)}`);
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
  for(const along of [300,495,555,1105,1275,1405,2035,2245,4275,8755,70005]) {
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
      // Probe off the top face's triangle seam, which is numerically ambiguous at steep angles.
      const center=rail.start.clone().lerp(rail.end,0.37).add(up);
      const top=world.castRayAndGetNormal(new RAPIER.Ray(center,up.clone().negate()),2,true);
      const drawn=new THREE.Raycaster(center,up.clone().negate(),0,2).intersectObject(ramp.mesh,true)[0];
      assert.ok(top && drawn);assert.ok(Math.abs(top.timeOfImpact-drawn.distance)<0.002,`rail surface mismatch ${rail.id}, toi ${top.timeOfImpact}, drawn ${drawn.distance}`);
      assert.ok(Math.abs(drawn.distance-1)<0.002);
    }
    assert.ok(world.colliders.len()<=RAMP.chunksBehind+1+RAMP.chunksAhead+RAMP.prepareLead+3,`unbounded colliders: ${world.colliders.len()}`);
  }
  world.free();
});

test('a fast rider can coast through moderate and very steep drops without crashing at the transitions',async()=>{
  await RAPIER.init();
  const idle={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
    wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
  for(const cycle of [0,3]) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/120;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{startPlatform:false}),player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
    try {
      const start=1540+cycle*2240;
      ramp.scroll(start);world.step();
      for(let i=0;i<120;i++){player.update(1/120,{...idle,steer:steerAlongCourse(player,ramp)},tricks.state);world.step();player.sync(false);}
      const direction=ramp.directionAt!(player.position,new THREE.Vector3());
      player.body.setLinvel(direction.multiplyScalar(85),true);
      let furthest=0,airFrames=0,airRun=0,longestAir=0;
      for(let i=0;i<1800;i++) {
        player.update(1/120,{...idle,steer:steerAlongCourse(player,ramp)},tricks.state);world.step();player.sync(false);
        assert.equal(player.crashed,false,`crash in drop ${cycle}, frame ${i}`);
        assert.ok(Math.abs(ramp.roadOffset!(player.position))<4,`drop ${cycle}, frame ${i}, offset ${ramp.roadOffset!(player.position)}, grounded ${player.grounded}, speed ${player.speed}, distance ${ramp.distance}, air ${airFrames}, longest ${longestAir}`);
        if(!player.grounded){airFrames++;airRun++;longestAir=Math.max(longestAir,airRun);}else airRun=0;
        furthest=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
        if(furthest>start+1100)break;
      }
      assert.ok(furthest>start+1100,'rider should make it through the exit transition');
      assert.ok(longestAir<5,`drop ${cycle}: ${airFrames} air frames, longest run ${longestAir}`);
      assert.equal(player.ollieCount,0);
    } finally {world.free();}
  }
});
