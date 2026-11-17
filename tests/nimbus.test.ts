import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNimbusVisual} from '../src/player/visuals/nimbusVisual.ts';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';

test('Nimbus has a compact trail at full speed in either stance',()=>{
  for(const side of [1,-1]) {
    const cloud=createNimbusVisual(),body=cloud.root.getObjectByName('nimbus-body')!,tail=cloud.root.getObjectByName('nimbus-tail')!;
    for(let i=0;i<240;i++)cloud.update(1/60,90,side);
    const bodyBounds=new THREE.Box3().setFromObject(body),tailBounds=new THREE.Box3().setFromObject(tail);
    const extension=side>0?tailBounds.max.z-bodyBounds.max.z:bodyBounds.min.z-tailBounds.min.z;
    assert.ok(extension>.12 && extension<.36,`tail should remain a short visible wisp, got ${extension}`);
    assert.ok(new THREE.Box3().setFromObject(cloud.root).getSize(new THREE.Vector3()).z<1.45);
  }
});

test('stance changes turn a connected tail smoothly without collapsing or reflecting its geometry',()=>{
  const cloud=createNimbusVisual(),tail=cloud.root.getObjectByName('nimbus-tail')!,body=cloud.root.getObjectByName('nimbus-body')!;
  for(let i=0;i<120;i++)cloud.update(1/60,70,1);
  for(const side of [-1,1,-1])for(let i=0;i<120;i++) {
    const previous=tail.quaternion.clone();cloud.update(1/60,70,side);cloud.root.updateMatrixWorld(true);
    assert.ok(tail.quaternion.angleTo(previous)<.4,'tail direction should ease rather than snap');
    assert.ok(tail.matrixWorld.determinant()>.5,'tail must keep positive volume through a reversal');
    assert.ok(new THREE.Box3().setFromObject(body).intersectsBox(new THREE.Box3().setFromObject(tail)),'tail root should stay connected');
  }
});

test('rounded cloud lobes use smooth normals and share cached geometry without sharing animation state',()=>{
  const a=createNimbusVisual(),b=createNimbusVisual();
  const meshes=(root:THREE.Object3D)=>{const result:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)result.push(o);});return result;};
  const first=meshes(a.root),second=meshes(b.root);let triangles=0,vertices=0;
  for(let i=0;i<first.length;i++) {
    assert.equal(first[i].geometry,second[i].geometry);assert.equal(first[i].material,second[i].material);
    triangles+=(first[i].geometry.index?.count??first[i].geometry.getAttribute('position').count)/3;
    vertices+=first[i].geometry.getAttribute('position').count;
  }
  assert.equal(first.length,4);assert.ok(triangles<6000);assert.ok(vertices<4500);
  const geometry=first[0].geometry,normal=geometry.getAttribute('normal'),index=geometry.index!;
  let smooth=0;
  for(let i=0;i<index.count;i+=3) {
    const n=new THREE.Vector3().fromBufferAttribute(normal,index.getX(i));
    if(n.distanceTo(new THREE.Vector3().fromBufferAttribute(normal,index.getX(i+1)))>.001)smooth++;
  }
  assert.ok(smooth>index.count/3*.8,'lobe normals should vary smoothly across triangle corners');
  for(let i=0;i<120;i++)a.update(1/60,90,-1);
  assert.equal(b.root.getObjectByName('nimbus-tail')!.rotation.y,0);
  a.reset();assert.ok(a.root.getObjectByName('nimbus-tail')!.quaternion.angleTo(b.root.getObjectByName('nimbus-tail')!.quaternion)<1e-8);
});

test('airborne spins keep the last trail direction instead of reversing a switch takeoff',()=>{
  const visual=createSkaterVisual('skate','goku','nimbus'),tail=visual.root.getObjectByName('nimbus-tail')!;
  const pose={dt:1/60,speed:40,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
  for(let i=0;i<120;i++)visual.setPose({...pose,travelSide:-1});
  for(let i=0;i<120;i++) {
    visual.setPose({...pose,airborne:true,travelSide:1,boardSpin:{x:0,y:i/120*Math.PI*2,z:0}});
    assert.ok(Math.cos(tail.rotation.y)<-.99,'a spin should not force the trailing cloud to swap ends');
  }
  visual.setBoardStyle('classic');visual.setBoardStyle('nimbus');
  assert.equal(tail.rotation.y,0,'reselecting Nimbus should clear an old trail pose');
});
