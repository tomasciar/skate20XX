import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {populateDistrict} from '../src/world/districts.ts';
import {districtAt,DISTRICTS,seededRandom,CHUNK_LENGTH} from '../src/world/generation.ts';
import {makeCityBuilding,makeCityHydrant,makeCityBin,makeParkingMeter} from '../src/world/environments/cityProps.ts';
import {bakeSceneryCollision} from '../src/world/collision.ts';
import {createRamp} from '../src/world/ramp.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {steerAlongCourse} from '../scripts/driveCourse.ts';
import type {PlayerIntent} from '../src/player/controller.ts';
import {createWorldAppearance} from '../src/world/appearance.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});

test('downtown starts at 210 m and each selection cycle visits the whole environment catalog',()=>{
  assert.equal(districtAt(0).district,'grove');assert.equal(districtAt(2).district,'grove');
  assert.deepEqual(districtAt(3),{district:'city',start:3,offset:0});
  for(let i=3;i<7;i++)assert.equal(districtAt(i).district,'city');
  const runs:string[]=[];
  for(let i=0;i<1000;i++)if(districtAt(i).offset===0)runs.push(districtAt(i).district);
  for(let i=0;i+DISTRICTS.length<=runs.length;i+=DISTRICTS.length) {
    assert.equal(new Set(runs.slice(i,i+DISTRICTS.length)).size,DISTRICTS.length);
  }
});

test('city frontages face the street, leave sidewalks clear, and keep scenery complexity bounded',()=>{
  for(let index=0;index<20;index++) {
    const root=new THREE.Group(),frontages:{x:number;along:number;width:number}[]=[],materials=new Set<THREE.Material>();
    let props=0,triangles=0,towers=0;
    for(const _ of populateDistrict({district:'city',index,entering:index===0,rng:seededRandom(index*7919+3),plant:(object,x,along,yaw=0)=>{
      props++;
      if(object.userData.frontage) {
        frontages.push({x,along,width:object.userData.width});
        const facing=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
        assert.ok(facing.x*Math.sign(x)<-0.99);
      }
      if(object.userData.cityKind==='tower')towers++;
      if(Math.abs(x)!==9) {
        const bounds=new THREE.Box3().setFromObject(object).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
        assert.ok(Math.min(Math.abs(x+bounds.min.x),Math.abs(x+bounds.max.x))>11.4,'city props must leave the existing sidewalk clear');
      }
      object.position.set(x,0,-along);object.rotation.y=yaw;root.add(object);
      object.traverse(child=>{
        if(child instanceof THREE.Mesh) {
          triangles+=(child.geometry.index?.count ?? child.geometry.getAttribute('position').count)/3;
          materials.add(child.material as THREE.Material);
        }
      });
    }})){void _;}
    assert.equal(frontages.length,5);assert.equal(towers,4);
    for(const a of frontages)for(const b of frontages)if(a!==b && a.x===b.x)assert.ok(Math.abs(a.along-b.along)>(a.width+b.width)/2);
    assert.ok(props>=40 && props<=60);
    assert.ok(triangles<16000,`city render geometry grew to ${triangles} triangles`);
    assert.ok(materials.size<=40,'materials must be shared across windows and buildings');
    assert.ok(bakeSceneryCollision(root)!.indices.length/3<12000,'facade decoration should not inflate collision');
  }
});

test('city buildings and street furniture have solid collision at their visible supporting surfaces',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),root=new THREE.Group(),props:THREE.Object3D[]=[];
  for(const style of ['apartment','office','shop','tower'] as const)for(let seed=0;seed<4;seed++)props.push(makeCityBuilding(seededRandom(seed),style));
  props.push(makeCityHydrant(),makeCityBin(),makeParkingMeter());
  props.forEach((prop,index)=>{prop.position.x=index*30;root.add(prop);});
  const baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();root.updateMatrixWorld(true);
  try {
    for(let i=0;i<props.length;i++) {
      const origin=new THREE.Vector3(i*30,80,0),direction=new THREE.Vector3(0,-1,0);
      const visible=new THREE.Raycaster(origin,direction).intersectObject(props[i]!,true)[0];
      const physical=world.castRay(new RAPIER.Ray(origin,direction),90,true);
      assert.ok(visible && physical);assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<0.002);
      if(props[i]!.userData.frontage!==undefined) {
        const height=new THREE.Box3().setFromObject(props[i]!).max.y;
        assert.ok(height>6 && height<46);
      }
    }
    assert.ok(baked.meshCount<props.reduce((count,prop)=>{prop.traverse(child=>{if(child instanceof THREE.Mesh)count++;});return count;},0),'window and sign decoration should share the solid shell collision');
  } finally {world.free();}
});

test('city glazing has wall clearance and keeps its depth bias in both seasons',()=>{
  const appearance=createWorldAppearance('winter');let windows=0;
  for(const style of ['apartment','office','tower'] as const) {
    const root=makeCityBuilding(seededRandom(42),style);root.updateMatrixWorld(true);
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh) || object.userData.variantPart!=='window')return;
      windows++;
      const origin=object.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(0,0,-1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
      const backing=new THREE.Raycaster(origin,direction,0.001,0.1).intersectObject(root,true).find(hit=>hit.object.userData.collision!==false);
      assert.ok(backing);assert.ok(backing.distance>0.039 && backing.distance<0.051,'windows must sit consistently ahead of their backing wall');
      const source=object.material as THREE.MeshStandardMaterial,winter=appearance.materialFor(source);
      assert.equal(source.polygonOffset,true);assert.ok(source.polygonOffsetUnits<=-2);
      assert.equal(winter.polygonOffset,true);assert.equal(winter.polygonOffsetUnits,source.polygonOffsetUnits);
    });
  }
  assert.ok(windows>100,'check glazing on both street frontages and skyline towers');
});

test('the city downhill line remains rideable in both skate and snowboard modes',async()=>{
  await RAPIER.init();
  const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
    wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      player.body.setTranslation(ramp.anchor.clone().addScaledVector(ramp.forward,195).addScaledVector(ramp.surfaceNormal,0.2),true);
      player.body.setLinvel(ramp.forward.clone().multiplyScalar(45),true);world.step();player.sync(false);
      let passed=false,inCity=false;
      for(let i=0;i<1200;i++) {
        player.update(dt,{...idle,steer:steerAlongCourse(player,ramp)},tricks.state);
        world.step();player.sync(false);ramp.prepareNextChunk(1);
        const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
        assert.equal(player.crashed,false,`${mode}: ${player.crashCause} at ${along.toFixed(1)} m`);
        if(districtAt(Math.floor(along/CHUNK_LENGTH)).district==='city')inCity=true;
        if(along>500){passed=true;break;}
      }
      assert.ok(inCity && passed,`${mode} must ride through the complete opening city section`);
      assert.ok(world.colliders.len()<=16,'the city must use the existing bounded collision window');
    } finally {world.free();}
  }
});
