import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {BOARD_STYLES,BOARD_STYLE_STORAGE_KEY,applyBoardStyle,boardTexture,boardStyle,loadBoardStyle,saveBoardStyle} from '../src/boards.ts';
import {createBoardControls} from '../src/ui/boards.ts';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {CHARACTERS} from '../src/characters.ts';
import {BOARD} from '../src/player/dimensions.ts';
import {GRABS} from '../src/player/tricks/grabs.ts';
import type {RampWorld} from '../src/world/ramp.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

const dt=1/120,pose={dt,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('board design preferences validate stored values and stay independent of character and riding mode',()=>{
  const values=new Map<string,string>([['skate5.character','girl'],['skate5.rideMode','snowboard']]);
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadBoardStyle(storage),'classic');
  for(const {id} of BOARD_STYLES){saveBoardStyle(id,storage);assert.equal(loadBoardStyle(storage),id);}
  assert.equal(values.get('skate5.character'),'girl');assert.equal(values.get('skate5.rideMode'),'snowboard');
  values.set(BOARD_STYLE_STORAGE_KEY,'missing');assert.equal(loadBoardStyle(storage),'classic');
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(loadBoardStyle(blocked),'classic');assert.doesNotThrow(()=>saveBoardStyle('neon',blocked));
});

test('board selector saves valid changes once, updates its swatch and gives keyboard focus back',()=>{
  class Select extends EventTarget {
    value='';title='';options:{value:string;textContent:string}[]=[];blurs=0;
    replaceChildren(...options:{value:string;textContent:string}[]){this.options=options;}
    blur(){this.blurs++;}
  }
  const select=new Select(),swatch={style:{background:''}},changes:string[]=[],values=new Map<string,string>();
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{getElementById:(id:string)=>id==='board-select'?select:swatch,createElement:()=>({value:'',textContent:''})}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  try {
    const controls=createBoardControls('sakura',style=>changes.push(style));
    assert.equal(select.value,'sakura');assert.equal(select.options.length,BOARD_STYLES.length);assert.ok(swatch.style.background.includes('#db7097'));
    select.value='stunt';select.dispatchEvent(new Event('change'));assert.deepEqual(changes,['stunt']);assert.equal(loadBoardStyle(),'stunt');
    assert.equal(select.title,boardStyle('stunt').description);assert.ok(swatch.style.background.includes('#dc3c36'));
    select.dispatchEvent(new Event('change'));assert.equal(changes.length,1);
    select.value='invalid';select.dispatchEvent(new Event('change'));assert.equal(select.value,'stunt');assert.equal(changes.length,1);assert.equal(select.blurs,3);
    controls.dispose();select.value='neon';select.dispatchEvent(new Event('change'));assert.equal(changes.length,1);
  } finally {
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});

test('every design graphic is distinct, bounded in size, opaque and reused across updates',()=>{
  const graphics=new Set<string>(),grips=new Set<string>();let bytes=0;
  for(const {id} of BOARD_STYLES)for(const grip of [false,true]) {
    const texture=boardTexture(id,grip),image=texture.image;
    assert.equal(texture,boardTexture(id,grip));assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
    assert.equal(image.width,128);assert.equal(image.height,512);assert.equal(image.data.length,128*512*4);
    assert.ok(texture.generateMipmaps);assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);
    for(let i=3;i<image.data.length;i+=4)assert.equal(image.data[i],255);
    const signature=Buffer.from(image.data).toString('base64');(grip?grips:graphics).add(signature);bytes+=image.data.byteLength;
  }
  assert.equal(graphics.size,BOARD_STYLES.length);assert.equal(grips.size,BOARD_STYLES.length);assert.ok(bytes<=BOARD_STYLES.length*512*1024);
});

test('design swaps reuse meshes and materials and preserve every rider, mode, grab and planted sole',()=>{
  for(const {id:character} of CHARACTERS) {
    const visual=createSkaterVisual('skate',character),meshes=new Set<THREE.Object3D>(),materials=new Set<THREE.Material>();
    visual.root.traverse(object=>{if(object instanceof THREE.Mesh){meshes.add(object);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
    for(const mode of ['skate','snowboard'] as const)for(const {id} of BOARD_STYLES) {
      visual.setMode(mode);visual.setBoardStyle(id);assert.equal(visual.boardStyle,id);assert.equal(visual.character,character);
      for(let i=0;i<30;i++)visual.setPose({...pose,airborne:true,grab:GRABS.pushout});
      visual.root.updateMatrixWorld(true);
      for(const side of [-1,1]) {
        const foot=visual.root.getObjectByName(`foot-${side}`)!;
        const sole=visual.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
        assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6);
      }
      visual.root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;assert.ok(meshes.has(object));
        for(const source of Array.isArray(object.material)?object.material:[object.material]) {
          assert.ok(materials.has(source));const material=source as THREE.MeshStandardMaterial,role=material.userData.boardSurface;
          if(!role)continue;assert.equal(material.userData.boardStyle,id);
          if(role==='graphic'||role==='grip')assert.equal(material.map,boardTexture(id,role==='grip'));
          if(role==='wheel')assert.equal(material.color.getHex(),boardStyle(id).wheels);
        }
      });
    }
    const clone=visual.board.clone(true);applyBoardStyle(clone,'classic');
    clone.traverse(object=>{if(object instanceof THREE.Mesh && object.material.userData.boardSurface)assert.equal(object.material.userData.boardStyle,'classic');});
  }
});

test('Nimbus swaps the deck, trucks and wheels for a cloud in both modes, and other designs bring them back',()=>{
  const visual=createSkaterVisual('skate','goku'),visible=(name:'nimbus'|'hardware')=>{
    const found:boolean[]=[];visual.root.traverse(object=>{if(object.userData.boardShape===name){let shown=true;for(let o:THREE.Object3D|null=object;o;o=o.parent)shown&&=o.visible;found.push(shown);}});
    assert.ok(found.length>0);return found.every(Boolean)?true:found.some(Boolean)?'mixed':false;
  };
  assert.equal(visible('nimbus'),false);assert.equal(visible('hardware'),true);
  for(const mode of ['skate','snowboard','skate'] as const) {
    visual.setBoardStyle('nimbus');visual.setMode(mode);
    assert.equal(visible('nimbus'),true);assert.equal(visible('hardware'),false);
    visual.setBoardStyle('dragon');assert.equal(visible('nimbus'),false);assert.equal(visible('hardware'),true);
  }
  visual.setBoardStyle('nimbus');const cloud=visual.root.getObjectByName('nimbus')!,box=new THREE.Box3();
  for(const speed of [0,80])for(const travelSide of [1,-1])for(let i=0;i<240;i++)visual.setPose({...pose,speed,travelSide});
  visual.resetPose();visual.root.updateMatrixWorld(true);box.setFromObject(cloud);visual.board.worldToLocal(box.min);visual.board.worldToLocal(box.max);
  // The rider stands in the cloud and its belly rests where the wheels touch the ground.
  assert.ok(box.max.y>BOARD.gripY && box.max.y<BOARD.gripY+0.05);assert.ok(Math.abs(Math.min(box.min.y,box.max.y)-(BOARD.wheelY-BOARD.wheelRadius))<0.01);
});

async function fixture() {
  await RAPIER.init();
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1,-400));world.createCollider(RAPIER.ColliderDesc.cuboid(50,0.1,500),ground);
  const anchor=new THREE.Vector3(),ramp:RampWorld={mesh:new THREE.Group(),spawn:new THREE.Vector3(0,0.02,0),anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(scene,world,ramp,'skate','goku','dragon'),tricks=createTrickSystem();
  const tick=()=>{player.update(dt,idle,tricks.state);world.step();player.sync(false);};for(let i=0;i<90;i++)tick();
  return {scene,world,player,tricks,tick,ramp};
}

test('live design changes keep momentum and physics identical, persist through resets and update crash boot straps',async()=>{
  const control=await fixture(),subject=await fixture();
  try {
    const bodies=subject.world.bodies.len(),colliders=subject.world.colliders.len(),resets=subject.player.resetCount;
    for(const f of [control,subject])f.player.body.setLinvel({x:0,y:0,z:-25},true);
    for(let i=0;i<150;i++) {
      if(i%15===0)subject.player.setBoardStyle(BOARD_STYLES[Math.floor(i/15)%BOARD_STYLES.length]!.id);
      if(i===75)for(const f of [control,subject])f.player.setMode('snowboard');
      control.tick();subject.tick();
      assert.ok(subject.player.position.distanceTo(control.player.position)<1e-6);assert.ok(subject.player.velocity.distanceTo(control.player.velocity)<1e-6);
      assert.equal(subject.world.bodies.len(),bodies);assert.equal(subject.world.colliders.len(),colliders);assert.equal(subject.player.resetCount,resets);
    }
    subject.tricks.state.bail=true;subject.tick();assert.ok(subject.player.crashed);
    const crash=subject.scene.getObjectByName('crash-ragdoll')!;assert.ok(crash);
    subject.player.setBoardStyle('stunt');assert.equal(subject.player.boardStyle,'stunt');assert.equal(subject.player.character,'goku');
    let straps=0;crash.traverse(object=>{if(object instanceof THREE.Mesh && object.material.userData.boardSurface==='accent'){straps++;assert.equal(object.material.color.getHex(),boardStyle('stunt').accent);}});
    assert.ok(straps>0);subject.player.reset(subject.ramp.spawn);assert.equal(subject.player.boardStyle,'stunt');
  } finally {control.world.free();subject.world.free();}
});
