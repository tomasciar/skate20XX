import * as THREE from 'three';
import {BOARD} from '../dimensions.ts';
import {boardMaterial,boardUVs} from '../../boards.ts';
import {createSnowboardVisual} from './snowboardVisual.ts';
import {createBoardShape} from './boardShape.ts';
import type {BoardStyleId} from '../../boards.ts';
import {visualMaterial as mat,meshPart as mesh,boxPart as box,batchStaticMeshes} from './parts.ts';

/** Build board geometry and its animated wheel groups; appearance and posing are separate. */
export function createBoardVisual() {
  const board=new THREE.Group(),deck=new THREE.Group();board.add(deck);
  const skateDeck=new THREE.Group(),skateGear=new THREE.Group();
  skateDeck.userData.rideSkin=skateGear.userData.rideSkin='skate';
  // Board hardware sits in its own groups so a cloud-shaped design can hide it without touching ride-mode visibility.
  const deckHardware=new THREE.Group(),gearHardware=new THREE.Group();
  deckHardware.userData.boardShape=gearHardware.userData.boardShape='hardware';
  deck.add(deckHardware);board.add(gearHardware);deckHardware.add(skateDeck);gearHardware.add(skateGear);
  const alternate=createBoardShape();
  if(alternate)deck.add(alternate.root);
  let activeShape:typeof alternate|undefined;
  function selectShape(style:BoardStyleId) {
    activeShape?.reset();
    activeShape=alternate?.root.userData.boardShape===style?alternate:undefined;
  }
  const grip=boardMaterial('grip'),maple=boardMaterial('edge'),orange=boardMaterial('accent'),graphic=boardMaterial('graphic');
  const steel=mat(0xaab9bf,0.3,0.8),rubber=boardMaterial('wheel');
  // Rounded maple deck with a separate grip surface and lifted nose/tail.
  const outline = new THREE.Shape();
  outline.moveTo(-0.105, -0.28); outline.lineTo(-0.105, 0.28);
  outline.bezierCurveTo(-0.105, 0.44, 0.105, 0.44, 0.105, 0.28);
  outline.lineTo(0.105, -0.28); outline.bezierCurveTo(0.105, -0.44, -0.105, -0.44, -0.105, -0.28);
  const deckGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.018, bevelEnabled: false, curveSegments: 10 });
  deckGeo.rotateX(-Math.PI / 2); deckGeo.translate(0, -0.009, 0);
  const positions = deckGeo.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + Math.max(0, Math.abs(positions.getZ(i)) - 0.27) * 0.3);
  deckGeo.computeVertexNormals(); mesh(skateDeck, deckGeo, maple);
  const gripGeo = new THREE.ShapeGeometry(outline, 10); gripGeo.rotateX(-Math.PI / 2);
  const gp = gripGeo.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setY(i, 0.011 + Math.max(0, Math.abs(gp.getZ(i)) - 0.27) * 0.3);
  gripGeo.computeVertexNormals();boardUVs(gripGeo,0.105,0.44);mesh(skateDeck, gripGeo, grip);
  const underside=new THREE.ShapeGeometry(outline,10);underside.rotateX(Math.PI/2);
  const undersidePositions=underside.getAttribute('position');
  for(let i=0;i<undersidePositions.count;i++)undersidePositions.setY(i,-0.0096+Math.max(0,Math.abs(undersidePositions.getZ(i))-0.27)*0.3);
  underside.computeVertexNormals();boardUVs(underside,0.105,0.44);mesh(skateDeck,underside,graphic);
  box(skateDeck, [0.13, 0.004, 0.38], orange, 0, -0.021, 0);
  const wheels: THREE.Object3D[] = [];
  for (const z of [-BOARD.truckZ, BOARD.truckZ]) {
    box(skateDeck, [0.08, 0.014, 0.08], steel, 0, -0.025, z);
    box(skateGear, [0.19, 0.025, 0.035], steel, 0, BOARD.hangerY, z);
    for (const x of [-BOARD.wheelX, BOARD.wheelX]) {
      for (const dz of [-0.025, 0.025]) mesh(skateDeck, new THREE.SphereGeometry(0.006, 6, 4), steel, x * 0.6, 0.016, z + dz);
      const spin = new THREE.Group(); spin.position.set(x, BOARD.wheelY, z); skateGear.add(spin);
      mesh(spin, new THREE.CylinderGeometry(BOARD.wheelRadius, BOARD.wheelRadius, 0.032, 24), rubber).rotation.z = Math.PI / 2;
      mesh(spin, new THREE.CylinderGeometry(0.012, 0.012, 0.034, 10), steel).rotation.z = Math.PI / 2;
      box(spin, [0.034, 0.009, 0.025], orange, 0, 0.027, 0);
      wheels.push(spin);
    }
  }
  batchStaticMeshes(skateDeck); batchStaticMeshes(skateGear);
  const snowboard=createSnowboardVisual();batchStaticMeshes(snowboard);deckHardware.add(snowboard);
  return {board,deck,wheels,selectShape,get activeShape(){return activeShape;},accent:orange};
}
export type BoardVisual=ReturnType<typeof createBoardVisual>;
