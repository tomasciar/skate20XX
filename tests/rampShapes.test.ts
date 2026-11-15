import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createRampShapeGeometry,makeRampShape,rampShapeHeight} from '../src/world/rampShapes.ts';
import type {RampShape} from '../src/world/rampShapes.ts';
import {bakeSceneryCollision} from '../src/world/collision.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks.ts';
import {createRamp,RAMP,type RampWorld} from '../src/world/ramp.ts';
import type {PlayerIntent} from '../src/player/controller.ts';
import {planChunk} from '../src/world/generation.ts';
import {courseHeight,courseX} from '../src/world/course.ts';
import {START_BOOST} from '../src/world/startPlatform.ts';

const dt=1/120,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-14*Math.PI/180);
const normal=new THREE.Vector3(0,1,0).applyQuaternion(rotation),forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation);
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
const shape=(kind:RampShape['kind'],side:-1|1=1):RampShape=>{
  const {width,length,height}=planChunk(kind==='curved'?1:2).encounters[0]!;
  return {kind,side,width,length,height};
};

test('curved launchers start flat and grow into a takeoff; side banks rise toward the verge and downhill lip',()=>{
  for(const kind of ['curved','bank'] as const) {
    const ramp=shape(kind);
    for(const u of [0,0.25,0.5,1])assert.equal(rampShapeHeight(ramp,u,0),0);
    for(const t of [0.1,0.4,0.8]) {
      const start=rampShapeHeight(ramp,1,t),next=rampShapeHeight(ramp,1,t+0.01);
      assert.ok(next>start);assert.ok((next-start)/(ramp.length*0.01)<0.75,'transition should stay smooth and rideable');
    }
    if(kind==='bank')for(const t of [0,0.5,1])assert.equal(rampShapeHeight(ramp,0,t),0,'inner edge must remain flush');
    else assert.equal(rampShapeHeight(ramp,0.2,0.7),rampShapeHeight(ramp,0.8,0.7));
  }
});

test('mirrored bank geometry has inward/upward normals and closed, matching mesh collision',async()=>{
  await RAPIER.init();
  for(const side of [-1,1] as const) {
    const world=new RAPIER.World({x:0,y:0,z:0}),root=new THREE.Group(),ramp=shape('bank',side);
    const geometry=createRampShapeGeometry(ramp),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);root.add(mesh);
    const baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    try {
      for(const u of [0.25,0.6,0.9])for(const t of [0.2,0.5,0.85]) {
        const origin=new THREE.Vector3(side*(u-0.5)*ramp.width,3,ramp.length*(0.5-t)),down=new THREE.Vector3(0,-1,0);
        const hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,down),4,true);
        const visual=new THREE.Raycaster(origin,down).intersectObject(root,true)[0];
        assert.ok(hit && visual);assert.ok(Math.abs(hit.timeOfImpact-visual.distance)<0.001);
        assert.ok(Math.abs(3-hit.timeOfImpact-rampShapeHeight(ramp,u,t))<0.01);
        assert.ok(hit.normal.x*side<0 && hit.normal.y>0.55 && hit.normal.z>0,'surface should guide the launch inward and forward');
      }
      const underside=world.castRayAndGetNormal(new RAPIER.Ray({x:0,y:-1,z:0},{x:0,y:1,z:0}),2,true);
      assert.ok(underside);assert.ok(underside.normal.y<0,'ramps must be solid underneath');
    } finally {world.free();geometry.dispose();material.dispose();}
  }
});

test('ramps include every underlying road seam, while painted guides do not add collision edges',()=>{
  const ramp=shape('bank'),geometry=createRampShapeGeometry(ramp,12.7),position=geometry.getAttribute('position');
  for(const seam of [15,20]) {
    const z=ramp.length/2-(seam-12.7);
    assert.ok(Array.from({length:position.count},(_,i)=>position.getZ(i)).some(value=>Math.abs(value-z)<1e-5));
  }
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();root.add(...makeRampShape(ramp,material,material,12.7));
  const collision=bakeSceneryCollision(root)!;assert.equal(collision.meshCount,1);
  geometry.dispose();root.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});material.dispose();
});

test('lip paint and edge markings follow the actual ramp triangles across the bank and along its bend',()=>{
  const material=new THREE.MeshStandardMaterial();
  try {
    for(const kind of ['curved','bank'] as const)for(const side of [-1,1] as const) {
      const meshes=makeRampShape(shape(kind,side),material,material,12.7),deck=meshes[0]!;
      deck.updateMatrixWorld(true);
      try {
        for(const paint of meshes.slice(1)) {
          const points=paint.geometry.getAttribute('position'),index=paint.geometry.index!;
          for(let i=0;i<index.count;i+=3) {
            const point=new THREE.Vector3();
            for(let j=0;j<3;j++)point.addScaledVector(new THREE.Vector3().fromBufferAttribute(points,index.getX(i+j)),1/3);
            const origin=point.clone();origin.y=10;
            const hit=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0)).intersectObject(deck)[0];
            assert.ok(hit);
            assert.ok(Math.abs(point.y-hit.point.y-0.004)<0.00001,'paint must stay against the surface instead of bridging over the curve');
          }
        }
      } finally {for(const mesh of meshes)mesh.geometry.dispose();}
    }
  } finally {material.dispose();}
});

test('ramp variety appears on both sides without filling the central riding corridor',()=>{
  const seen=new Set<string>();let launchers=0,banks=0;
  for(let index=0;index<10000;index++)for(const item of planChunk(index).encounters)if(item.kind==='curved' || item.kind==='bank') {
    seen.add(`${item.kind}:${Math.sign(item.x)}`);
    assert.ok(Math.abs(item.x)-item.width/2>2.2);
    assert.ok(item.along-item.length/2>8 && item.along+item.length/2<62);
    if(item.kind==='curved') {
      launchers++;
      assert.ok(item.height>=2.8 && item.height<=3.3 && item.width>=4.2 && item.length>=14);
      assert.ok(2*item.height/item.length>0.34,'curved ramps still need a positive takeoff angle on the opening hill');
    } else {
      banks++;
      assert.ok(item.length<=13 && item.height>=2.2,'side banks should be shorter with a pronounced rise');
    }
  }
  assert.equal(seen.size,4);
  const averageSpacing=10000*RAMP.chunkLength/launchers;
  assert.ok(averageSpacing>1200 && averageSpacing<2500,'big launchers should be occasional course features');
  assert.ok(banks>launchers*2,'side banks should stay more common than big launch ramps');
  assert.deepEqual(planChunk(1).encounters[0],{kind:'curved',x:4.9,along:22,width:4.2,length:16,height:3.2});
  assert.deepEqual(planChunk(2).encounters[0],{kind:'bank',x:-4.9,along:22,width:4.2,length:12,height:2.8});
  assert.equal(planChunk(1).encounters[1]!.kind,'ledge','keep the opening grind features');
  assert.equal(planChunk(2).encounters[1]!.kind,'rail');
});

async function riddenRamp(kind:RampShape['kind'],side:-1|1,speed:number) {
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),root=new THREE.Group();root.quaternion.copy(rotation);scene.add(root);
  const ramp=shape(kind,side),center=20,entry=center-ramp.length/2;
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.25*normal.y,-0.25*normal.z).setRotation(rotation));
  world.createCollider(RAPIER.ColliderDesc.cuboid(40,0.25,1000),floor);
  const material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(createRampShapeGeometry(ramp),material);
  mesh.position.set(side*4.9,0,-center);root.add(mesh);root.updateMatrixWorld(true);
  // Bake in hill-local coordinates, then apply the hill transform just once to the collider.
  const baked=bakeSceneryCollision(root)!,body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setRotation(rotation));
  world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices),body);
  const x=side*(4.9+(kind==='bank'?0.35*ramp.width:0));
  const spawn=new THREE.Vector3(x,0.02,-entry+3).applyQuaternion(rotation),anchor=new THREE.Vector3();
  const course:RampWorld={mesh:root,spawn,anchor,surfaceOrigin:anchor,endZ:-99999,surfaceNormal:normal.clone(),forward:forward.clone(),
    distance:0,grindRails:[],scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(scene,world,course),tricks=createTrickSystem();
  const tick=()=>{player.update(dt,idle,tricks.state);world.step();player.sync(false);};
  for(let i=0;i<60;i++)tick();player.body.setLinvel(forward.clone().multiplyScalar(speed),true);
  return {world,player,tick,geometry:mesh.geometry,material};
}

test('curved ramps launch and land the actual rider with forward momentum using the existing physics',async()=>{
  for(const speed of [18,35,55,70]) {
    const f=await riddenRamp('curved',1,speed);
    try {
      let airRun=0,launched=false,landed=false,maxHeight=0,takeoffY=0,peakY=0;
      for(let i=0;i<600;i++) {
        f.tick();assert.equal(f.player.crashed,false);
        maxHeight=Math.max(maxHeight,f.player.position.dot(normal));
        airRun=f.player.grounded?0:airRun+1;
        if(!launched && airRun>=10 && f.player.position.dot(forward)>20+shape('curved').length/2) {
          launched=true;takeoffY=f.player.position.y;peakY=takeoffY;
          assert.ok(f.player.velocity.y>0,`ramp should send the rider upward at ${speed}`);
          assert.ok(f.player.velocity.dot(forward)>speed*0.7);
        }
        if(launched) {
          peakY=Math.max(peakY,f.player.position.y);
          if(f.player.grounded){landed=true;break;}
        }
      }
      assert.ok(launched,`no curved-ramp launch at ${speed}`);
      assert.ok(landed,`curved-ramp jump should be landable at ${speed}`);
      assert.ok(maxHeight>shape('curved').height,'launch should clear the full ramp height');
      if(speed>=35)assert.ok(peakY-takeoffY>0.15,'the smaller ramp should still provide upward airtime');
      assert.equal(f.player.ollieCount,0,'a geometry launch must not become a fake ollie event');
    } finally {f.world.free();f.geometry.dispose();f.material.dispose();}
  }
});

test('sideways banks fling toward the center while retaining the downhill direction on either side',async()=>{
  for(const side of [-1,1] as const)for(const speed of [20,45,70]) {
    const f=await riddenRamp('bank',side,speed);
    try {
      let airRun=0,launched=false,maxHeight=0;
      for(let i=0;i<260;i++) {
        f.tick();assert.equal(f.player.crashed,false,`bank ${side}, speed ${speed}: ${f.player.crashCause}, at ${f.player.position.dot(forward)}`);
        maxHeight=Math.max(maxHeight,f.player.position.dot(normal));airRun=f.player.grounded?0:airRun+1;
        if(airRun>=10 && maxHeight>0.3) {launched=true;break;}
      }
      assert.ok(launched,`no bank launch on ${side} at ${speed}`);
      assert.ok(f.player.velocity.x*side<0,'bank must send the rider inward');
      assert.ok(Math.abs(f.player.velocity.x)/f.player.speed>0.075,'bank should give a pronounced sideways kick');
      assert.ok(f.player.velocity.dot(forward)>speed*0.7,'forward momentum must survive the sideways bank');
      assert.ok(f.player.velocity.dot(forward)/f.player.velocity.length()>0.85,'launch must remain mainly downhill');
      assert.equal(f.player.ollieCount,0);
    } finally {f.world.free();f.geometry.dispose();f.material.dispose();}
  }
});

test('the opening curved jump can be ridden and landed after taking the actual start boost pad',async()=>{
  await RAPIER.init();
  const context=new Proxy({},{get:()=>()=>{}});
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    ramp.setMode!(mode);
    try {
      const position=ramp.anchor.clone().addScaledVector(ramp.forward,START_BOOST.along)
        .addScaledVector(ramp.surfaceNormal,0.2).add(new THREE.Vector3(START_BOOST.x,0,0));
      player.body.setTranslation(position,true);player.body.setLinvel(ramp.forward.clone().multiplyScalar(10),true);
      world.step();player.sync(false);
      let boosted=false,launched=false,landed=false,stableFrames=0;
      for(let i=0;i<900;i++) {
        player.update(dt,idle,tricks.state);world.step();player.sync(false);
        const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
        assert.equal(player.crashed,false,`${mode} opening ramp crashed: ${player.crashCause} at ${along.toFixed(1)} m`);
        if(player.speed>START_BOOST.speed-1)boosted=true;
        if(along>100 && !player.grounded)launched=true;
        stableFrames=launched && player.grounded?stableFrames+1:0;
        if(stableFrames>=12){landed=true;break;}
      }
      assert.ok(boosted && launched && landed,'the boosted jump must include a complete rideable landing');
    } finally {world.free();}
  }
});

test('generated ramps follow the road profile, share collision with their visible surface, and work in both skins',async()=>{
  await RAPIER.init();
  const context=new Proxy({},{get:()=>()=>{}});
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});
  const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world);
  try {
    for(const kind of ['curved','bank'] as const) {
      let index=2,item;
      for(;index<500;index++){item=planChunk(index).encounters.find(encounter=>encounter.kind===kind);if(item)break;}
      assert.ok(item);
      const cursor=index*RAMP.chunkLength;ramp.scroll(cursor-ramp.distance);world.step();scene.updateMatrixWorld(true);
      const u=0.75,t=0.7,side=item.x<0?-1:1,along=cursor+item.along+(t-0.5)*item.length;
      const height=rampShapeHeight({kind,side,width:item.width,length:item.length,height:item.height},u,t);
      const local=new THREE.Vector3(item.x+side*(u-0.5)*item.width+courseX(along)-courseX(cursor),
        RAMP.thickness/2+courseHeight(along)-courseHeight(cursor)+height+3,-(along-cursor));
      const origin=local.applyMatrix4(ramp.mesh.matrixWorld),down=ramp.surfaceNormal.clone().negate();
      for(const mode of ['skate','snowboard'] as const) {
        ramp.setMode!(mode);
        const physical=world.castRay(new RAPIER.Ray(origin,down),5,true);
        const visual=new THREE.Raycaster(origin,down,0,5).intersectObject(ramp.mesh,true)[0];
        assert.ok(physical && visual);assert.ok(Math.abs(physical.timeOfImpact-visual.distance)<0.002);
        assert.ok(Math.abs(physical.timeOfImpact-3)<0.01);
        const color=((visual.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex();
        assert.equal(color,kind==='bank'?0x9762df:0x1db5d0,'ramps must retain their bold obstacle colors in either skin');
      }
      const center=new THREE.Vector3(courseX(along)-courseX(cursor),RAMP.thickness/2+courseHeight(along)-courseHeight(cursor)+3,-(along-cursor))
        .applyMatrix4(ramp.mesh.matrixWorld);
      const clear=world.castRay(new RAPIER.Ray(center,down),5,true);assert.ok(clear);
      assert.ok(Math.abs(clear.timeOfImpact-3)<0.002,'central downhill line must stay unobstructed');
    }
  } finally {world.free();}
});
