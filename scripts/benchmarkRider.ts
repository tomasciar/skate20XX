import * as THREE from 'three';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {CHARACTERS} from '../src/player/characters/catalog.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const scene=new THREE.Scene(),start=performance.now(),rider=createSkaterVisual();
const coldConstructionMs=performance.now()-start;scene.add(rider.root);
const objects=()=>{let count=0;scene.traverse(()=>count++);return count;};
const initialObjects=objects(),pose={dt:1/60,speed:35,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,
  airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
function animate(frame:number) {
  pose.lean=Math.sin(frame*.01)*.5;pose.wheelRoll=frame*.1;
  rider.setPose(pose);scene.updateMatrixWorld(true);
}
for(let frame=0;frame<240;frame++)animate(frame);
const samples:number[]=[];
for(let frame=0;frame<3600;frame++) {
  const before=performance.now();animate(frame);samples.push(performance.now()-before);
}
samples.sort((a,b)=>a-b);
for(const {id} of CHARACTERS)rider.setCharacter(id);
rider.setCharacter('boy');
const head=rider.root.getObjectByName('character-head-boy')!;
console.log(JSON.stringify({coldConstructionMs,initialObjects,objectsAfterVisitingRoster:objects(),
  meanPoseAndMatrixMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95PoseAndMatrixMs:samples[Math.floor(samples.length*.95)],
  p99PoseAndMatrixMs:samples[Math.floor(samples.length*.99)],selectedHead:head.name,
  note:'CPU authoring, animation and scene-matrix work only; excludes browser/GPU rendering. Cold construction includes first-use/JIT work.'},null,2));
