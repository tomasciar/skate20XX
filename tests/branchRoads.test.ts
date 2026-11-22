import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {branchRoadAt,branchRoadsForChunk,branchRoadX,branchRoadExclusions} from '../src/world/planning/branchRoads.ts';
import {makeBranchRoad,branchCrossesSidewalk} from '../src/world/structures/branchRoads.ts';
import {makeBranchFeatures} from '../src/world/structures/branchFeatures.ts';
import {landscapeHeight,makeLandscape} from '../src/world/terrain/landscape.ts';
import {courseHeight,courseX} from '../src/world/terrain/course.ts';
import {bakeSceneryCollision} from '../src/world/physics/collision.ts';
import {buildChunkContent} from '../src/world/streaming/chunkBuilder.ts';
import {makeSharedMaterials} from '../src/world/rendering/materials.ts';
import {RAMP} from '../src/world/config.ts';
import {surface,createWorldAppearance} from '../src/world/rendering/appearance.ts';
import {createRamp} from '../src/world/ramp.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const preview=branchRoadAt(250)!;
const roadMaterial=surface(new THREE.MeshStandardMaterial({color:0x555b5e}),'road'),marking=new THREE.MeshBasicMaterial();
function dispose(root:THREE.Object3D){root.traverse(child=>{if(child instanceof THREE.Mesh&&!child.geometry.userData.shared)child.geometry.dispose();});}

test('wide road forks are deterministic, reconnect at both ends and reserve the whole riding corridor',()=>{
  assert.ok(preview && preview.start<100,'the first alternate road should be available just after dropping in');
  const snapshot=()=>{const roads=new Map();for(let index=0;index<1200;index++)for(const road of branchRoadsForChunk(index))roads.set(road.id,road);return [...roads.values()];};
  const roads=snapshot();assert.deepEqual(snapshot(),roads,'planning cache eviction cannot move roads');
  assert.ok(roads.length>45 && roads.length<100);assert.equal(new Set(roads.map(r=>r.kind)).size,4);
  assert.equal(new Set(roads.map(r=>r.side)).size,2);
  for(const road of roads) {
    assert.ok(road.width>=14 && road.end-road.start>=450);
    assert.ok(Math.abs(branchRoadX(road,road.start))<1e-9 && Math.abs(branchRoadX(road,road.end))<1e-9);
    assert.ok(Math.abs(branchRoadX(road,(road.start+road.end)/2))>90);
    for(let along=road.start;along<road.end;along+=17) {
      const index=Math.floor(along/70),x=branchRoadX(road,along),local=along-index*70;
      assert.ok(branchRoadExclusions(road,index).some(e=>e.minX<x-road.width/2&&e.maxX>x+road.width/2&&e.start<=local&&e.end>=local));
    }
  }
});

test('alternate asphalt matches terrain collision instead of floating above a separate road collider',async()=>{
  await RAPIER.init();
  for(const index of [1,3,5,7]) {
    const root=new THREE.Group(),base=index*70;
    root.add(makeLandscape(index,new THREE.MeshStandardMaterial(),courseHeight(base),courseX(base)));
    const skins=[...makeBranchRoad(index,preview,roadMaterial,marking)];
    for(const mesh of skins) {
      const p=mesh.geometry.getAttribute('position');
      for(let i=0;i<p.count;i++) {
        const along=base-p.getZ(i);p.setXYZ(i,p.getX(i)+courseX(along)-courseX(base),p.getY(i)+courseHeight(along)-courseHeight(base),p.getZ(i));
      }
      mesh.geometry.computeVertexNormals();root.add(mesh);
    }
    root.updateMatrixWorld(true);
    const baked=bakeSceneryCollision(root)!,world=new RAPIER.World({x:0,y:0,z:0});
    world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    try {
      for(const s of [12.5,32.5,52.5]) {
        const along=base+s;if(along<preview.start||along>preview.end)continue;
        const x=branchRoadX(preview,along);
        if(Math.abs(x)<20)continue;
        for(const offset of [-preview.width*.35,0,preview.width*.35]) {
          const point=new THREE.Vector3(x+offset+courseX(along)-courseX(base),100,-s),down=new THREE.Vector3(0,-1,0);
          const visual=new THREE.Raycaster(point,down).intersectObjects(skins.filter(mesh=>mesh.name==='branch-paving'))[0],physical=world.castRay(new RAPIER.Ray(point,down),200,true);
          assert.ok(visual&&physical,`missing road/support at ${along}`);
          assert.ok(Math.abs(physical.timeOfImpact-visual.distance-.018)<.004,`road floats at ${along}: ${physical.timeOfImpact-visual.distance}`);
          assert.ok(visual.face!.normal.y>.85,'roads need drivable transverse slopes');
        }
      }
      assert.equal(baked.meshCount,1,'terrain alone supplies the road collision');
    } finally {world.free();dispose(root);}
  }
});

test('roof routes keep exact open underpasses and visible matching collision in every branch feature family',async()=>{
  await RAPIER.init();
  for(const kind of ['boulevard','esplanade','cutting'] as const) {
    const road={...preview,kind},s=preview.start+preview.lead+90,index=Math.floor(s/70),root=new THREE.Group();
    root.add(...makeBranchFeatures(index,road,roadMaterial));root.updateMatrixWorld(true);
    const baked=bakeSceneryCollision(root)!,world=new RAPIER.World({x:0,y:0,z:0});
    world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    try {
      const center=branchRoadX(road,s),floor=landscapeHeight(center,s)-courseHeight(s),z=-(s-index*70);
      const underside=world.castRay(new RAPIER.Ray({x:center,y:floor+1.5,z},{x:1,y:0,z:0}),road.width/2,true);
      assert.equal(underside,null,'architecture cannot seal the clear road with a bounding-box collider');
      const x=kind==='boulevard'?center:center+road.width/2+4;
      const origin=new THREE.Vector3(x,floor+30,z),down=new THREE.Vector3(0,-1,0);
      const visible=new THREE.Raycaster(origin,down).intersectObject(root,true)[0],physical=world.castRay(new RAPIER.Ray(origin,down),50,true);
      assert.ok(visible&&physical,`${kind} has no surface at ${x},${z}`);assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.002);
      assert.ok(visible.face!.normal.y>0);
      assert.ok(baked.indices.length/3<1800,'rideable architecture must stay inexpensive');
    } finally {world.free();dispose(root);}
  }
});

test('road crossings remove sidewalk support, and branch paving meets the main road with its own summer/winter finish',()=>{
  let crossings=0,asphalt=0,paintOpenings=0;
  const appearance=createWorldAppearance('winter'),mats=makeSharedMaterials();
  for(let index=0;index<=10;index++) {
    const root=new THREE.Group();
    for(const _ of buildChunkContent({index,root,angle:RAMP.angleDeg*Math.PI/180,sunOnHill:new THREE.Vector3(-1,2,1).normalize(),asphaltMaterial:roadMaterial,mats,startPlatform:false,rails:[]})){void _;}
    root.updateMatrixWorld(true);
    for(let along=index*70+2.5;along<(index+1)*70;along+=5)if(branchCrossesSidewalk(preview,1,along)) {
      crossings++;
      const x=10.5+courseX(along)-courseX(index*70),z=-(along-index*70);
      const supports=root.children.filter(o=>o.name==='sidewalk-support');
      assert.equal(new THREE.Raycaster(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0)).intersectObjects(supports).length,0,'invisible curbs cannot remain in road junctions');
      const edge=RAMP.width/2-.4;
      if(Math.abs(branchRoadX(preview,along)-edge)<preview.width/2+.15) {
        paintOpenings++;
        const junction=root.children.filter(o=>o.name==='branch-paving');
        const seam=new THREE.Vector3(RAMP.width/2+.001+courseX(along)-courseX(index*70),50,z);
        const hits=new THREE.Raycaster(seam,new THREE.Vector3(0,-1,0)).intersectObjects(junction);
        assert.ok(hits.length && Math.abs(hits[0]!.point.y-(courseHeight(along)-courseHeight(index*70)+RAMP.thickness/2))<.002,'branch must meet the height and edge of the main deck');
        const point=new THREE.Vector3(edge+courseX(along)-courseX(index*70),50,z);
        assert.equal(new THREE.Raycaster(point,new THREE.Vector3(0,-1,0)).intersectObjects(root.children.filter(o=>o.name==='road-edge-paint')).length,0,'main-road edge paint should open into paved forks');
      }
    }
    for(const mesh of root.children)if(mesh instanceof THREE.Mesh&&mesh.name==='branch-paving') {
      asphalt++;assert.notEqual(mesh.material,roadMaterial);assert.equal(mesh.userData.collision,false);
      assert.notEqual(appearance.materialFor(mesh.material),appearance.materialFor(roadMaterial));
      assert.equal(mesh.material.userData.architectureFinish,'setts');
    }
    dispose(root);
  }
  assert.ok(crossings>=4 && asphalt>=6 && paintOpenings>0);
});

test('a rider can take either the road or its optional gallery roof and rejoin using normal steering in both modes',async()=>{
  await RAPIER.init();
  const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
  const smooth=(s:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(s-a)/(b-a)));return t*t*(3-2*t);};
  for(const [mode,rooftop] of [['skate',false],['snowboard',false],['skate',true],['snowboard',true]] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      const roofStart=preview.start+preview.lead+65,roofEnd=preview.end-preview.lead-27;
      const line=(s:number)=> {
        const entry=smooth(s,preview.start+preview.lead-50,roofStart-60)*(1-smooth(s,roofEnd+70,preview.end-40));
        return branchRoadX(preview,s)+(rooftop?16*entry:0);
      };
      // Road runs begin before the split; roof runs begin on the ground approach to its outside bank.
      const start=rooftop?roofStart-70:30,x=line(start);
      scene.updateMatrixWorld(true);
      const at=new THREE.Vector3(x+courseX(start),landscapeHeight(x,start)+.2,-start).applyMatrix4(ramp.mesh.matrixWorld);player.reset(at);
      for(let i=0;i<25;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
      player.body.setLinvel(ramp.forward.clone().multiplyScalar(20),true);
      let furthest=0,complete=false,inside=0,roofFrames=0;
      for(let i=0;i<5200;i++) {
        const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),look=Math.max(10,player.speed*.38);
        const x=ramp.roadOffset!(player.position),target=line(along+look)+courseX(along+look)-courseX(along)-x;
        const desired=Math.atan2(-target,look),yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward));
        const error=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
        const steer=player.airborne?0:THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1);
        player.update(dt,{...idle,steer},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
        const progress=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
        const offset=ramp.roadOffset!(player.position);furthest=Math.max(furthest,Math.abs(offset));
        assert.equal(player.crashed,false,`${mode} roof=${rooftop}: ${player.crashCause} at ${progress}, x=${offset}, above=${ramp.mesh.worldToLocal(player.position.clone()).y+courseHeight(ramp.distance)-landscapeHeight(offset,progress)}`);
        if(rooftop && progress>roofStart+5 && progress<roofEnd-5 && !player.airborne) {
          const local=ramp.mesh.worldToLocal(player.position.clone()),above=local.y+courseHeight(ramp.distance)-landscapeHeight(offset,progress);
          if(above>7)roofFrames++;
        }
        if(progress>preview.start+preview.lead && progress<preview.end-preview.lead && Math.abs(offset-line(progress))<preview.width/2)inside++;
        if(progress>preview.end+20){assert.ok(Math.abs(offset)<7,`${mode}: the branch must merge back into the road`);complete=true;break;}
      }
      assert.ok(complete&&furthest>90&&inside>120,`${mode}: complete=${complete}, furthest=${furthest}, gallery=${inside}`);
      if(rooftop)assert.ok(roofFrames>120,`${mode}: must actually ride across the elevated gallery roof, frames=${roofFrames}`);
    } finally {world.free();}
  }
});
