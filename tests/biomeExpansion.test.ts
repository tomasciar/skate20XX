import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {DISTRICT_BUILDINGS,makeDistrictBuilding,makeMesa,makeHarborCrane} from '../src/world/props/districtBuildings.ts';
import {DISTRICTS} from '../src/world/environments/catalog.ts';
import {districtAt,seededRandom} from '../src/world/planning/generation.ts';
import {landscapePaletteAt} from '../src/world/environments/palettes.ts';
import {biomeTerrainHeight} from '../src/world/terrain/biomes.ts';
import {bakeSceneryCollision} from '../src/world/physics/collision.ts';
import {createWorldAppearance} from '../src/world/rendering/appearance.ts';
import {makeHarborCrate,makeBollard,makeCactus,makeGardenLantern,makeSkiRack} from '../src/world/props/districtStreetProps.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});

test('all four biomes appear early with distinct palettes and terrain silhouettes, preserving the opening',()=>{
  assert.equal(districtAt(0).district,'grove');assert.equal(districtAt(3).district,'city');
  const palettes=new Set();
  for(const id of ['harbor','canyon','gardens','alpine'] as const) {
    assert.ok(DISTRICTS.includes(id));
    const index=Array.from({length:26},(_,i)=>i).find(i=>districtAt(i).district===id);assert.notEqual(index,undefined);
    palettes.add(landscapePaletteAt(index!).id);
    const along=index!*70+65;
    assert.equal(biomeTerrainHeight(2,50,along),2,'the main riding belt stays unchanged');
    assert.ok(Number.isFinite(biomeTerrainHeight(2,200,along)));
  }
  assert.equal(palettes.size,4);
  for(let index=1;index<150;index++) {
    const a=biomeTerrainHeight(4,200,index*70-.0001),b=biomeTerrainHeight(4,200,index*70+.0001);
    assert.ok(Math.abs(a-b)<.001,'biome height transitions must be continuous at chunk boundaries');
  }
});

test('new building families reuse materials and geometry, keep outward roofs, and match visible collision',async()=>{
  await RAPIER.init();
  const winter=createWorldAppearance('winter'),materials=new Set<THREE.Material>();
  for(const kind of DISTRICT_BUILDINGS) {
    const first=makeDistrictBuilding(seededRandom(7),kind),second=makeDistrictBuilding(seededRandom(7),kind),root=new THREE.Group();root.add(first);root.updateMatrixWorld(true);
    const details=first.children.find(o=>o.name==='district-building-details');
    assert.ok(details&&details.children.length>=8,`${kind} needs attached architectural detail`);
    const a:THREE.Mesh[]=[],b:THREE.Mesh[]=[];
    first.traverse(o=>{if(o instanceof THREE.Mesh)a.push(o);});second.traverse(o=>{if(o instanceof THREE.Mesh)b.push(o);});
    assert.ok(a.length<100);
    a.forEach((mesh,i)=>{assert.equal(mesh.geometry,b[i]!.geometry,'templates should share primitive geometry');assert.equal(mesh.material,b[i]!.material);materials.add(mesh.material as THREE.Material);});
    const baked=bakeSceneryCollision(root)!,world=new RAPIER.World({x:0,y:0,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    try {
      const origin=new THREE.Vector3(0,50,-2),down=new THREE.Vector3(0,-1,0);
      const visible=new THREE.Raycaster(origin,down).intersectObject(root,true).find(h=>h.object.parent?.userData.collision!==false&&h.object.userData.collision!==false);
      const physical=world.castRay(new RAPIER.Ray(origin,down),70,true);
      assert.ok(visible&&physical,`${kind} has an open/missing roof`);assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.002,`${kind}: visible ${visible.distance}, physics ${physical.timeOfImpact}`);
      assert.ok(visible.face!.normal.y>0,`${kind} roof faces inward`);
      for(const mesh of a) {
        for(const value of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(value));
        const material=mesh.material as THREE.Material;
        assert.equal(winter.materialFor(material),winter.materialFor(material));
      }
    } finally {world.free();}
  }
  assert.ok(materials.size<24,'new architecture should use a small shared palette');
  for(const builder of [makeMesa,makeHarborCrane]) {
    const root=builder(seededRandom(11)),bounds=new THREE.Box3().setFromObject(root);
    assert.ok(bounds.max.y>9 && bounds.max.y<35);assert.ok(bakeSceneryCollision(root));
  }
});

test('biome street props share primitive assets and retain their visible solid collision',async()=>{
  await RAPIER.init();
  for(const build of [makeHarborCrate,makeBollard,makeCactus,makeGardenLantern,makeSkiRack]) {
    const root=new THREE.Group(),prop=build();root.add(prop);root.updateMatrixWorld(true);
    const baked=bakeSceneryCollision(root)!,world=new RAPIER.World({x:0,y:0,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    try {
      const origin=new THREE.Vector3(.1,20,.08),down=new THREE.Vector3(0,-1,0);
      const visible=new THREE.Raycaster(origin,down).intersectObject(root,true).find(h=>h.object.userData.collision!==false);
      const physical=world.castRay(new RAPIER.Ray(origin,down),30,true);
      assert.ok(visible&&physical,build.name);assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.002,build.name);
      let triangles=0;
      prop.traverse(o=>{if(o instanceof THREE.Mesh){assert.equal(o.geometry.userData.shared,true);triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;}});
      assert.ok(triangles<250,`${build.name} must remain cheaper than dense foliage`);
    } finally {world.free();}
  }
});
