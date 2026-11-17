import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {REFINED_FACE_ARTWORK,createRefinedFaceArtwork,refinedFaceSurface} from '../src/player/refinedFaceArtwork.ts';
import {preloadCharacterFace,hasFaceArtwork} from '../src/player/faceArtwork.ts';

test('the seven generated decals ship RGBA originals and recorded references, without changing the two native-only guests',()=>{
  const record=JSON.parse(readFileSync(new URL('../src/assets/faces/refinement-generation.json',import.meta.url),'utf8'));
  const originals=new Set<string>();
  for(const [id,d] of Object.entries(REFINED_FACE_ARTWORK)) {
    const bytes=readFileSync(new URL(d.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.equal(bytes[25],6,`${id}: transparent RGBA source is required`);
    assert.ok(bytes.byteLength<1_500_000);originals.add(bytes.toString('base64'));
    const prompt=record.prompts.find((p:{id:string})=>p.id===id);
    assert.equal(prompt.status,'generated');assert.ok(prompt.references.length>0);assert.ok(prompt.prompt.includes('transparent'));
  }
  assert.equal(originals.size,7);assert.equal(hasFaceArtwork('mj'),false);assert.equal(hasFaceArtwork('spiderman'),false);
});

test('generated features follow the modeled face, including the projecting cartoon eyes and nose',()=>{
  for(const id of Object.keys(REFINED_FACE_ARTWORK) as (keyof typeof REFINED_FACE_ARTWORK)[]) {
    const art=createRefinedFaceArtwork(id),p=art.geometry.getAttribute('position'),uv=art.geometry.getAttribute('uv');
    assert.equal(p.count,uv.count);assert.equal(art.castShadow,false);
    assert.equal(art.material.toneMapped,false,'light-colored facial art must not repaint the skin through exposure');
    for(let i=0;i<p.count;i++) {
      assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
      assert.ok(Math.abs(p.getZ(i)-(refinedFaceSurface(p.getX(i),p.getY(i),id)-.0035))<1e-6);
      assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
    }
  }
});

test('one selected decal load updates native fallbacks and shared portrait/crash materials, while failures stay retryable',async()=>{
  const oldDocument=globalThis.document,originalLoad=THREE.TextureLoader.prototype.load;
  const urls:string[]=[];let fail=false;
  Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},imageSmoothingEnabled:false,imageSmoothingQuality:''})})}});
  THREE.TextureLoader.prototype.load=function(url,onLoad,_progress,onError) {
    urls.push(url);const t=new THREE.Texture({width:2048,height:1024} as never);
    queueMicrotask(()=>fail?onError?.(new Error('offline')):onLoad?.(t as never));return t as never;
  };
  try {
    const rider=createSkaterVisual('skate','bart'),source=rider.root.getObjectByName('character-head-bart')!,clone=source.clone(true);
    const art=source.getObjectByName('face-artwork-bart') as THREE.Mesh;
    const fallback=source.getObjectByName('face-fallback-bart')!.children[0] as THREE.Mesh;
    assert.equal(art.material.visible,false);assert.equal(fallback.material.visible,true);assert.equal(urls.length,0,'constructing all looks must not fetch all artwork');
    const first=preloadCharacterFace('bart'),second=preloadCharacterFace('bart');assert.equal(first,second);await first;
    assert.equal(urls.length,1);assert.equal(art.material.visible,true);assert.equal(fallback.material.visible,false);
    assert.equal((clone.getObjectByName('face-artwork-bart') as THREE.Mesh).material,art.material);
    assert.equal((clone.getObjectByName('face-fallback-bart')!.children[0] as THREE.Mesh).material.visible,false);
    const map=(art.material as THREE.MeshBasicMaterial).map!;assert.equal(map.image.width,512);assert.equal(map.image.height,256);assert.equal(map.colorSpace,THREE.SRGBColorSpace);
    await preloadCharacterFace('bart');await preloadCharacterFace('mj');assert.equal(urls.length,1);
    const light=createSkaterVisual('skate','light'),lightArt=light.root.getObjectByName('face-artwork-light') as THREE.Mesh,
      native=light.root.getObjectByName('face-fallback-light')!.children[0] as THREE.Mesh;
    fail=true;await preloadCharacterFace('light');assert.equal(lightArt.material.visible,false);assert.equal(native.material.visible,true);
    fail=false;await preloadCharacterFace('light');assert.equal(urls.length,3);assert.equal(lightArt.material.visible,true);assert.equal(native.material.visible,false);
  } finally {THREE.TextureLoader.prototype.load=originalLoad;if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;}
});
