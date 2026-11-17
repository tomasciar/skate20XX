import * as THREE from 'three';
import {BOARD,WHEEL_BOTTOM} from '../dimensions.ts';
import {boardMaterial,boardUVs} from '../../boards.ts';

export const SNOWBOARD={halfWidth:0.12,halfLength:0.68,baseY:WHEEL_BOTTOM} as const;
/** A twin-tip board and raised bindings under the existing stance and animation targets. */
export function createSnowboardVisual() {
  const root=new THREE.Group();root.name='snowboard';root.userData.rideSkin='snowboard';
  const material=(color:number,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness:0.6,metalness});
  const base=boardMaterial('edge'),top=boardMaterial('graphic'),steel=material(0xb7d5df,0.6),binding=boardMaterial('binding'),accent=boardMaterial('accent');
  const outline=new THREE.Shape();
  outline.moveTo(-0.12,-0.44);outline.bezierCurveTo(-0.17,-0.69,0.17,-0.69,0.12,-0.44);
  outline.quadraticCurveTo(0.115,0,0.12,0.44);outline.bezierCurveTo(0.17,0.69,-0.17,0.69,-0.12,0.44);
  outline.quadraticCurveTo(-0.115,0,-0.12,-0.44);
  function rocker(geometry:THREE.BufferGeometry) {
    const position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++)position.setY(i,position.getY(i)+Math.max(0,Math.abs(position.getZ(i))-BOARD.truckZ)*0.32);
    geometry.computeVertexNormals();return geometry;
  }
  function add(geometry:THREE.BufferGeometry,mat:THREE.Material) {
    const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;root.add(mesh);return mesh;
  }
  const core=new THREE.ExtrudeGeometry(outline,{depth:0.018,bevelEnabled:false,curveSegments:12});
  core.rotateX(-Math.PI/2);core.translate(0,SNOWBOARD.baseY+0.0006,0);add(rocker(core),base);
  const topsheet=new THREE.ShapeGeometry(outline,12);topsheet.rotateX(-Math.PI/2);topsheet.translate(0,SNOWBOARD.baseY+0.019,0);
  boardUVs(topsheet,0.145,0.68);add(rocker(topsheet),top);
  const underside=new THREE.ShapeGeometry(outline,12);underside.rotateX(Math.PI/2);underside.translate(0,SNOWBOARD.baseY,0);
  boardUVs(underside,0.145,0.68);add(rocker(underside),top);
  const box=(size:number[],mat:THREE.Material,x:number,y:number,z:number)=>{
    const mesh=add(new THREE.BoxGeometry(size[0],size[1],size[2]),mat);mesh.position.set(x,y,z);return mesh;
  };
  for(const z of [-0.255,0.255]) {
    box([0.225,0.075,0.13],binding,0,BOARD.gripY-0.0375,z);
    box([0.245,0.012,0.145],steel,0,SNOWBOARD.baseY+0.025,z);
    box([0.02,0.15,0.135],binding,-0.105,0.045,z);
    for(const offset of [-0.045,0.045])box([0.12,0.016,0.022],accent,0.01,0.085,z+offset);
  }
  return root;
}
