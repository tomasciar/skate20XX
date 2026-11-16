import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FACE_ARTWORK,faceMaterial,createFaceArtwork,preloadCharacterFace} from '../src/player/faceArtwork.ts';
import {headGeometry} from '../src/player/modelGeometry.ts';

test('each named character ships separate transparent facial artwork and a distinct fallback',()=>{
  const images=new Set<string>(),fallbacks=new Set<string>();
  for(const id of ['goku','naruto','kick'] as const) {
    const png=readFileSync(new URL(FACE_ARTWORK[id].url));assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png[25],6,'face artwork must retain its RGBA transparency');assert.ok(png.byteLength<400_000);
    images.add(png.toString('base64'));
    const material=faceMaterial(id);assert.equal(material,faceMaterial(id));assert.equal(material.userData.faceArtwork,id);
    assert.ok(material.transparent && !material.depthWrite && !material.toneMapped);assert.ok(material.alphaTest>0);
    const texture=material.map as THREE.DataTexture;assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
    assert.ok(texture.image.data.some((value:number,index:number)=>index%4===3&&value===0));
    assert.ok(texture.image.data.some((value:number,index:number)=>index%4===3&&value===255));
    fallbacks.add(Buffer.from(texture.image.data).toString('base64'));
  }
  assert.equal(images.size,3);assert.equal(fallbacks.size,3);
});

test('curved face projections retain UVs, face outwards and sit above unique head geometry',()=>{
  const profiles=new Set<string>();
  for(const id of ['goku','naruto','kick'] as const) {
    const head=headGeometry(id),art=createFaceArtwork(id),normal=art.geometry.getAttribute('normal'),positions=art.geometry.getAttribute('position'),uv=art.geometry.getAttribute('uv');
    head.computeBoundingBox();profiles.add(JSON.stringify(head.boundingBox));
    assert.equal(art.material,faceMaterial(id));assert.equal(art.castShadow,false);assert.equal(uv.count,positions.count);
    for(let i=0;i<positions.count;i++) {
      assert.ok(Number.isFinite(positions.getX(i))&&Number.isFinite(positions.getY(i))&&Number.isFinite(positions.getZ(i)));
      assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
    }
    const center=Math.floor(positions.count/2);assert.ok(normal.getZ(center)<0,'face decal must face out of the head');
    const base=new THREE.Mesh(head,new THREE.MeshBasicMaterial()),root=new THREE.Group();root.add(base,art);root.updateMatrixWorld(true);
    assert.equal(new THREE.Raycaster(new THREE.Vector3(.035,-.002,-.4),new THREE.Vector3(0,0,1)).intersectObjects([base,art],false)[0]!.object,art);
  }
  assert.equal(profiles.size,3,'Goku, Naruto and Kick must not share the same face shape');
});

test('face loading is lazy, coalesced, downsized and shared with crash clones; failures keep the fallback',async()=>{
  const originalLoad=THREE.TextureLoader.prototype.load,oldDocument=globalThis.document;
  let downloads=0,draws=0;const canvas={width:0,height:0,getContext:()=>({drawImage(){draws++;},imageSmoothingEnabled:false,imageSmoothingQuality:''})};
  Object.assign(globalThis,{document:{createElement:()=>canvas}});
  THREE.TextureLoader.prototype.load=function(_url,onLoad) {
    downloads++;const texture=new THREE.Texture({width:2048,height:1024} as never);
    queueMicrotask(()=>onLoad?.(texture as never));return texture as never;
  };
  try {
    const face=createFaceArtwork('goku'),clone=face.clone();
    const first=preloadCharacterFace('goku'),second=preloadCharacterFace('goku');assert.equal(first,second);
    await first;assert.equal(downloads,1);assert.equal(draws,1);assert.equal(canvas.width,512);assert.equal(canvas.height,256);
    assert.equal(face.material,clone.material);assert.equal((face.material as THREE.MeshBasicMaterial).map!.image,canvas);
    await preloadCharacterFace('goku');await preloadCharacterFace('boy');assert.equal(downloads,1);
    const fallback=faceMaterial('naruto').map;
    THREE.TextureLoader.prototype.load=function(_url,_onLoad,_progress,onError){downloads++;queueMicrotask(()=>onError?.(new Error('unavailable')));return new THREE.Texture() as never;};
    await preloadCharacterFace('naruto');assert.equal(faceMaterial('naruto').map,fallback);
    await preloadCharacterFace('naruto');assert.equal(downloads,3,'failed loads must be retryable');
  } finally {THREE.TextureLoader.prototype.load=originalLoad;if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;}
});
