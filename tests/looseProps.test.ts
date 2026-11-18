import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {createLooseCone,isLooseProp,isSolidObstacle,strikeLooseProp} from '../src/world/physics/looseProps.ts';
import {makeCone} from '../src/world/props/scenery.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
const dt=1/120,up=new THREE.Vector3(0,1,0);
const idle={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('lightweight cones rest until hit, tumble, interpolate, survive rebases, reset and clean up',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),chunk=new THREE.Group(),mesh=makeCone();scene.add(chunk);chunk.add(mesh);
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.5,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(100,.5,100),floor);
  const cone=createLooseCone(world,mesh);
  try {
    assert.ok(isLooseProp(cone.collider));assert.equal(isSolidObstacle(cone.collider),false);
    assert.ok(Math.abs(cone.collider.mass()-.8)<1e-5);
    for(let i=0;i<60;i++){world.step();cone.sync();}
    assert.ok(new THREE.Vector3().copy(cone.body.translation()).length()<.02,'unhit cone should stay planted');
    strikeLooseProp(cone.collider,new THREE.Vector3(0,0,-25),up);
    assert.ok(cone.body.linvel().y>4);assert.ok(cone.body.linvel().z<-15);
    assert.ok(new THREE.Vector3().copy(cone.body.angvel()).length()>4);
    const before=new THREE.Vector3().copy(cone.body.translation());world.step();cone.sync();cone.render(.5);
    const expected=before.lerp(new THREE.Vector3().copy(cone.body.translation()),.5);
    assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-6);
    const shift=new THREE.Vector3(5,17,70),velocity=new THREE.Vector3().copy(cone.body.linvel());
    chunk.position.add(shift);cone.shift(shift);cone.render(.5);
    assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(expected.add(shift))<1e-6);
    assert.ok(new THREE.Vector3().copy(cone.body.linvel()).distanceTo(velocity)<1e-6);
    cone.reset();assert.equal(cone.body.isSleeping(),true);
    assert.ok(new THREE.Vector3().copy(cone.body.translation()).distanceTo(shift)<1e-6);
    strikeLooseProp(cone.collider,new THREE.Vector3(0,0,-10),up);assert.ok(cone.body.linvel().y>2);
    cone.dispose();assert.equal(world.bodies.len(),1);assert.equal(world.colliders.len(),1);
  } finally {world.free();}
});

for(const mode of ['skate','snowboard'] as const) {
  test(`${mode}: riding into generated pylons throws them without a bail or hidden static collision`,async()=>{
    await RAPIER.init();
    const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const ramp=createRamp(scene,world,{startPlatform:false,mode}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      const mesh=scene.getObjectByName('loose-cone');assert.ok(mesh,'test course needs generated cones');
      const ownerIndex=Math.round(-mesh.parent!.position.z/RAMP.chunkLength);
      const initial=mesh.getWorldPosition(new THREE.Vector3());
      let target:RAPIER.RigidBody|undefined;
      world.bodies.forEach(body=>{if((body.userData as {knockable?:string})?.knockable==='cone'
        && new THREE.Vector3().copy(body.translation()).distanceTo(initial)<.001)target=body;});
      assert.ok(target);const cone=target;
      player.reset(initial.clone().addScaledVector(ramp.forward,-4));
      const tick=()=>{player.update(dt,idle,tricks.state);world.step();player.sync();assert.equal(player.crashed,false,'cones must not act as hard obstacles');};
      for(let i=0;i<20;i++)tick();
      initial.copy(mesh.getWorldPosition(new THREE.Vector3()));
      const ray=new RAPIER.Ray(initial.clone().addScaledVector(ramp.forward,-.7).addScaledVector(ramp.surfaceNormal,.3),ramp.forward);
      assert.ok(!world.castRay(ray,1.4,true,undefined,undefined,undefined,player.body,isSolidObstacle),'cone was also baked into static scenery');
      player.body.setLinvel(ramp.forward.clone().multiplyScalar(25),true);
      for(let i=0;i<120 && !(cone.userData as {struck:boolean}).struck;i++)tick();
      assert.equal((cone.userData as {struck:boolean}).struck,true,'the rider should hit the cone');
      assert.ok(new THREE.Vector3().copy(cone.linvel()).dot(ramp.forward)>10,'cone should fly ahead');
      assert.ok(new THREE.Vector3().copy(cone.linvel()).dot(ramp.surfaceNormal)>1,'cone should lift off the ground');
      assert.ok(player.speed>20,'plastic cone should not stop the rider');
      for(let i=0;i<25;i++)tick();
      assert.ok(new THREE.Vector3().copy(cone.translation()).distanceTo(initial)>3);
      assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().copy(cone.translation()))<1e-4,'visible cone must follow physics');
      // Retiring the owner chunk also retires cones, even if they have flown elsewhere.
      const handle=cone.handle;
      const steps=ownerIndex+RAMP.chunksBehind+1-Math.round(ramp.distance/RAMP.chunkLength);
      for(let i=0;i<steps;i++){ramp.prepareNextChunk();ramp.scroll(RAMP.chunkLength);ramp.flushDeferredDestroy(Infinity);}
      assert.ok(world.getRigidBody(handle)===null,'old thrown cone should be destroyed with its chunk');
      assert.ok(world.bodies.len()<(RAMP.chunksAhead+RAMP.chunksBehind+RAMP.prepareLead+4)*7+1,'prop count must remain bounded');
    } finally {world.free();}
  });
}
