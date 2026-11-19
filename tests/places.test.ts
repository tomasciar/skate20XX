import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {placeAt,placesForChunk,placeRouteX,placeGrading,placeExclusions} from '../src/world/planning/places.ts';
import {makeShopSign} from '../src/world/props/city.ts';
import {makePlaceFurnishings} from '../src/world/structures/placeFurnishings.ts';
import {LANDMARK_MATERIALS,landmarkPart} from '../src/world/structures/parts.ts';
import {prepareArchitectureFinish,writeArchitectureUV} from '../src/world/rendering/architectureFinish.ts';
import {makePlaceMeshes} from '../src/world/structures/places.ts';
import {bakeSceneryCollision} from '../src/world/physics/collision.ts';
import {createWorldAppearance,surface} from '../src/world/rendering/appearance.ts';
import {buildChunkContent} from '../src/world/streaming/chunkBuilder.ts';
import {makeSharedMaterials} from '../src/world/rendering/materials.ts';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {landscapeHeight} from '../src/world/terrain/landscape.ts';
import {courseHeight,courseX} from '../src/world/terrain/course.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const previews=[placeAt(500)!,placeAt(1500)!,placeAt(2100)!];
const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('composed areas have deterministic, varied spacing and chunk ownership over long runs',()=>{
  assert.deepEqual(previews.map(site=>site.kind),['plaza','highrise','yard']);
  const snapshot=()=>Array.from({length:1500},(_,index)=>placesForChunk(index)).flat().filter((site,index,all)=>all.findIndex(other=>other.id===site.id)===index);
  const first=snapshot();
  assert.deepEqual(snapshot(),first,'bounded planning cache eviction must not change generation');
  assert.ok(first.length>20 && first.length<60,'large places should be occasional, not a new dense layer');
  assert.equal(new Set(first.slice(3).map(site=>site.kind)).size,3);
  const gaps=new Set<number>();
  for(let i=0;i<first.length;i++) {
    const site=first[i]!;
    if(i>0) {assert.ok(site.entryStart>=first[i-1]!.exitEnd);gaps.add(site.start-first[i-1]!.start);}
    for(let along=site.entryStart+1;along<site.exitEnd;along+=17) {
      assert.equal(placeAt(along)?.id,site.id);
      assert.ok(placesForChunk(Math.floor(along/RAMP.chunkLength)).some(other=>other.id===site.id));
      assert.equal(placeGrading(site,0,along),0,'composition must leave the main road intact');
    }
    for(let index=Math.floor(site.entryStart/70);index<=Math.floor(site.exitEnd/70);index++) {
      const exclusions=placeExclusions(site,index);
      const start=Math.max(site.entryStart,index*70),end=Math.min(site.exitEnd,(index+1)*70);
      for(let along=start;along<end;along+=2) {
        const x=placeRouteX(site,along);
        assert.ok(exclusions.some(clear=>x>=clear.minX && x<=clear.maxX && along-index*70>=clear.start && along-index*70<=clear.end),'all entrances and returns must reserve space before scenery is built');
      }
    }
  }
  assert.ok(gaps.size>12,'avoid periodic placement of repeated places');
});

test('roof bridges share visible collision, preserve underpasses and reuse seasonal materials',async()=>{
  await RAPIER.init();
  const appearance=createWorldAppearance('winter'),materials=new Set<THREE.Material>();
  for(const site of previews) {
    const along=site.start+(site.kind==='plaza'?90:135),index=Math.floor(along/70),root=new THREE.Group();
    let triangles=0;
    for(const mesh of makePlaceMeshes(index,site)) {
      root.add(mesh);materials.add(mesh.material as THREE.Material);
      triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
      const positions=mesh.geometry.getAttribute('position');
      for(const value of positions.array)assert.ok(Number.isFinite(value));
      const material=mesh.material as THREE.MeshStandardMaterial;
      assert.equal(appearance.materialFor(material),appearance.materialFor(material),'winter variants should be cached');
    }
    assert.ok(triangles<6500,`${site.kind}: keep large silhouettes economical (${triangles} triangles)`);
    const world=new RAPIER.World({x:0,y:0,z:0}),baked=bakeSceneryCollision(root)!;
    world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();root.updateMatrixWorld(true);
    try {
      const x=site.side*(site.kind==='plaza'?64:63),z=-(along-index*70),origin=new THREE.Vector3(x,20,z),direction=new THREE.Vector3(0,-1,0);
      const visible=new THREE.Raycaster(origin,direction).intersectObject(root,true).find(hit=>hit.object.userData.collision!==false);
      const physical=world.castRay(new RAPIER.Ray(origin,direction),25,true);
      assert.ok(visible && physical);assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.002);
      assert.ok(visible.face!.normal.y>.97,'top surfaces must have upward winding on either side of the road');
      if(site.kind!=='plaza') {
        assert.ok(visible.point.y>4,'bridge should meet the elevated roofs');
        const underpass=world.castRay(new RAPIER.Ray({x:site.side*59,y:1.6,z},{x:site.side,y:0,z:0}),8,true);
        assert.equal(underpass,null,'the ground line must remain open beneath the roof bridge');
      }
    } finally {
      world.free();root.traverse(object=>{if(object instanceof THREE.Mesh && !object.geometry.userData.shared)object.geometry.dispose();});
    }
  }
  assert.ok(materials.size<25,'new areas must reuse a small shared material palette');
});

test('added architecture keeps bounded geometry, attached glazing and solid roof furnishings',async()=>{
  await RAPIER.init();
  const firstSign=makeShopSign(2,5),secondSign=makeShopSign(2,8);
  assert.equal(firstSign.material,secondSign.material);assert.equal(firstSign.geometry,secondSign.geometry);
  let endWindows=0;
  for(const site of previews) {
    for(let index=Math.floor(site.start/70);index<=Math.floor(site.end/70);index++) {
      const root=new THREE.Group(),meshes=[...makePlaceMeshes(index,site)];root.add(...meshes);root.updateMatrixWorld(true);
      const triangles=meshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3,0);
      assert.ok(triangles<6500,`${site.kind} chunk ${index} exceeds its geometry budget: ${triangles}`);
      for(const mesh of meshes)if(mesh.name.endsWith('-end-glazing')) {
        endWindows++;
        const origin=mesh.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(0,0,-1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
        const backing=new THREE.Raycaster(origin,direction,.001,.2).intersectObject(root,true).find(hit=>hit.object.userData.collision!==false);
        assert.ok(backing && backing.distance>.06 && backing.distance<.11,'end glazing should stand clear of a solid wall');
        const cornice=meshes.find(other=>other.name===mesh.name.replace('-end-glazing','-cornice'))!;
        assert.ok(new THREE.Box3().setFromObject(mesh,true).max.y<new THREE.Box3().setFromObject(cornice,true).min.y,'windows must stay below the roof');
      }
      const handler=meshes.find(mesh=>mesh.name==='roof-air-handler');
      if(handler) {
        const world=new RAPIER.World({x:0,y:0,z:0}),baked=bakeSceneryCollision(root)!;
        world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
        try {
          const origin=handler.position.clone().add(new THREE.Vector3(site.side*.4,10,0)),direction=new THREE.Vector3(0,-1,0);
          const visible=new THREE.Raycaster(origin,direction).intersectObject(root,true)[0];
          const physical=world.castRay(new RAPIER.Ray(origin,direction),15,true);
          assert.ok(visible && physical && Math.abs(visible.distance-physical.timeOfImpact)<.002,'rooftop equipment must retain visible solid collision');
        } finally {world.free();}
      }
      for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
    }
  }
  assert.ok(endWindows>40,'detail the walls seen on approach and in reverse too');
  assert.equal(firstSign.geometry.userData.shared,true,'streamed details must preserve shared sign geometry');
});

test('parking decks and access banks use the actual road finish, including winter and roof kickers',()=>{
  const map=new THREE.DataTexture(new Uint8Array([90,96,101,255]),1,1),road=surface(new THREE.MeshStandardMaterial({map}),'road');
  const mats=makeSharedMaterials();let surfaces=0,kickers=0;
  for(const index of [21,32]) {
    const root=new THREE.Group();
    for(const _ of buildChunkContent({index,root,angle:RAMP.angleDeg*Math.PI/180,sunOnHill:new THREE.Vector3(-1,2,1).normalize(),asphaltMaterial:road,mats,startPlatform:false,rails:[]})){void _;}
    for(const season of ['summer','winter'] as const) {
      const appearance=createWorldAppearance(season);
      for(const object of root.children)if(object instanceof THREE.Mesh) {
        if(object.name==='place-asphalt') {
          surfaces++;assert.equal(object.material,road,'traffic surfaces must not get the pale paving finish');
          assert.equal(object.userData.sceneryTint,0xffffff);assert.equal(appearance.materialFor(object.material),appearance.materialFor(road));
          const uv=object.geometry.getAttribute('uv');assert.ok(uv && uv.count===object.geometry.getAttribute('position').count);
        }
        if(object.name==='yard-roof-kicker') {
          kickers++;assert.equal((appearance.materialFor(object.material as THREE.Material) as THREE.MeshStandardMaterial).map,(appearance.materialFor(road) as THREE.MeshStandardMaterial).map);
        }
      }
    }
    root.traverse(object=>{if(object instanceof THREE.Mesh && !object.geometry.userData.shared)object.geometry.dispose();});
  }
  assert.ok(surfaces>=8 && kickers===2);
});

test('architectural textures share maps and keep metre-scale UVs without touching source geometry',()=>{
  const material=LANDMARK_MATERIALS.brick,geometry=new THREE.BoxGeometry(2,3,4),sourceUV=geometry.getAttribute('uv').array.slice();
  landmarkPart(geometry,material);const clone=material.clone();prepareArchitectureFinish(clone);
  assert.ok(material.map && material.map.image.width===256);assert.equal(clone.map,material.map);
  assert.equal((createWorldAppearance('winter').materialFor(material) as THREE.MeshStandardMaterial).map,material.map);
  const owned=geometry.clone();writeArchitectureUV(owned,new THREE.Matrix4().makeScale(2,1,1));
  assert.deepEqual(geometry.getAttribute('uv').array,sourceUV);
  const normals=owned.getAttribute('normal'),uv=owned.getAttribute('uv'),u:number[]=[],v:number[]=[];
  for(let i=0;i<normals.count;i++)if(normals.getZ(i)>.9){u.push(uv.getX(i));v.push(uv.getY(i));}
  assert.equal(Math.max(...u)-Math.min(...u),4);assert.equal(Math.max(...v)-Math.min(...v),3);
  geometry.dispose();owned.dispose();
});

test('plaza arches have outward faces, matching collision and an open riding lane beneath',async()=>{
  await RAPIER.init();const site=previews[0]!,along=site.start+125,index=Math.floor(along/70),root=new THREE.Group();
  root.add(...makePlaceFurnishings(index,site));root.updateMatrixWorld(true);
  const arch=root.children.find(object=>object.name==='plaza-stone-arch')!,z=-(along-index*70),x=site.side*63;
  const top=new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(arch)[0];
  const underside=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,1,0)).intersectObject(arch)[0];
  assert.ok(top && underside && top.face!.normal.y>.9 && underside.face!.normal.y<-.9,'both the arch crown and its soffit must face outward');
  const world=new RAPIER.World({x:0,y:0,z:0}),baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
  try {
    const physical=world.castRay(new RAPIER.Ray({x,y:20,z},{x:0,y:-1,z:0}),20,true);
    assert.ok(physical && Math.abs(physical.timeOfImpact-top.distance)<.002);
    assert.equal(world.castRay(new RAPIER.Ray({x,y:4,z:z+3},{x:0,y:0,z:-1}),6,true),null,'the arch must leave real headroom on the riding line');
  } finally {world.free();root.traverse(object=>{if(object instanceof THREE.Mesh && !object.geometry.userData.shared)object.geometry.dispose();});}
});

test('tall street buildings have level floors after course warping, including across chunk seams',()=>{
  const heights:number[]=[];
  const material=new THREE.MeshStandardMaterial(),mats=makeSharedMaterials();
  for(const index of [22,23]) {
    const root=new THREE.Group(),angle=RAMP.angleDeg*Math.PI/180;
    for(const _ of buildChunkContent({index,root,angle,sunOnHill:new THREE.Vector3(-1,2,1).normalize(),asphaltMaterial:material,mats,startPlatform:false,rails:[]})){void _;}
    const hill=new THREE.Group();hill.rotation.x=-angle;hill.add(root);
    root.position.y=courseHeight(index*70);root.position.z=-index*70;hill.updateMatrixWorld(true);
    const cornice=root.children.find(mesh=>mesh.name==='highrise-stepped-tower-cornice') as THREE.Mesh;
    assert.ok(cornice);
    const bounds=new THREE.Box3().setFromObject(cornice,true);
    assert.ok(Math.abs(bounds.max.y-bounds.min.y-.24)<.002,'tower floors must stay horizontal, rather than leaning downhill');
    heights.push(bounds.max.y);
    root.traverse(object=>{if(object instanceof THREE.Mesh && !object.geometry.userData.shared)object.geometry.dispose();});
  }
  assert.ok(Math.abs(heights[0]!-heights[1]!)<.001,'adjacent chunks must agree on the full building anchor');
});

for(const mode of ['skate','snowboard'] as const)test(`all composed routes ride from ground to terraces/roofs and back in ${mode}`,async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
  try {
    for(const site of previews) {
      player.reset(ramp.spawn);
      const start=site.entryStart-3,target=Math.floor(start/70)*70;
      while(ramp.distance<target){ramp.scroll(70);while(!ramp.prepareNextChunk(Infinity)){};}
      scene.updateMatrixWorld(true);
      const x=placeRouteX(site,start),position=new THREE.Vector3(x+courseX(start)-courseX(ramp.distance),landscapeHeight(x,start)-courseHeight(ramp.distance)+.2,-(start-ramp.distance)).applyMatrix4(ramp.mesh.matrixWorld);
      player.body.setTranslation(position,true);player.body.setLinvel({x:0,y:0,z:0},true);
      player.update(dt,idle,tricks.state);world.step();player.sync(false);
      for(let i=0;i<24;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
      player.body.setLinvel(ramp.directionAt!(player.position,new THREE.Vector3()).multiplyScalar(23),true);
      let elevated=0,bridge=false,finished=false;
      for(let i=0;i<4200;i++) {
        const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),look=Math.max(7,player.speed*.32);
        const targetYaw=Math.atan2(-(placeRouteX(site,along+look)-ramp.roadOffset!(player.position)+courseX(along+look)-courseX(along)),look);
        const yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward)),error=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));
        const steer=player.airborne?0:THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1);
        player.update(dt,{...idle,steer},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
        const s=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),offset=ramp.roadOffset!(player.position);
        const local=ramp.mesh.worldToLocal(player.position.clone()),height=local.y-courseHeight(s)+courseHeight(ramp.distance)-.5;
        assert.equal(player.crashed,false,`${mode} ${site.kind}: ${player.crashCause} at ${s.toFixed(2)}, x=${offset.toFixed(2)}, height=${height.toFixed(2)}`);
        if(s>site.start+45 && s<site.end-30 && height>(site.kind==='plaza'?.65:3.8) && !player.airborne)elevated++;
        if(s>site.start+100 && s<site.start+230 && Math.abs(offset)>57 && Math.abs(offset)<69 && height>3.8 && !player.airborne)bridge=true;
        if(s>site.exitEnd+5 && !player.airborne && Math.abs(offset-site.side*12)<12){finished=true;break;}
      }
      assert.ok(elevated>100,`${site.kind}: rider should spend real distance on its elevated line (${elevated} ticks)`);
      if(site.kind!=='plaza')assert.ok(bridge,`${site.kind}: roof-to-roof line should traverse the bridge`);
      assert.ok(finished,`${site.kind}: route must return to rideable ground`);
    }
    let fixed=0;world.colliders.forEach(collider=>{if(collider.parent()?.isFixed())fixed++;});
    assert.ok(fixed<=RAMP.chunksBehind+1+RAMP.chunksAhead+RAMP.prepareLead+3,'large areas must not extend the static collision window');
  } finally {world.free();}
});
