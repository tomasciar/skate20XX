import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createRamp} from '../src/world/ramp.ts';
import {foundryPoint} from '../src/world/planning/foundryQuarter.ts';
import {landscapeHeight} from '../src/world/terrain/landscape.ts';
import {courseX} from '../src/world/terrain/course.ts';

/** Developer-only inspection of the actual authored geometry; import through the Vite server. */
export async function previewFoundry(view:'overview'|'street'|'court'|'spiral'='overview') {
  await RAPIER.init();
  const canvas=document.createElement('canvas');canvas.id='quarter-preview';canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:99999';document.body.append(canvas);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0}),ramp=createRamp(scene,world,{startPlatform:false});
  scene.updateMatrixWorld(true);ramp.renderProps?.(1);
  const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,1500);
  const point=(x:number,s:number,height=0)=>new THREE.Vector3(x+courseX(s),landscapeHeight(x,s)+height,-s).applyMatrix4(ramp.mesh.matrixWorld);
  if(view==='overview') {scene.fog=null;camera.position.copy(point(-125,300,125));camera.lookAt(point(35,425,5));}
  if(view==='street'){camera.position.copy(point(-2,245,1.7));camera.lookAt(point(35,465,8));}
  if(view==='court'){camera.position.copy(point(31,420,1.7));camera.lookAt(foundryPoint(88,10,0).applyMatrix4(ramp.mesh.matrixWorld));}
  if(view==='spiral'){scene.fog=null;camera.position.copy(foundryPoint(150,27,80).applyMatrix4(ramp.mesh.matrixWorld));camera.lookAt(foundryPoint(88,8,0).applyMatrix4(ramp.mesh.matrixWorld));}
  renderer.render(scene,camera);
  return {renderer,scene,world,ramp,camera,render(){renderer.render(scene,camera);},dispose(){
    scene.traverse(o=>{if(o instanceof THREE.Mesh&&!o.geometry.userData.shared)o.geometry.dispose();});
    world.free();renderer.dispose();canvas.remove();
  }};
}
