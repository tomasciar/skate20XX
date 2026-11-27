import * as THREE from 'three';
import {sweptLockGeometry} from './geometry.ts';

type Point=readonly[number,number,number];
function tuft(parent:THREE.Group,material:THREE.Material,root:Point,bend:Point,tip:Point,width:number,depth:number,rings=9,sides=10) {
  const mesh=new THREE.Mesh(sweptLockGeometry(root,bend,tip,width,depth,rings,sides),material);parent.add(mesh);
}
export function addPonytail(parent:THREE.Group,hair:THREE.Material,accent:THREE.Material) {
  tuft(parent,hair,[0,.004,.1],[.029,-.086,.172],[.01,-.191,.171],.071,.06);
  const tie=new THREE.Mesh(new THREE.TorusGeometry(.031,.007,6,16),accent);tie.position.set(0,-.012,.119);tie.rotation.x=.5;parent.add(tie);
  for(const side of [-1,1])tuft(parent,hair,[side*.078,.018,.006],[side*.089,-.025,.012],[side*.073,-.065,.027],.024,.026);
}
