import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DISTRICTS, seededRandom } from '../src/world/generation.ts';
import { populateDistrict } from '../src/world/districts.ts';
import { makeHouse, makeShop, makeChapel, makeBarn, makeCabin } from '../src/world/scenery.ts';
import { LANDSCAPE_HALF_WIDTH } from '../src/world/landscape.ts';
import { createParticles, SPARK, DUST } from '../src/render/particles.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>context})}});

type Placed={object:THREE.Object3D;x:number;along:number;yaw:number};
function layout(district:(typeof DISTRICTS)[number],index:number) {
  const placed:Placed[]=[];
  const steps=populateDistrict({district,index,entering:index%4===0,rng:seededRandom(index*7919+3),
    plant:(object,x,along,yaw=0)=>placed.push({object,x,along,yaw})});
  let slices=0;for(const _ of steps){void _;slices++;}
  return {placed,slices};
}

test('every district keeps the road and footpath clear, stays on the map and builds in small slices',()=>{
  for(const district of DISTRICTS) {
    let buildings=0;
    for(let index=0;index<40;index++) {
      const {placed,slices}=layout(district,index);
      assert.ok(placed.length>25,`${district} chunk ${index} is nearly empty`);
      assert.ok(slices>=Math.floor(placed.length/3),'layout should yield between small batches');
      assert.deepEqual(placed.map(p=>[p.x,p.along,p.yaw]),layout(district,index).placed.map(p=>[p.x,p.along,p.yaw]),'layout must be reproducible');
      for(const {object,x,along} of placed) {
        const bounds=new THREE.Box3().setFromObject(object),reach=Math.hypot(Math.max(-bounds.min.x,bounds.max.x),Math.max(-bounds.min.z,bounds.max.z));
        // Street lamps stand between the guardrail and the footpath; nothing else may come nearer than the path's outer edge.
        const lamp=Math.abs(Math.abs(x)-9)<0.01;
        assert.ok(Math.abs(x)>=(lamp?8.9:11.4),`${district}: object at ${x} blocks the road or path`);
        assert.ok(Math.abs(x)<LANDSCAPE_HALF_WIDTH-20 && along>=0 && along<=70,`${district}: object off the terrain at ${x},${along}`);
        if(object.userData.placement==='pad' && reach>4) buildings++;
      }
    }
    assert.ok(buildings>0,`${district} has no architecture`);
  }
});

test('village lots face the street: front doors point at the road and nothing overlaps a neighbour',()=>{
  let houses=0;
  for(let index=0;index<60;index++) {
    const {placed}=layout('village',index);
    const lots=placed.filter(p=>p.object.userData.placement==='pad' && Math.abs(p.x)<30
      && new THREE.Box3().setFromObject(p.object).getSize(new THREE.Vector3()).x>5);
    for(const lot of lots) {
      houses++;
      // Builders face +Z; after placement that front must point back toward the centerline.
      const front=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),lot.yaw);
      assert.ok(front.x*Math.sign(lot.x)<-0.99,'building turned away from the road');
      const size=new THREE.Box3().setFromObject(lot.object).getSize(new THREE.Vector3());
      assert.ok(Math.abs(lot.x)-size.z/2>12.5,'frontage reaches the footpath');
      for(const other of lots) if(other!==lot && Math.sign(other.x)===Math.sign(lot.x)) {
        const otherSize=new THREE.Box3().setFromObject(other.object).getSize(new THREE.Vector3());
        assert.ok(Math.abs(other.along-lot.along)>(size.x+otherSize.x)/2,'neighbouring buildings overlap');
      }
    }
  }
  assert.ok(houses>150);
});

test('buildings have an entrance on the front wall and a roof over the whole footprint',()=>{
  for(const [name,build] of Object.entries({makeHouse,makeShop,makeChapel,makeBarn,makeCabin})) for(let seed=0;seed<12;seed++) {
    const building=build(seededRandom(seed));building.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(building),ray=new THREE.Raycaster();
    assert.ok(bounds.max.y>3.5 && bounds.max.y<16,`${name} height ${bounds.max.y}`);
    // Rain test: every point over the walls must hit something well above head height.
    const walls=bounds.clone().expandByScalar(-1.2);
    for(const u of [0.1,0.5,0.9]) for(const v of [0.1,0.5,0.9]) {
      ray.set(new THREE.Vector3(THREE.MathUtils.lerp(walls.min.x,walls.max.x,u),60,THREE.MathUtils.lerp(walls.min.z,-0.5,v)),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(building,true)[0];
      assert.ok(hit && hit.point.y>2.4,`${name} seed ${seed} is open to the sky`);
    }
    // Walking in from the street at door height reaches a door before any wall further back.
    let entrance=false;
    for(let x=bounds.min.x+0.5;x<bounds.max.x && !entrance;x+=0.25) {
      ray.set(new THREE.Vector3(x,1.3,bounds.max.z+3),new THREE.Vector3(0,0,-1));
      const hit=ray.intersectObject(building,true)[0];
      const color=hit && ((hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex();
      entrance=color===0x886044 || color===0x263b43 || color===0x9c3b2e;
    }
    assert.ok(entrance,`${name} seed ${seed} has no door facing the street`);
  }
});

test('particles age out, follow origin shifts and reuse a fixed pool',()=>{
  const particles=createParticles(16),at=new THREE.Vector3(1,2,3),motion=new THREE.Vector3(0,4,0);
  particles.update(1/60,800,62);assert.equal(particles.points.visible,false);
  for(let i=0;i<40;i++)particles.emit(i%2 ? SPARK : DUST,at,motion,1);
  particles.update(1/60,800,62);
  assert.equal(particles.points.visible,true);assert.equal(particles.live,16,'pool must not grow past its capacity');
  const position=particles.points.geometry.getAttribute('position'),state=particles.points.geometry.getAttribute('state');
  const before=position.getZ(0);
  particles.shift(new THREE.Vector3(0,-17,70));
  assert.ok(Math.abs(position.getZ(0)-before-70)<1e-5);
  let glowing=0;for(let i=0;i<16;i++){assert.ok(state.getY(i)>0);if(state.getX(i)<0)glowing++;}
  assert.equal(glowing,8);
  for(let i=0;i<120;i++)particles.update(1/60,800,62);
  assert.equal(particles.live,0);assert.equal(particles.points.visible,false);
  particles.emit(DUST,at,motion);particles.clear();particles.update(1/60,800,62);assert.equal(particles.live,0);
});
