import * as THREE from 'three';
import {CHARACTERS,applyCharacterSkin} from '../characters.ts';
import type {CharacterId} from '../characters.ts';
import {applyRideSkin} from '../mode.ts';
import type {RideMode} from '../mode.ts';

/** Inspect the actual head using the existing renderer; no second WebGL context or per-frame work. */
export function createRiderPortrait(renderer:THREE.WebGLRenderer,rider:THREE.Object3D) {
  const image=document.getElementById('rider-portrait') as HTMLImageElement,title=document.getElementById('rider-portrait-name')!;
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=224;
  const context=canvas.getContext('2d');
  const source=rider.getObjectByName('head')!,head=source.clone(true);head.position.set(0,0,0);head.quaternion.identity();head.scale.set(1,1,1);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x263a46);scene.add(head,new THREE.AmbientLight(0xffffff,1.7));
  const key=new THREE.DirectionalLight(0xfff0d7,2.4);key.position.set(-2,4,-3);scene.add(key);
  const camera=new THREE.OrthographicCamera(-.28,.28,.327,-.327,.01,10);camera.position.set(0,.065,-3);camera.lookAt(0,.065,0);
  const viewport=new THREE.Vector4(),scissor=new THREE.Vector4();
  function refresh(character:CharacterId,mode:RideMode) {
    applyRideSkin(head,mode);applyCharacterSkin(head,character);
    const info=CHARACTERS.find(item=>item.id===character)!;
    const modelName='modelName' in info?info.modelName:info.name;
    image.alt=`${modelName}: actual 3D face close-up`;title.textContent=info.name;
    if(!context || image.getClientRects().length===0)return;
    renderer.getViewport(viewport);renderer.getScissor(scissor);
    const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,ratio=renderer.getPixelRatio();
    const width=Math.min(canvas.width,renderer.domElement.width),height=Math.min(canvas.height,renderer.domElement.height);
    if(width<=0||height<=0)return;
    try {
      renderer.setViewport(0,0,width/ratio,height/ratio);renderer.setScissor(0,0,width/ratio,height/ratio);renderer.setScissorTest(true);renderer.autoClear=true;
      renderer.render(scene,camera);
      context.clearRect(0,0,canvas.width,canvas.height);
      context.drawImage(renderer.domElement,0,renderer.domElement.height-height,width,height,0,0,canvas.width,canvas.height);
      image.src=canvas.toDataURL('image/png');
    } finally {
      renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;
    }
  }
  return {refresh};
}
