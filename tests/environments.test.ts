import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {ENVIRONMENTS,DISTRICTS,DISTRICT_NAMES} from '../src/world/environments/catalog.ts';
import {ENVIRONMENT_LAYOUTS} from '../src/world/environments/registry.ts';
import {createLayoutContext} from '../src/world/environments/layout.ts';
import {createWorldAppearance,surface} from '../src/world/appearance.ts';
import {seasonForRideMode} from '../src/world/season.ts';
import {districtAt,seededRandom} from '../src/world/generation.ts';
import {createRamp,RAMP} from '../src/world/ramp.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});

test('the environment catalog has complete layouts and scenery palettes, independent of riding mode',()=>{
  assert.equal(new Set(DISTRICTS).size,ENVIRONMENTS.length);
  assert.deepEqual(Object.keys(ENVIRONMENT_LAYOUTS),DISTRICTS);
  for(const environment of ENVIRONMENTS) {
    assert.equal(DISTRICT_NAMES[environment.id],environment.name);
    assert.ok(environment.name.length>0 && environment.trees.length>0);
    assert.equal(typeof ENVIRONMENT_LAYOUTS[environment.id],'function');
  }
  assert.equal(seasonForRideMode('skate'),'summer');
  assert.equal(seasonForRideMode('snowboard'),'winter');
});

test('a new prop gets winter support through the shared layout pipeline without a snow-specific builder',()=>{
  const material=new THREE.MeshStandardMaterial({color:0x884422}),accent=surface(new THREE.MeshStandardMaterial({color:0xffc43d}),'obstacle');
  const object=new THREE.Group(),geometry=new THREE.BoxGeometry(),mesh=new THREE.Mesh(geometry,[material,accent]);object.add(mesh);
  const placed=new THREE.Group();
  const layout=createLayoutContext({district:'village',index:0,entering:false,rng:seededRandom(1),plant:prop=>placed.add(prop)});
  layout.place(()=>object,20,30);
  for(const _ of layout.build()){void _;}
  assert.equal(material.userData.surface,'scenery');assert.equal(accent.userData.surface,'obstacle');
  const appearance=createWorldAppearance('winter'),winter=appearance.materialFor(material);
  try {
    assert.notEqual(winter,material);
    assert.ok(winter.customProgramCacheKey().endsWith('|snow-coating-v1'));
    assert.equal(appearance.materialFor(accent),accent,'readable obstacle colors must stay intact');
    assert.equal(mesh.geometry,geometry);assert.equal(placed.children[0],object);
    appearance.setSeason('summer',placed);assert.equal(appearance.materialFor(material),material);
    appearance.setSeason('winter',placed);assert.equal(appearance.materialFor(material),winter,'winter variants should be reused');
  } finally {geometry.dispose();winter.dispose();material.dispose();accent.dispose();}
});

test('winter coating composes with an environment material shader instead of replacing it',()=>{
  const source=surface(new THREE.MeshStandardMaterial(),'scenery');
  source.onBeforeCompile=shader=>{shader.vertexShader='// environment detail\n'+shader.vertexShader;};
  source.customProgramCacheKey=()=> 'environment-detail-v1';
  const winter=createWorldAppearance('winter').materialFor(source);
  try {
    const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
    winter.onBeforeCompile(shader as never,{} as never);
    assert.ok(shader.vertexShader.startsWith('// environment detail'));
    assert.ok(shader.vertexShader.includes('vSnowUp'));
    assert.ok(shader.fragmentShader.includes('snowCover'));
    assert.equal(winter.customProgramCacheKey(),'environment-detail-v1|snow-coating-v1');
    assert.equal(source.customProgramCacheKey(),'environment-detail-v1');
  } finally {winter.dispose();source.dispose();}
});

test('every registered environment streams and switches between skate and snow without rebuilding geometry or collision',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world,{startPlatform:false});
  try {
    for(const environment of ENVIRONMENTS) {
      let index=0;
      const searchLimit=ENVIRONMENTS.length*40;
      while(index<searchLimit && districtAt(index).district!==environment.id)index++;
      assert.ok(index<searchLimit,`${environment.id} must be reachable through normal generation`);
      ramp.scroll(index*RAMP.chunkLength-ramp.distance);
      while(!ramp.prepareNextChunk(Infinity)){}
      world.step();
      const chunk=ramp.mesh.children.find(child=>child.position.z===0);assert.ok(chunk && chunk.visible);
      const snapshots:{mesh:THREE.Mesh;geometry:THREE.BufferGeometry;material:THREE.Material}[]=[];
      ramp.setMode!('skate');
      chunk.traverse(object=>{
        if(object instanceof THREE.Mesh && !Array.isArray(object.material))snapshots.push({mesh:object,geometry:object.geometry,material:object.material});
      });
      const colliders=world.colliders.len(),bodies=world.bodies.len();
      let scenery=0;
      ramp.setMode!('snowboard');
      const winterMaterials=snapshots.map(({mesh,geometry,material})=>{
        assert.equal(mesh.geometry,geometry);
        if(material.userData.surface==='scenery' && !material.userData.perChunk) {
          scenery++;assert.notEqual(mesh.material,material);
          assert.ok((mesh.material as THREE.Material).customProgramCacheKey().endsWith('|snow-coating-v1'));
        }
        return mesh.material;
      });
      assert.ok(scenery>0,`${environment.id} needs winter-compatible scenery`);
      ramp.setMode!('skate');
      for(const {mesh,geometry,material} of snapshots) {assert.equal(mesh.material,material);assert.equal(mesh.geometry,geometry);}
      ramp.setMode!('snowboard');
      snapshots.forEach(({mesh},i)=>assert.equal(mesh.material,winterMaterials[i]));
      assert.equal(world.colliders.len(),colliders);assert.equal(world.bodies.len(),bodies);
    }
  } finally {world.free();}
});
