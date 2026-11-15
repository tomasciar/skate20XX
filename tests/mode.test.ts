import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createWorldAppearance,surface} from '../src/world/appearance.ts';
import {createRamp} from '../src/world/ramp.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {createTrickSystem} from '../src/player/tricks.ts';
import {GRABS} from '../src/player/grabs.ts';
import {BOARD,WHEEL_BOTTOM} from '../src/player/dimensions.ts';
import {applyRideSkin} from '../src/mode.ts';
import type {RideMode} from '../src/mode.ts';
import type {PlayerIntent} from '../src/player/controller.ts';
const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});
const dt=1/120;
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
const base={dt,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,
  wheelRoll:0,boardSpin:{x:0,y:0,z:0}};

test('winter materials are reversible, cached per world, and keep geometry and source palettes intact',()=>{
  const appearance=createWorldAppearance(),root=new THREE.Group();
  const material=surface(new THREE.MeshStandardMaterial({color:0x345678}),'road'),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);
  root.add(mesh);appearance.bind(mesh,material);const geometry=mesh.geometry;
  appearance.setSeason('winter',root);const winter=mesh.material;
  assert.notEqual(winter,material);assert.equal(mesh.geometry,geometry);assert.equal(material.color.getHex(),0x345678);
  assert.ok((winter as THREE.MeshStandardMaterial).map instanceof THREE.CanvasTexture);
  const streamed=new THREE.Mesh(geometry,material);root.add(streamed);appearance.bind(streamed,material);assert.equal(streamed.material,winter);
  for(let i=0;i<5;i++) {
    appearance.setSeason('summer',root);assert.equal(mesh.material,material);
    appearance.setSeason('winter',root);assert.equal(mesh.material,winter);
  }
  const other=createWorldAppearance();assert.equal(other.materialFor(material),material,'a winter world must not recolor a separate skate world');
  const sign=surface(new THREE.MeshStandardMaterial(),'scenery');sign.userData.perChunk=true;
  assert.equal(appearance.materialFor(sign),sign,'streamed sign textures must retain their existing ownership and cleanup');
});

test('snow caps use the real standard shader normal and diffuse hooks while preserving visible obstacle colors',()=>{
  const appearance=createWorldAppearance('winter');
  const source=surface(new THREE.MeshStandardMaterial({color:0x335522}),'scenery');
  const material=appearance.materialFor(source);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader as never,{} as never);
  assert.ok(shader.vertexShader.includes('vSnowUp = normalize(mat3(modelMatrix) * objectNormal).y'));
  assert.ok(shader.fragmentShader.includes('float snowCover = smoothstep'));
  assert.ok(shader.fragmentShader.includes('#include <color_fragment>'));
  const rail=new THREE.MeshStandardMaterial({color:0xffc43d});assert.equal(appearance.materialFor(rail),rail);
});

test('snowboard skin swaps wheels for a twin-tip board, winter clothes and boots, including crash clones',()=>{
  const visual=createSkaterVisual();
  const visible=(object:THREE.Object3D)=>{for(let at:THREE.Object3D|null=object;at;at=at.parent)if(!at.visible)return false;return true;};
  assert.ok(visual.wheels.every(visible));visual.setMode('snowboard');visual.setPose(base);visual.root.updateMatrixWorld(true);
  assert.ok(visual.wheels.every(wheel=>!visible(wheel)));
  const snowboard=visual.root.getObjectByName('snowboard')!;assert.ok(visible(snowboard));
  const bounds=new THREE.Box3().setFromObject(snowboard);
  assert.ok(bounds.max.z-bounds.min.z>1.2);assert.ok(Math.abs(bounds.min.y-WHEEL_BOTTOM)<1e-6);
  const clone=visual.root.getObjectByName('foot-1')!.clone(true),scene=new THREE.Scene();scene.add(visual.root,clone);
  const winterBoot=clone.children.find(object=>object.userData.rideSkin==='snowboard')!;assert.equal(winterBoot.visible,true);
  visual.setMode('skate');applyRideSkin(scene,'skate');assert.equal(winterBoot.visible,false);
  assert.ok(visual.wheels.every(visible));assert.equal(snowboard.visible,false);
});

test('snowboard soles follow the existing grabs, carves and manuals and its base stays on the snow',()=>{
  for(const carve of [-1,0,1])for(const manual of [-1,0,1]) {
    const visual=createSkaterVisual('snowboard');
    for(let i=0;i<150;i++)visual.setPose({...base,carve,groundTrick:manual?{name:'Manual',manual,grab:null}:null});
    visual.root.updateMatrixWorld(true);
    for(const side of [-1,1]) {
      const foot=visual.root.getObjectByName(`foot-${side}`)!;
      const sole=visual.deck.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
      assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6);
    }
    const bounds=new THREE.Box3().setFromObject(visual.root.getObjectByName('snowboard')!,true);
    assert.ok(bounds.min.y>=WHEEL_BOTTOM-0.003,`snowboard dug into snow: ${bounds.min.y}`);
    assert.ok(bounds.min.y<WHEEL_BOTTOM+0.006,'supporting edge should remain on the surface');
  }
  const visual=createSkaterVisual('snowboard');
  for(const grab of [GRABS.tomahawk,GRABS.pushout,GRABS.nosebone,GRABS.tailbone]) {
    for(let i=0;i<150;i++)visual.setPose({...base,airborne:true,grab});
    visual.root.updateMatrixWorld(true);
    for(const side of [-1,1]) {
      const foot=visual.root.getObjectByName(`foot-${side}`)!;
      assert.ok(Math.abs(visual.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0))).y-BOARD.gripY)<1e-6);
    }
  }
});

test('switching skins during a run keeps collisions, momentum and deterministic physics identical',async()=>{
  await RAPIER.init();
  const fixture=(mode:RideMode)=>{
    const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const ramp=createRamp(scene,world,{startPlatform:false,mode}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    return {world,scene,ramp,player,tricks};
  };
  const skate=fixture('skate'),snow=fixture('snowboard');
  try {
    const colliders=skate.world.colliders.len();
    for(let i=0;i<450;i++) {
      if(i===180) {skate.ramp.setMode!('snowboard');skate.player.setMode('snowboard');snow.ramp.setMode!('skate');snow.player.setMode('skate');}
      const intent={...idle,push:i<100?1:i<145?-1:0,steer:i===155?1:0,wantOllie:i===220,olliePower:0.5};
      for(const f of [skate,snow]) {f.player.update(dt,intent,f.tricks.state);f.world.step();f.player.sync(false);}
      assert.ok(skate.player.position.distanceTo(snow.player.position)<1e-6,`mode changed trajectory at ${i}`);
      assert.ok(skate.player.velocity.distanceTo(snow.player.velocity)<1e-6);
      assert.equal(skate.player.grounded,snow.player.grounded);assert.equal(skate.player.ollieCount,snow.player.ollieCount);
      assert.equal(skate.world.colliders.len(),colliders);assert.equal(snow.world.colliders.len(),colliders);
    }
    assert.ok(skate.player.position.distanceTo(skate.ramp.spawn)>3);
    assert.equal(skate.player.crashed,false);assert.equal(snow.player.crashed,false);
    const world=skate.world,position=skate.player.position.clone();
    skate.ramp.prepareNextChunk(0);skate.ramp.setMode!('skate');
    while(!skate.ramp.prepareNextChunk(Infinity)){}
    assert.ok(skate.player.position.distanceTo(position)<1e-6);assert.equal(world.colliders.len(),colliders);
  } finally {skate.world.free();snow.world.free();}
});

test('winter scenery follows incremental streaming and switching back restores asphalt and lighting',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode:'snowboard'});
  try {
    ramp.scroll(70);ramp.prepareNextChunk(0);
    const preparing=ramp.mesh.children.find(chunk=>!chunk.visible);assert.ok(preparing,'fixture must exercise an unfinished streamed chunk');
    ramp.setMode!('skate');ramp.setMode!('snowboard');
    while(!ramp.prepareNextChunk(Infinity)){}
    assert.equal(preparing.visible,true);
    let snowCaps=0,roads=0;
    preparing.traverse(object=>{
      if(!(object instanceof THREE.Mesh) || Array.isArray(object.material))return;
      const material=object.material as THREE.MeshStandardMaterial,role=material.userData.surface;
      if(role==='road'){roads++;assert.equal(material.map!.image.width,512);}
      if(role==='scenery' || role==='terrain' || role==='path' || role==='barrier') {
        assert.ok(material.customProgramCacheKey().endsWith('|snow-coating-v1'));snowCaps++;
      }
    });
    assert.ok(roads>0 && snowCaps>5);
    assert.equal((scene.fog as THREE.Fog).color.getHex(),0xc6dce9);
    const colliders=world.colliders.len();ramp.setMode!('skate');
    assert.equal(world.colliders.len(),colliders);assert.equal(ramp.distance,70);
    assert.equal((scene.fog as THREE.Fog).color.getHex(),0x8ebfd4);
    preparing.traverse(object=>{
      if(object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.userData.surface==='road') {
        assert.equal((object.material as THREE.MeshStandardMaterial).map!.image.width,1024);
      }
    });
  } finally {world.free();}
});
