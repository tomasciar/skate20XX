import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {applyCharacterSkin} from '../src/characters.ts';
import {GRABS} from '../src/player/tricks/grabs.ts';
import {BOARD} from '../src/player/dimensions.ts';
import {createRagdoll} from '../src/player/movement/ragdoll.ts';
import {CHARACTERS} from '../src/characters.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const pose={dt:1/60,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};

test('Triple T uses the short display name while preserving its model identity',()=>{
  const info=CHARACTERS.find(c=>c.id==='sahur')!;
  assert.equal(info.name,'Triple T');assert.ok('modelName' in info);assert.equal(info.modelName,'Tung Tung Tung Sahur');
});

test('the bat angles clear of the log without moving the wrist grip',()=>{
  const v=createSkaterVisual('skate','sahur');for(let i=0;i<100;i++)v.setPose(pose);
  v.root.updateMatrixWorld(true);
  const bat=v.root.getObjectByName('character-bat-sahur')!,torso=v.root.getObjectByName('chest')!.parent!;
  assert.ok(bat.position.distanceTo(new THREE.Vector3(-.022,.034,.007))<1e-10);
  for(let y=.18;y<=.54;y+=.015) {
    const p=torso.worldToLocal(bat.localToWorld(new THREE.Vector3(0,y,0)));
    if(p.y>.02&&p.y<.8)assert.ok(Math.hypot(p.x,p.z)-.143-.030>.01,'the barrel must clear the log');
  }
});

test('wooden joints remain joined through carves, pushes, manuals, grabs, flips and spins',()=>{
  type Pose=Parameters<ReturnType<typeof createSkaterVisual>['setPose']>[0];
  const cases:Partial<Pose>[]=[{}, {crouch:1},{speed:4,push:1},{lean:1,carve:1},{lean:-1,carve:-1},{slide:1},
    {groundTrick:{name:'Manual',manual:1,grab:null}},{groundTrick:{name:'Nose manual',manual:-1,grab:null}},
    ...Object.values(GRABS).map(grab=>({airborne:true,grab})),
    ...[[1,0],[-1,0],[0,1],[0,-1],[.7,.7]].map(([pitch,roll])=>({airborne:true,flipLean:{pitch,roll},rotationRate:{yaw:1,pitch,roll}}))];
  const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)];
  for(const mode of ['skate','snowboard'] as const) {
    const v=createSkaterVisual(mode,'sahur');
    const world=(name:string,y=0)=>v.root.getObjectByName(name)!.localToWorld(new THREE.Vector3(0,y,0));
    for(const change of cases)for(let frame=0;frame<25;frame++) {
      v.setPose({...pose,...change});v.root.updateMatrixWorld(true);
      const connector=v.root.getObjectByName('character-hips-sahur')!;
      for(const side of [-1,1]) {
        const elbow=world(`elbow-${side}`),knee=world(`knee-${side}`),wrist=world(`hand-${side}`);
        assert.ok(world(`upper-arm-${side}`,.5).distanceTo(elbow)<1e-6);
        assert.ok(world(`upper-arm-${side}`,-.5).distanceTo(world(`shoulder-${side}`))<1e-6);
        assert.ok(world(`forearm-${side}`,-.5).distanceTo(elbow)<1e-6);
        assert.ok(world(`forearm-${side}`,.5).distanceTo(wrist)<1e-6);
        assert.ok(world(`thigh-${side}`,.5).distanceTo(knee)<1e-6);
        assert.ok(world(`shin-${side}`,-.5).distanceTo(knee)<1e-6);
        assert.ok(world(`shin-${side}`,.5).distanceTo(world(`foot-${side}`,.06))<1e-6);
        if(frame===24)for(const axis of axes)for(const sign of [-1,1]) {
          const hip=world(`thigh-${side}`,-.5),outward=axis.clone().multiplyScalar(sign);
          const hit=new THREE.Raycaster(hip.clone().addScaledVector(outward,.35),outward.negate(),0,.7).intersectObject(connector,true)[0];
          assert.ok(hit&&hit.distance<.35,'the leg root must stay inside the wooden hip connector');
        }
      }
      const neck=v.root.getObjectByName('chest')!.worldToLocal(world('head',-.08));
      const chest=v.root.getObjectByName('chest') as THREE.Mesh;chest.geometry.computeBoundingBox();
      assert.ok(chest.geometry.boundingBox!.containsPoint(neck),'the moving head must overlap the trunk');
    }
  }
});

test('Sahur geometry and grain are cached, with ordinary limbs/materials/footwear restored on selection changes',()=>{
  const v=createSkaterVisual('skate','boy');
  const names=['chest','upper-arm-1','forearm-1','thigh-1','shin-1','hand-1'];
  const meshes=names.map(name=>v.root.getObjectByName(name) as THREE.Mesh);
  const original=meshes.map(mesh=>mesh.geometry);
  v.setCharacter('sahur');
  const wood=meshes.map(mesh=>mesh.geometry);
  for(const [i,mesh] of meshes.entries()) {
    assert.notEqual(mesh.geometry,original[i]);assert.equal(mesh.material.vertexColors,true);
    const colors=mesh.geometry.getAttribute('color');assert.ok(colors);
    const shades=new Set(Array.from(colors.array));assert.ok(shades.size>12,'grain needs real variation');
  }
  assert.equal(v.root.getObjectByName('pelvis')!.visible,false);
  assert.equal(v.root.getObjectByName('sleeve-1')!.visible,false);
  const foot=v.root.getObjectByName('foot-1')!;
  assert.ok(foot.children.filter(o=>o instanceof THREE.Mesh).every(o=>!o.visible));
  v.setMode('snowboard');v.setCharacter('boy');
  for(const [i,mesh] of meshes.entries()){assert.equal(mesh.geometry,original[i]);assert.equal(mesh.material.vertexColors,false);}
  assert.equal(v.root.getObjectByName('pelvis')!.visible,true);assert.equal(v.root.getObjectByName('sleeve-1')!.visible,true);
  assert.ok(foot.children.filter(o=>o instanceof THREE.Mesh).every(o=>o.visible));
  v.setCharacter('sahur');
  meshes.forEach((mesh,i)=>assert.equal(mesh.geometry,wood[i]));
});

test('Sahur has a closed log crown and exact bare-foot contact throughout grabs and manuals in both modes',()=>{
  for(const mode of ['skate','snowboard'] as const) {
    const v=createSkaterVisual(mode,'sahur');
    const head=v.root.getObjectByName('character-head-sahur')!.clone();head.updateMatrixWorld(true);
    const crown=new THREE.Raycaster(new THREE.Vector3(.0005,.5,0),new THREE.Vector3(0,-1,0)).intersectObject(head,true)[0];
    assert.ok(crown && crown.point.y>.28,'the end-grain cap must close the log');
    for(const side of [-1,1]) {
      const foot=v.root.getObjectByName(`foot-${side}`)!.getObjectByName('character-shoe-sahur') as THREE.Group;
      const geometry=(foot.children[0] as THREE.Mesh).geometry;geometry.computeBoundingBox();
      assert.ok(Math.abs(geometry.boundingBox!.min.y-BOARD.soleBottom)<1e-7);
    }
    for(const grab of [undefined,...Object.values(GRABS)]) {
      for(let i=0;i<50;i++)v.setPose({...pose,airborne:!!grab,grab});
      v.root.updateMatrixWorld(true);
      for(const side of [-1,1]) {
        const foot=v.root.getObjectByName(`foot-${side}`)!;
        const sole=v.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
        assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6);
      }
    }
    for(const manual of [-1,1]) {
      for(let i=0;i<50;i++)v.setPose({...pose,groundTrick:{name:'Manual',manual,grab:null}});
      for(const side of [-1,1])assert.ok(Number.isFinite(v.root.getObjectByName(`knee-${side}`)!.position.y));
    }
  }
});

test('Sahur captures the right-hand bat and fitted log colliders, and retains custom anatomy when ragdoll skin is reapplied',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0}),scene=new THREE.Scene(),ragdoll=createRagdoll(scene,world);
  try {
    const v=createSkaterVisual('skate','sahur');for(let i=0;i<80;i++)v.setPose(pose);
    const rig=v.captureRagdoll();assert.equal(rig.parts.length,15);assert.equal(rig.joints.length,14);
    const head=rig.parts.find(p=>p.id==='head')!.shape;assert.equal(head.kind,'capsule');
    if(head.kind==='capsule')assert.ok(head.radius>.14&&head.length>.12);
    const bat=v.root.getObjectByName('character-bat-sahur')!;
    assert.equal(bat.parent,v.root.getObjectByName('hand-1'));
    assert.ok(rig.parts.find(p=>p.id==='hand1')!.objects.some(o=>o.getObjectByName(bat.name)===bat));
    ragdoll.start(rig,new THREE.Vector3(1,2,-5),new THREE.Vector3(0,1,0));
    const chest=ragdoll.root.getObjectByName('chest')!;
    const before=chest.scale.clone();applyCharacterSkin(ragdoll.root,'sahur');assert.ok(chest.scale.distanceTo(before)<1e-9);
    assert.equal(ragdoll.root.getObjectByName('pelvis')!.visible,false);
    for(let i=0;i<45;i++){world.step();ragdoll.sync();}ragdoll.render(1);
    assert.ok(Number.isFinite(ragdoll.focus.x)&&Number.isFinite(ragdoll.focus.y));
    applyCharacterSkin(ragdoll.root,'boy');
    assert.equal(ragdoll.root.getObjectByName('character-bat-sahur')!.visible,false);
    assert.equal((ragdoll.root.getObjectByName('upper-arm-1') as THREE.Mesh).geometry.userData.characterOverride,undefined);
    assert.equal(ragdoll.root.getObjectByName('pelvis')!.visible,true);
  } finally {ragdoll.clear();world.free();}
});
