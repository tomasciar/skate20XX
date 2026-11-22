import * as THREE from 'three';
import {sceneryMaterial} from '../props/variety.ts';
import {architecturalFinish,prepareArchitectureFinish} from '../rendering/architectureFinish.ts';
import {COURSE_STEP} from '../terrain/course.ts';

export const sharedGeometry=<T extends THREE.BufferGeometry>(geometry:T)=>{geometry.userData.shared=true;return geometry;};
const cube=sharedGeometry(new THREE.BoxGeometry());
export const LANDMARK_MATERIALS={
  brick:architecturalFinish(sceneryMaterial(0xb57457,0,.95,'paint'),'brick'),
  concrete:architecturalFinish(sceneryMaterial(0xaaa99c,0,.92,'stone'),'concrete'),
  trim:architecturalFinish(sceneryMaterial(0xe5decc,0,.85,'trim'),'stone'),
  steel:architecturalFinish(sceneryMaterial(0x40525b,.35,.7,'metal'),'metal'),
  roof:architecturalFinish(sceneryMaterial(0x596c70,.15,.85,'roof'),'metal'),
  glass:architecturalFinish(sceneryMaterial(0x467685,.25,.42,'glass'),'glass'),
  paint:sceneryMaterial(0x587b78,0,.88,'paint'),
  deck:architecturalFinish(sceneryMaterial(0x87867b,0,.94,'stone'),'concrete'),
  setts:architecturalFinish(sceneryMaterial(0xaa8e76,0,.96,'stone'),'setts'),
  dark:sceneryMaterial(0x34494e,0,.86,'accent'),
};

/** Curated finishes survive visual variation, then join the ordinary tint/material batches. */
export function landmarkPart(geometry:THREE.BufferGeometry,material:THREE.MeshStandardMaterial,decorative=false) {
  prepareArchitectureFinish(material);
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.sceneryTint=material.color.getHex();
  if(decorative)mesh.userData.collision=false;return mesh;
}

export function landmarkBox(material:THREE.MeshStandardMaterial,size:readonly number[],at:readonly number[],decorative=false,warp=false) {
  const geometry=warp?new THREE.BoxGeometry(size[0],size[1],size[2],1,1,Math.max(1,Math.ceil(size[2]!/COURSE_STEP))):cube;
  const mesh=landmarkPart(geometry,material,decorative);
  if(!warp)mesh.scale.set(size[0]!,size[1]!,size[2]!);
  mesh.position.set(at[0]!,at[1]!,at[2]!);return mesh;
}
