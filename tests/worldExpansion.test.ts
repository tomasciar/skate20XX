import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {ARCHITECTURE_STYLES,makeArchitecture} from '../src/world/structures/architecture.ts';
import {LANDSCAPE_PALETTES,landscapePaletteAt} from '../src/world/environments/palettes.ts';
import {districtAt,seededRandom} from '../src/world/planning/generation.ts';
import {makeLandscape,LANDSCAPE_X} from '../src/world/terrain/landscape.ts';
import {ROOFTOP,rooftopHeight} from '../src/world/structures/workshop.ts';
import {bakeSceneryCollision} from '../src/world/physics/collision.ts';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {createWorldAppearance} from '../src/world/rendering/appearance.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {courseHeight} from '../src/world/terrain/course.ts';
import type {PlayerIntent} from '../src/player/controller.ts';
import {WAREHOUSE,warehouseSiteAt,makeLongWarehouse} from '../src/world/structures/warehouse.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('regional colourways are coherent across a district run and blend without terrain seams',()=>{
  const seen=new Set<string>(),material=new THREE.MeshStandardMaterial();
  try {
    for(let index=0;index<160;index++) {
      const run=districtAt(index),palette=landscapePaletteAt(index);seen.add(palette.id);
      assert.equal(palette,landscapePaletteAt(run.start));
      if(index<3)assert.equal(palette.id,'golden-autumn');
      if(index && run.offset===0) {
        const a=makeLandscape(index-1,material),b=makeLandscape(index,material);
        try {
          for(const name of ['color','normal']) {
            const x=a.geometry.getAttribute(name),y=b.geometry.getAttribute(name);
            for(let i=0;i<LANDSCAPE_X.length;i++)for(let axis=0;axis<3;axis++)
              assert.equal(x.array[(x.count-LANDSCAPE_X.length+i)*3+axis],y.array[i*3+axis],`${name} seam at ${index}`);
          }
        } finally {a.geometry.dispose();b.geometry.dispose();}
      }
    }
    assert.equal(seen.size,LANDSCAPE_PALETTES.length);
  } finally {material.dispose();}
});

test('new architecture has shared materials, bounded footprints and visible outward-facing solid roofs',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),root=new THREE.Group(),props:THREE.Group[]=[],materials=new Set<THREE.Material>();
  const appearance=createWorldAppearance('winter');let wedges=0;
  for(const style of ARCHITECTURE_STYLES)for(let seed=0;seed<4;seed++) {
    const prop=makeArchitecture(seededRandom(seed),style),bounds=new THREE.Box3().setFromObject(prop);
    assert.ok(bounds.min.x>=-prop.userData.width/2 && bounds.max.x<=prop.userData.width/2);
    assert.ok(bounds.max.z-bounds.min.z<=prop.userData.depth+1);
    prop.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      materials.add(object.material as THREE.Material);
      if(object.geometry.type==='BufferGeometry') {
        const p=object.geometry.getAttribute('position'),n=object.geometry.getAttribute('normal');
        const center=new THREE.Vector3(0,1/3,0);
        for(let i=0;i<p.count;i+=3) {
          const point=new THREE.Vector3().fromBufferAttribute(p,i);
          const normal=new THREE.Vector3().fromBufferAttribute(n,i);
          assert.ok(point.sub(center).dot(normal)>0,'closed roof triangles must all face outward');
        }
        wedges++;
      }
    });
    prop.position.x=props.length*30;props.push(prop);root.add(prop);
  }
  const baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();root.updateMatrixWorld(true);
  try {
    assert.ok(wedges>=16);assert.ok(materials.size<=7);
    for(const prop of props)for(const x of [-.55,.55]) {
      const origin=new THREE.Vector3(prop.position.x+x,30,0),down=new THREE.Vector3(0,-1,0);
      const visual=new THREE.Raycaster(origin,down).intersectObject(prop,true)[0],physical=world.castRay(new RAPIER.Ray(origin,down),40,true);
      assert.ok(visual && physical);assert.ok(Math.abs(visual.distance-physical.timeOfImpact)<.002);
      assert.ok(visual.face!.normal.y>0,'roofs must be visible from above without showing the inward underside');
      const source=(visual.object as THREE.Mesh).material as THREE.Material;
      assert.ok(appearance.materialFor(source).customProgramCacheKey().includes('snow-coating'));
    }
    const arcade=props[4]!;
    assert.equal(world.castRay(new RAPIER.Ray({x:arcade.position.x,y:1.5,z:4},{x:0,y:0,z:-1}),3,true),null,'colonnade must really be open');
  } finally {world.free();}
});

test('the workshop roof can be ridden up, across and off in both modes',async()=>{
  await RAPIER.init();
  assert.equal(rooftopHeight(ROOFTOP.start),0);assert.equal(rooftopHeight(ROOFTOP.rampEnd),ROOFTOP.height);
  assert.ok(rooftopHeight(ROOFTOP.start+.001)<1e-10);
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      for(const speed of [18,36]) {
        ramp.reset();const start=140+ROOFTOP.start-3;
        const position=ramp.anchor.clone().addScaledVector(ramp.forward,start).addScaledVector(ramp.surfaceNormal,courseHeight(start)+.2);position.x=ROOFTOP.x;
        player.reset(position);for(let i=0;i<20;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
        player.body.setLinvel(ramp.forward.clone().multiplyScalar(speed),true);
        let reachedRoof=false,exited=false;
        for(let i=0;i<700;i++) {
          player.update(dt,idle,tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
          const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
          assert.equal(player.crashed,false,`${mode} at ${speed}: ${player.crashCause} at ${along}`);
          if(along>140+ROOFTOP.rampEnd+2 && along<140+ROOFTOP.end-2 && !player.airborne)reachedRoof=true;
          if(along>140+ROOFTOP.end+15 && !player.airborne){exited=true;break;}
        }
        assert.ok(reachedRoof && exited,`${mode} at ${speed} should ride the roof and land back on the road`);
      }
    } finally {world.free();}
  }
});

test('rooftop surfaces stay aligned through rebases and mode changes',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world,{startPlatform:false});
  try {
    ramp.scroll(70);world.step();scene.updateMatrixWorld(true);
    for(const mode of ['skate','snowboard'] as const) {
      ramp.setMode!(mode);
      for(const s of [8,20,35,40,55,63]) {
        const along=140+s,local=new THREE.Vector3(ROOFTOP.x,RAMP.thickness/2+courseHeight(along)-courseHeight(ramp.distance)+rooftopHeight(s)+3,-(along-ramp.distance));
        const origin=local.applyMatrix4(ramp.mesh.matrixWorld),down=ramp.surfaceNormal.clone().negate();
        const physical=world.castRay(new RAPIER.Ray(origin,down),5,true),visual=new THREE.Raycaster(origin,down,0,5).intersectObject(ramp.mesh,true)[0];
        assert.ok(physical && visual);assert.ok(Math.abs(physical.timeOfImpact-3)<.002);
        assert.ok(Math.abs(physical.timeOfImpact-visual.distance)<.002);
      }
      // Main line remains unobstructed by either optional side route.
      for(const along of [107,110,115,148,175,190,203]) {
        const start=new THREE.Vector3(0,RAMP.thickness/2+courseHeight(along)-courseHeight(ramp.distance)+2,-(along-ramp.distance)).applyMatrix4(ramp.mesh.matrixWorld);
        const hit=world.castRay(new RAPIER.Ray(start,ramp.surfaceNormal.clone().negate()),3,true);
        assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-2)<.002);
      }
    }
  } finally {world.free();}
});

test('the separate loading ramp launches onto the long warehouse roof with ordinary player physics',async()=>{
  await RAPIER.init();
  const W=WAREHOUSE,owner=W.firstChunk,base=owner*RAMP.chunkLength,entry=base+W.rampStart;
  const slope=(W.rampExitX-W.rampX)/(W.rampEnd-W.rampStart);
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      for(const speed of [35,55]) {
        ramp.reset();const start=210;
        const at=ramp.anchor.clone().addScaledVector(ramp.forward,start).addScaledVector(ramp.surfaceNormal,courseHeight(start)+.2);
        at.x=W.rampX+(start-entry)*slope+.2;player.reset(at);
        for(let i=0;i<20;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
        // Line up using the actual steering controls before accelerating into the fixture.
        for(let i=0;i<120;i++) {
          const yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward)),error=-Math.atan(slope)-yaw;
          if(Math.abs(error)<.006)break;
          player.update(dt,{...idle,steer:THREE.MathUtils.clamp(-error*8/carveTurnRate(player.speed),-1,1)},tricks.state);world.step();player.sync(false);
        }
        player.body.setLinvel(player.forward.clone().multiplyScalar(speed),true);
        let flight=false,landed=false,roofMeters=0,previous=0,exited=false;
        for(let i=0;i<1600;i++) {
          const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),offset=ramp.roadOffset!(player.position);
          let steer=0;
          if(!player.airborne) {
            const target=along<base+W.start-2
              ? -Math.atan(slope)+Math.atan2(offset-(W.rampX+(along-entry)*slope),18)
              : Math.atan2(offset-18,24);
            const yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward));
            steer=THREE.MathUtils.clamp(-(target-yaw)*3/carveTurnRate(player.speed),-1,1);
          }
          player.update(dt,{...idle,steer},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
          const progress=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
          const local=ramp.mesh.worldToLocal(player.position.clone()),height=local.y-courseHeight(progress)+courseHeight(ramp.distance)-RAMP.thickness/2;
          assert.equal(player.crashed,false,`${mode} at ${speed}: ${player.crashCause} at ${progress}, x=${ramp.roadOffset!(player.position)}, height=${height}`);
          if(progress>base+W.rampEnd && player.airborne && height>W.height)flight=true;
          if(progress>base+W.start && progress<base+W.end && !player.airborne && height>W.height-.1) {
            assert.ok(flight,'reach the roof by flying across a real gap');landed=true;
            if(previous)roofMeters+=progress-previous;previous=progress;
          } else previous=0;
          if(progress>base+W.end+15 && !player.airborne){exited=true;break;}
        }
        assert.ok(landed && roofMeters>20 && exited,`${mode} at ${speed}: fly, ride at least 20 m of roof, and land beyond it; roof=${roofMeters}, exit=${exited}`);
      }
    } finally {world.free();}
  }
});

test('the warehouse lot spans neighbouring chunks, while its materials and source geometry remain bounded',()=>{
  assert.equal(warehouseSiteAt(2),null);
  const site=warehouseSiteAt(3)!;
  for(const index of [3,4,5,6,7])assert.deepEqual(warehouseSiteAt(index),site);
  assert.equal(warehouseSiteAt(8),null);
  assert.equal(warehouseSiteAt(35)!.owner,35);
  const meshes=makeLongWarehouse(3),materials=new Set(meshes.map(mesh=>mesh.material)),root=new THREE.Group();root.add(...meshes);
  try {
    assert.ok(materials.size<=9);assert.ok(bakeSceneryCollision(root)!.indices.length/3<3000);
    const ramp=meshes.find(mesh=>mesh.name==='warehouse-loading-ramp')!,roof=meshes.find(mesh=>mesh.name==='warehouse-roof')!;
    const lip=new THREE.Box3().setFromObject(ramp).min.z,front=new THREE.Box3().setFromObject(roof).max.z;
    assert.ok(lip-front>=5.9,'the ramp must end before the building instead of joining its roof');
    assert.ok(new THREE.Box3().setFromObject(roof).min.x>11.4,'keep the warehouse outside the existing road and sidewalk');
  } finally {for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();}
});
