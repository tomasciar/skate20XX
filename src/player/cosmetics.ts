import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Bake small rigid details into one draw call. Shared across looks; no textures or extra shaders.
const cosmeticMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.76});
export function batchCosmetics(group:THREE.Group) {
  const geometries:THREE.BufferGeometry[]=[];
  for(const child of [...group.children]) {
    if(!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.userData.faceArtwork)continue;
    const material=child.material as THREE.MeshStandardMaterial;
    child.updateMatrix();
    const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    for(const attribute of Object.keys(geometry.attributes))if(attribute!=='position' && attribute!=='normal')geometry.deleteAttribute(attribute);
    if(!geometry.hasAttribute('normal'))geometry.computeVertexNormals();
    const count=geometry.getAttribute('position').count,colors=new Float32Array(count*3);
    for(let i=0;i<count;i++)material.color.toArray(colors,i*3);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometries.push(geometry);group.remove(child);child.geometry.dispose();
  }
  if(!geometries.length)return;
  const geometry=mergeGeometries(geometries);
  geometries.forEach(item=>item.dispose());
  if(geometry){const mesh=new THREE.Mesh(geometry,cosmeticMaterial);mesh.castShadow=true;group.add(mesh);}
}
