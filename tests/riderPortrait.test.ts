import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {createRiderPortrait} from '../src/ui/riderPortrait.ts';

test('paused portraits share the actual head materials and restore renderer state after capture or errors',()=>{
  const originalDocument=globalThis.document,image={src:'',alt:'',getClientRects:()=>[{}]},title={textContent:''};let copies=0,rendered:THREE.Scene|undefined,fail=false;
  const canvas={width:0,height:0,getContext:()=>({clearRect(){},drawImage(...args:unknown[]){copies++;assert.equal(args[2],496);}}),toDataURL:()=> 'data:image/png;base64,portrait'};
  Object.assign(globalThis,{document:{getElementById:(id:string)=>id==='rider-portrait'?image:title,createElement:()=>canvas}});
  const viewport=new THREE.Vector4(2,3,640,480),scissor=new THREE.Vector4(4,5,320,240),originalViewport=viewport.clone(),originalScissor=scissor.clone();
  let scissorTest=false;
  const renderer={autoClear:false,domElement:{width:1280,height:720},getPixelRatio:()=>1.5,
    getViewport:(out:THREE.Vector4)=>out.copy(viewport),getScissor:(out:THREE.Vector4)=>out.copy(scissor),getScissorTest:()=>scissorTest,
    setScissorTest:(enabled:boolean)=>{scissorTest=enabled;},
    setViewport:(x:number|THREE.Vector4,y?:number,z?:number,w?:number)=>{if(x instanceof THREE.Vector4)viewport.copy(x);else viewport.set(x,y!,z!,w!);},
    setScissor:(x:number|THREE.Vector4,y?:number,z?:number,w?:number)=>{if(x instanceof THREE.Vector4)scissor.copy(x);else scissor.set(x,y!,z!,w!);},
    render:(scene:THREE.Scene)=>{rendered=scene;if(fail)throw Error('render failed');},
  };
  try {
    const rider=createSkaterVisual(),portrait=createRiderPortrait(renderer as never,rider.root);
    rider.setCharacter('girl');portrait.refresh('girl','skate');
    assert.equal(image.src,'data:image/png;base64,portrait');assert.equal(title.textContent,'Girl');assert.equal(copies,1);
    assert.ok(image.alt.includes('3D face'));assert.ok(viewport.equals(originalViewport)&&scissor.equals(originalScissor));
    assert.equal(scissorTest,false);assert.equal(renderer.autoClear,false);
    assert.equal(rendered!.getObjectByName('character-head-girl')!.visible,true);
    const source=rider.root.getObjectByName('character-head-girl')!,preview=rendered!.getObjectByName(source.name)!;
    assert.equal((source.children[0] as THREE.Mesh).geometry,(preview.children[0] as THREE.Mesh).geometry);
    image.getClientRects=()=>[];portrait.refresh('boy','skate');assert.equal(copies,1,'hidden previews should not render');image.getClientRects=()=>[{}];
    fail=true;assert.throws(()=>portrait.refresh('boy','snowboard'),/render failed/);
    assert.ok(viewport.equals(originalViewport)&&scissor.equals(originalScissor));assert.equal(scissorTest,false);assert.equal(renderer.autoClear,false);
  } finally {if(originalDocument)globalThis.document=originalDocument;else delete (globalThis as Record<string,unknown>).document;}
});
