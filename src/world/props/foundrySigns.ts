import * as THREE from 'three';
import {facadeMaterial,surface} from '../rendering/appearance.ts';

const LABELS=['FOUNDRY QUARTER','MARKET COURT','PARKING','WAY OUT'] as const;
let atlas:{material:THREE.MeshStandardMaterial;geometry:THREE.PlaneGeometry[]}|undefined;
/** One small atlas gives this authored place a consistent identity, rather than unrelated shop labels. */
export function makeFoundrySign(label:0|1|2|3,width:number) {
  if(!atlas) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const g=canvas.getContext('2d')!;
    g.fillStyle='#285b60';g.fillRect(0,0,512,256);g.fillStyle='#f0dfb9';g.font='bold 31px sans-serif';g.textAlign='center';g.textBaseline='middle';
    LABELS.forEach((text,i)=>{g.fillText(text,256,i*64+32);g.fillRect(14,i*64+7,484,2);g.fillRect(14,i*64+55,484,2);});
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const material=facadeMaterial(surface(new THREE.MeshStandardMaterial({map,roughness:.85}),'scenery'));
    const geometry=LABELS.map((_,row)=>{
      const plane=new THREE.PlaneGeometry();plane.userData.shared=true;const uv=plane.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setY(i,(uv.getY(i)+3-row)/4);return plane;
    });
    atlas={material,geometry};
  }
  const mesh=new THREE.Mesh(atlas.geometry[label],atlas.material);mesh.scale.set(width,width/8,1);mesh.name='foundry-wayfinding';mesh.userData.collision=false;return mesh;
}
