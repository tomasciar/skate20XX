import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {FOUNDRY,foundryPoint,foundryLocal,spiralPoint} from '../src/world/planning/foundryQuarter.ts';
import {makeFoundryQuarter} from '../src/world/structures/foundryQuarter.ts';
import {createRamp} from '../src/world/ramp.ts';
import {courseHeight,courseX} from '../src/world/terrain/course.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import {surface} from '../src/world/rendering/appearance.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
function setup(mode:'skate'|'snowboard'='skate') {
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false});scene.updateMatrixWorld(true);
  const toWorld=(raw:THREE.Vector3)=>raw.clone().sub(new THREE.Vector3(courseX(ramp.distance),courseHeight(ramp.distance),-ramp.distance)).applyMatrix4(ramp.mesh.matrixWorld);
  const toRaw=(point:THREE.Vector3)=>ramp.mesh.worldToLocal(point.clone()).add(new THREE.Vector3(courseX(ramp.distance),courseHeight(ramp.distance),-ramp.distance));
  return {world,scene,ramp,toWorld,toRaw};
}

test('the authored quarter is bounded, detailed and uses shared mode-aware materials',()=>{
  const road=surface(new THREE.MeshStandardMaterial(),'road'),names=new Map<string,number>();let triangles=0;
  for(let index=2;index<=9;index++)for(const mesh of makeFoundryQuarter(index,road)) {
    names.set(mesh.name,(names.get(mesh.name)??0)+1);
    triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
    for(const value of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(value));
    if(mesh.name.includes('paving')||mesh.name.includes('spiral-ramp')||mesh.name.includes('parking-floor'))assert.equal(mesh.material,road);
    if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
  }
  assert.equal(names.get('foundry-spiral-ramp'),1);assert.equal(names.get('foundry-parking-floor'),3);
  assert.ok(names.get('foundry-shop-glass')!>=7);assert.ok(names.get('foundry-cafe-seat')!>=20);
  assert.ok(names.get('foundry-parking-bay-line')!>50);assert.ok(triangles<30000,`bounded authored geometry: ${triangles}`);
});

test('the spiral gains real height and has continuous collision and clear headroom around both turns',async()=>{
  await RAPIER.init();const f=setup();
  try {
    assert.ok(Math.abs(foundryLocal(spiralPoint(1)).y-foundryLocal(spiralPoint(0)).y-FOUNDRY.rise)<1e-8);
    f.world.step();
    for(let i=1;i<160;i++) {
      const t=i/160,point=f.toWorld(spiralPoint(t)),up=new THREE.Vector3(0,1,0);
      const ray=f.world.castRay(new RAPIER.Ray(point.clone().addScaledVector(up,.25),up.clone().negate()),.6,true);
      assert.ok(ray&&Math.abs(ray.timeOfImpact-.25)<.018,`continuous floor at ${t}: ${ray?.timeOfImpact}`);
      const headroom=f.world.castRay(new RAPIER.Ray(point.clone().addScaledVector(up,.1),up),2,true);
      assert.equal(headroom,null,`no landing slab through the rider at ${t}`);
    }
  } finally {f.world.free();}
});

test('the actual rider can climb both turns using ordinary carving and pushing in both modes',async()=>{
  await RAPIER.init();
  for(const mode of ['skate','snowboard'] as const) {
    const f=setup(mode),player=createBoardPlayer(f.scene,f.world,f.ramp,mode),tricks=createTrickSystem();
    try {
      const start=.015,at=f.toWorld(spiralPoint(start)),heading=f.toWorld(spiralPoint(start+.001)).sub(at).normalize();
      // Supply an initial heading only; the entire ride after reset uses the normal controller and physics.
      const direction=f.ramp.directionAt;f.ramp.directionAt=(_,out)=>out.copy(heading);player.reset(at,false);f.ramp.directionAt=direction;
      for(let i=0;i<35;i++){player.update(dt,idle,tricks.state);f.world.step();player.sync(false);}
      player.body.setLinvel(heading.multiplyScalar(20),true);
      let angle=Math.PI/2+start*Math.PI*4,previous=angle,progress=start,grounded=0,maxDeviation=0;
      for(let i=0;i<10000&&progress<.995;i++) {
        const p=foundryLocal(f.toRaw(player.position)),next=Math.atan2(p.z,p.x-88);
        angle+=Math.atan2(Math.sin(next-previous),Math.cos(next-previous));previous=next;progress=(angle-Math.PI/2)/(Math.PI*4);
        const look=Math.max(3,player.speed*.18),target=f.toWorld(spiralPoint(Math.min(1.025,progress+look/(21*Math.PI*4)))).sub(player.position);
        const desired=Math.atan2(-target.x,target.dot(f.ramp.forward)),yaw=Math.atan2(-player.forward.x,player.forward.dot(f.ramp.forward));
        const error=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
        player.update(dt,{...idle,push:1,steer:THREE.MathUtils.clamp(-error*4/carveTurnRate(player.speed),-1,1)},tricks.state);f.world.step();player.sync(false);
        assert.equal(player.crashed,false,`${mode}: ${player.crashCause}, progress=${progress}, r=${Math.hypot(p.x-88,p.z)}`);
        if(!player.airborne)grounded++;
        maxDeviation=Math.max(maxDeviation,Math.abs(Math.hypot(p.x-88,p.z)-21));
      }
      assert.ok(progress>=.995&&grounded>1000&&maxDeviation<3.8,`${mode}: progress=${progress}, grounded=${grounded}, deviation=${maxDeviation}`);
      assert.ok(foundryLocal(f.toRaw(player.position)).y>9,'reach the upper deck, rather than circling on the ground');
    } finally {f.world.free();}
  }
});

test('slow court traffic stays off the main road, follows physics and survives origin shifts',async()=>{
  await RAPIER.init();const f=setup();
  try {
    const actors:THREE.Group[]=[];f.scene.traverse(o=>{if(o instanceof THREE.Group&&o.userData.quarterTraffic)actors.push(o);});assert.equal(actors.length,2);
    const start=actors.map(o=>o.getWorldPosition(new THREE.Vector3()));
    for(let i=0;i<120;i++){f.ramp.stepProps!(dt);f.world.step();f.ramp.syncProps!();}f.ramp.renderProps!(1);
    for(let i=0;i<actors.length;i++) {
      const at=actors[i]!.getWorldPosition(new THREE.Vector3()),raw=f.toRaw(at),along=-raw.z;
      assert.ok(at.distanceTo(start[i]!)>.2);assert.ok(raw.x-courseX(along)>31);
    }
    f.ramp.reset();
    for(let i=0;i<actors.length;i++)assert.ok(actors[i]!.getWorldPosition(new THREE.Vector3()).distanceTo(start[i]!)<.002,'restart restores the parking maneuvers');
    const before=actors.map(o=>o.getWorldPosition(new THREE.Vector3())),delta=f.ramp.scroll(70);f.ramp.renderProps!(1);
    for(let i=0;i<actors.length;i++)assert.ok(actors[i]!.getWorldPosition(new THREE.Vector3()).distanceTo(before[i]!.add(delta))<.002);
    for(let i=0;i<8;i++){f.ramp.scroll(70);while(!f.ramp.prepareNextChunk(Infinity)){}f.ramp.flushDeferredDestroy();}
    f.ramp.reset();let count=0;f.scene.traverse(o=>{if(o.userData.quarterTraffic)count++;});assert.equal(count,2,'rewinding must not duplicate actors');
  } finally {f.world.free();}
});

test('the warehouse roof connects into the upper parking lane without a forced turn or teleport',async()=>{
  await RAPIER.init();
  const road=new THREE.MeshStandardMaterial(),meshes=[...makeFoundryQuarter(5,road)];
  const source=meshes.find(m=>m.name==='foundry-warehouse-roof-link')!,positions=source.geometry.getAttribute('position'),rows=positions.count/4,points:THREE.Vector3[]=[];
  for(let i=0;i<rows;i++)points.push(new THREE.Vector3().fromBufferAttribute(positions,i*2).add(new THREE.Vector3().fromBufferAttribute(positions,i*2+1)).multiplyScalar(.5).add(new THREE.Vector3(courseX(350),courseHeight(350),-350)));
  const endAlong=-points.at(-1)!.z;
  const line=(along:number)=>{
    if(along<380)return 23.5;
    if(along>endAlong) {
      const f=(along-endAlong)/Math.cos(14*Math.PI/180);
      return 88-Math.sqrt(28.1**2-Math.min(25,f)**2)+courseX(475)-courseX(along);
    }
    const i=points.findIndex(p=>-p.z>=along),a=points[Math.max(0,i-1)]!,b=points[Math.max(0,i)]!,t=(-along-a.z)/(b.z-a.z||1);
    return a.x+(b.x-a.x)*t-courseX(along);
  };
  for(const mode of ['skate','snowboard'] as const) {
    const f=setup(mode),player=createBoardPlayer(f.scene,f.world,f.ramp,mode),tricks=createTrickSystem();
    try {
      const at=f.toWorld(new THREE.Vector3(23.5+courseX(360),courseHeight(360)+4.5,-360));player.reset(at,false);
      for(let i=0;i<35;i++){player.update(dt,idle,tricks.state);f.world.step();player.sync(false);}player.body.setLinvel(f.ramp.forward.clone().multiplyScalar(21),true);
      let reached=false;
      for(let i=0;i<2500;i++) {
        const raw=f.toRaw(player.position),along=-raw.z,look=Math.max(5,player.speed*.28);
        const dx=line(along+look)+courseX(along+look)-raw.x,desired=Math.atan2(-dx,look),yaw=Math.atan2(-player.forward.x,player.forward.dot(f.ramp.forward));
        const error=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
        player.update(dt,{...idle,push:1,steer:player.airborne?0:THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1)},tricks.state);f.world.step();player.sync(false);
        assert.equal(player.crashed,false,`${mode}: ${player.crashCause} at ${along}, x=${raw.x-courseX(along)}`);
        if(along>endAlong+8&&!player.airborne) {reached=foundryLocal(raw).y>9;break;}
      }
      assert.ok(reached,`${mode}: enter and ride along the upper parking lane`);
    } finally {f.world.free();}
  }
  for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
});
