import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {seededRandom} from '../src/world/planning/generation.ts';
import {makeHouse,makeTree,makeCar,makePlanter,makeRocks,makeCabin,makeBarn,makeWarehouse,makeBench} from '../src/world/props/scenery.ts';
import {varyScenery,sceneryMaterial,applySceneryTint,CONTAINER_VARIANTS,TERMINAL_VARIANTS,makeContainerVariant,makeTerminalVariant} from '../src/world/props/variety.ts';
import {bakeSceneryCollision} from '../src/world/physics/collision.ts';
import {createRamp} from '../src/world/ramp.ts';
import {addAssetDetails} from '../src/world/props/assetDetails.ts';
import {makeCityBuilding} from '../src/world/props/city.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});

function fingerprint(root:THREE.Object3D) {
  const parts:unknown[]=[root.userData.assetVariant,root.scale.toArray()];
  root.traverse(object=>{
    if(object instanceof THREE.Mesh)parts.push([object.geometry.type,object.position.toArray(),object.rotation.toArray(),object.scale.toArray(),object.userData.sceneryTint]);
  });
  return JSON.stringify(parts);
}

test('seeded scenery produces many repeatable silhouettes and colour combinations without allocating materials per variant',()=>{
  for(const build of [makeHouse,makeTree,makeCar,makePlanter,makeRocks]) {
    const signatures=new Set<string>(),materials=new Set<THREE.Material>();
    for(let slot=0;slot<60;slot++) {
      const a=varyScenery(build(seededRandom(101)),'village',4,slot),b=varyScenery(build(seededRandom(101)),'village',4,slot);
      const signature=fingerprint(a);assert.equal(signature,fingerprint(b));signatures.add(signature);
      a.traverse(object=>{if(object instanceof THREE.Mesh)materials.add(object.material as THREE.Material);});
    }
    assert.ok(signatures.size>(build===makeRocks?25:45),`${build.name} should produce a broad variety of appearances; got ${signatures.size}`);
    assert.ok(materials.size<20,'colour variation must reuse the existing material palette');
  }
});

test('container and street-terminal designs reuse exact solid collision templates',()=>{
  for(const [names,build] of [[CONTAINER_VARIANTS,makeContainerVariant],[TERMINAL_VARIANTS,makeTerminalVariant]] as const) {
    let previous:ReturnType<typeof bakeSceneryCollision>;
    const looks=new Set<string>();
    for(const name of names) {
      // Each family is internally type-safe; the tuple union combines the two independent builders.
      const root=(build as (kind:string)=>THREE.Group)(name),collision=bakeSceneryCollision(root)!;
      looks.add(fingerprint(root));
      if(previous) {assert.deepEqual(collision.vertices,previous.vertices);assert.deepEqual(collision.indices,previous.indices);}
      previous=collision;
      assert.ok(collision.meshCount<=2,'painted details must not add physical surfaces');
    }
    assert.equal(looks.size,names.length);
  }
});

test('roof profiles remain inside their reserved footprint and have matching solid riding surfaces',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),root=new THREE.Group(),profiles=new Set<string>(),detail=sceneryMaterial(0xffffff);
  const props:THREE.Object3D[]=[];
  try {
    for(const build of [makeHouse,makeCabin,makeBarn,makeWarehouse])for(let style=0;style<4;style++) {
      const prop=build(seededRandom(42)),before=new THREE.Box3().setFromObject(prop);
      addAssetDetails(prop,prop.userData.assetFamily,style,detail,0x448899,0xe4dcc3);
      const after=new THREE.Box3().setFromObject(prop);
      assert.ok(after.min.x>=before.min.x-1e-5 && after.max.x<=before.max.x+1e-5);
      assert.ok(after.min.z>=before.min.z-1e-5 && after.max.z<=before.max.z+1e-5);
      prop.traverse(object=>{if(object.userData.roofProfile)profiles.add(object.userData.roofProfile);});
      prop.position.x=props.length*50;props.push(prop);root.add(prop);
    }
    assert.deepEqual(profiles,new Set(['gable','hip','saltbox','skillion']));
    const baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();root.updateMatrixWorld(true);
    props.forEach((prop,i)=>{
      const origin=new THREE.Vector3(i*50+0.31,80,0.27),down=new THREE.Vector3(0,-1,0);
      const visible=new THREE.Raycaster(origin,down).intersectObject(prop,true)[0];
      const physical=world.castRayAndGetNormal(new RAPIER.Ray(origin,down),100,true);
      assert.ok(visible && physical);assert.equal(visible.object.parent!.userData.variantPart,'roof');
      assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<0.002);assert.ok(physical.normal.y>0.2);
    });
  } finally {world.free();detail.dispose();}
});

test('slatted and backless bench variants preserve seat support and the gap underneath',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),root=new THREE.Group(),detail=sceneryMaterial(0xffffff);
  try {
    for(let style=0;style<4;style++) {
      const bench=makeBench();addAssetDetails(bench,'bench',style,detail,0x448899,0xe4dcc3);bench.position.x=style*5;root.add(bench);
    }
    const baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    for(let style=0;style<4;style++) {
      const support=world.castRay(new RAPIER.Ray({x:style*5,y:2,z:0},{x:0,y:-1,z:0}),3,true);
      assert.ok(support);assert.ok(Math.abs(support.timeOfImpact-1.33)<0.001);
      assert.equal(world.castRay(new RAPIER.Ray({x:style*5,y:0.3,z:2},{x:0,y:0,z:-1}),4,true),null);
    }
  } finally {world.free();detail.dispose();}
});

test('vehicle roof accessories follow the actual roof height, including low coupes',()=>{
  let checked=0,lowCoupe=false;
  for(let slot=0;slot<80;slot++) {
    const car=varyScenery(makeCar(seededRandom(101)),'city',3,slot);
    if(car.userData.detailVariant!==2)continue;
    let roof=0;
    car.traverse(object=>{if(object instanceof THREE.Mesh && object.material.userData.paletteRole==='paint')roof=Math.max(roof,object.position.y+object.scale.y/2);});
    const accessories=car.children.filter(object=>object instanceof THREE.Mesh && object.userData.collision===false && object.geometry.type==='BoxGeometry') as THREE.Mesh[];
    assert.ok(accessories.length>0);
    for(const accessory of accessories) {
      const gap=accessory.position.y-accessory.scale.y/2-roof;assert.ok(gap>0.003 && gap<0.012);
    }
    checked++;if(car.userData.assetVariant===1)lowCoupe=true;
  }
  assert.ok(checked>10 && lowCoupe);
});

test('sixteen storefront labels share the original atlas dimensions and one material',()=>{
  const cells=new Set<string>(),materials=new Set<THREE.Material>();
  for(let seed=0;seed<80;seed++) {
    const building=makeCityBuilding(seededRandom(seed));
    building.traverse(object=>{
      if(!(object instanceof THREE.Mesh) || !object.userData.shopLabel)return;
      const texture=object.material.map as THREE.Texture;assert.equal(texture.image.width,512);assert.equal(texture.image.height,512);
      const uv=object.geometry.getAttribute('uv');cells.add(`${uv.getX(0)}:${uv.getY(0)}`);materials.add(object.material);
    });
  }
  assert.equal(cells.size,16);assert.equal(materials.size,1);
});

test('compact tint attributes reproduce the requested colour, reuse cached data, and preserve shared source geometry',()=>{
  const geometry=new THREE.BoxGeometry(),material=sceneryMaterial(0x884422),source=material.color.clone();
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.sceneryTint=0x4d9bb5;
  const a=geometry.clone(),b=geometry.clone();applySceneryTint(a,mesh);applySceneryTint(b,mesh);
  try {
    const color=a.getAttribute('color') as THREE.Float16BufferAttribute,target=new THREE.Color(0x4d9bb5);
    assert.ok(color instanceof THREE.Float16BufferAttribute);assert.equal(color.array.BYTES_PER_ELEMENT,2);
    assert.equal(color,b.getAttribute('color'),'identical part colours should share cached CPU data');
    for(const [actual,expected] of [[color.getX(0)*source.r,target.r],[color.getY(0)*source.g,target.g],[color.getZ(0)*source.b,target.b]])assert.ok(Math.abs(actual-expected)<0.001);
    assert.equal(geometry.getAttribute('color'),undefined);assert.ok(material.color.equals(source));
  } finally {geometry.dispose();a.dispose();b.dispose();material.dispose();}
});

test('varied container and post solids remain physical on every side',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0});
  try {
    const root=new THREE.Group();
    CONTAINER_VARIANTS.forEach((name,i)=>{const prop=makeContainerVariant(name);prop.position.x=i*4;root.add(prop);});
    TERMINAL_VARIANTS.forEach((name,i)=>{const prop=makeTerminalVariant(name);prop.position.x=(i+CONTAINER_VARIANTS.length)*4;root.add(prop);});
    const baked=bakeSceneryCollision(root)!;world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    for(let i=0;i<CONTAINER_VARIANTS.length;i++)for(const side of [-1,1]) {
      const hit=world.castRay(new RAPIER.Ray({x:i*4,y:0.45,z:side*2},{x:0,y:0,z:-side}),3,true);
      assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-1.2)<0.001);
    }
    for(let i=0;i<TERMINAL_VARIANTS.length;i++) {
      const hit=world.castRay(new RAPIER.Ray({x:(i+CONTAINER_VARIANTS.length)*4,y:1.5,z:2},{x:0,y:0,z:-1}),3,true);
      assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-1.88)<0.001);
    }
  } finally {world.free();}
});

test('static batches retain half-float colours and seasonal support after geometry merging',async()=>{
  await RAPIER.init();
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:0,z:0}),ramp=createRamp(scene,world);
  try {
    const tinted:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry}[]=[],colors=new Set<number>();
    ramp.mesh.traverse(object=>{
      if(!(object instanceof THREE.Mesh) || Array.isArray(object.material))return;
      const attribute=object.geometry.getAttribute('color');
      if(!(attribute instanceof THREE.Float16BufferAttribute))return;
      assert.equal(attribute.count,object.geometry.getAttribute('position').count);
      const material=object.material as THREE.MeshStandardMaterial;assert.ok(material.vertexColors);
      for(let i=0;i<attribute.count;i++) {
        const color=new THREE.Color().setRGB(attribute.getX(i)*material.color.r,attribute.getY(i)*material.color.g,attribute.getZ(i)*material.color.b);
        assert.ok(Number.isFinite(color.r+color.g+color.b));colors.add(color.getHex());
      }
      tinted.push({mesh:object,geometry:object.geometry});
    });
    assert.ok(tinted.length>20 && colors.size>40,'variations must reach the merged render geometry');
    ramp.setMode!('snowboard');
    for(const {mesh,geometry} of tinted) {
      assert.equal(mesh.geometry,geometry);
      assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true);
      assert.ok((mesh.material as THREE.Material).customProgramCacheKey().endsWith('|snow-coating-v1'));
    }
  } finally {world.free();}
});
