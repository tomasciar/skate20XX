import * as THREE from 'three';
import {RIDER} from '../dimensions.ts';
import {characterProportions,characterHasShorts} from '../characters/catalog.ts';
import type {CharacterId} from '../characters/catalog.ts';
import {CHARACTER_MODELS} from '../characters/registry.ts';
import type {RagdollRig,RagdollPart,RagdollJoint} from '../movement/ragdoll.ts';
import type {RiderRig} from './riderRig.ts';

/** Snapshot the current model's articulated pose, mass and fitted crash shapes. */
export function captureRiderRagdoll(root:THREE.Group,rig:RiderRig,character:CharacterId):RagdollRig {
  const {hips,pelvis,hipDetails,torso,chest,head,arms,legs}=rig;
  const {bodyScale,armScale,legScale,hipWidth}=characterProportions(character);
  root.updateMatrixWorld(true);
  const parts: RagdollPart[] = [], joints: RagdollJoint[] = [];
  const point = (object: THREE.Object3D, x = 0, y = 0, z = 0) => object.localToWorld(new THREE.Vector3(x,y,z));
  const part = (id: string, reference: THREE.Object3D, center: THREE.Vector3, objects: THREE.Object3D[], mass: number, shape: RagdollPart['shape']) => {
    // Crash colliders follow the captured anatomy. Normal riding uses the unchanged board solver.
    if(bodyScale!==1&&!id.startsWith('foot')) {
      if(shape.kind==='box')shape.half.multiplyScalar(bodyScale);
      else {shape.radius*=bodyScale;if(shape.kind==='capsule')shape.length*=bodyScale;}
    }
    parts.push({ id, center, rotation: reference.getWorldQuaternion(new THREE.Quaternion()), objects, mass, shape });
  };
  const stocky=character==='peter',build=characterProportions(character);
  const anatomy=CHARACTER_MODELS[character].ragdoll,torsoShape=anatomy?.torso,headShape=anatomy?.head;
  const limbWidths=stocky||anatomy?.matchLimbWidths;
  part('pelvis', pelvis, pelvis.getWorldPosition(new THREE.Vector3()), [pelvis,hipDetails], 12,
    { kind: 'capsule', length: .3*build.pelvisWidth, radius: .10*build.pelvisDepth });
  const torsoObjects = torso.children.filter(o => o.userData.characterAttachment || o instanceof THREE.Mesh && (!o.name || o===chest));
  part('torso', torso, torsoShape?point(torso,...torsoShape.center):point(torso,0,0.23,stocky?-.03:0), torsoObjects, 24,
    { kind: 'box', half: torsoShape?new THREE.Vector3(...torsoShape.half):stocky?new THREE.Vector3(.29,.23,.22):new THREE.Vector3(.15,.18,.09) });
  part('head', head, headShape?point(head,...headShape.center):point(head), [head], 5,
    headShape?.length!==undefined?{kind:'capsule',radius:headShape.radius,length:headShape.length}
      :{ kind: 'ball', radius: headShape?.radius??(stocky?.143:.115) });
  joints.push({ a: 'pelvis', b: 'torso', anchor: point(torso,0,0.08), kind: 'ball' },
    { a: 'torso', b: 'head', anchor: point(torso,0,0.44), kind: 'ball' });
  const hinge = (a: string, b: string, start: THREE.Vector3, middle: THREE.Vector3, end: THREE.Vector3) => {
    const upper = middle.clone().sub(start).normalize(), lower = end.clone().sub(middle).normalize();
    const axis = new THREE.Vector3().crossVectors(upper, lower).normalize();
    if (axis.lengthSq() < 0.1) axis.set(1,0,0).applyQuaternion(root.quaternion);
    joints.push({ a,b, anchor: middle, kind: 'hinge', axis, flex: Math.acos(THREE.MathUtils.clamp(upper.dot(lower),-1,1)) });
  };
  for (const a of arms) {
    const id = `arm${a.side}`, fore = `fore${a.side}`, handId = `hand${a.side}`;
    const shoulder = point(a.shoulder), elbow = point(a.elbow), wrist = point(a.hand);
    part(id, a.upper, a.upper.getWorldPosition(new THREE.Vector3()), [a.upper,a.sleeve,a.shoulder], 2.5, { kind: 'capsule', length: 0.25*armScale, radius: 0.04*(limbWidths?build.upperarm:1) });
    part(fore, a.fore, a.fore.getWorldPosition(new THREE.Vector3()), [a.fore,a.elbow], 1.5, { kind: 'capsule', length: 0.24*armScale, radius: 0.03*(limbWidths?build.forearm:1) });
    part(handId, a.hand, wrist, [a.hand], 0.5, { kind: 'ball', radius: 0.035*(limbWidths?build.hand:1) });
    joints.push({ a:'torso',b:id,anchor:shoulder,kind:'ball' }, { a:fore,b:handId,anchor:wrist,kind:'fixed' });
    hinge(id,fore,shoulder,elbow,wrist);
  }
  for (const l of legs) {
    const thigh = `thigh${l.side}`, shin = `shin${l.side}`, foot = `foot${l.side}`;
    const hip = point(hips,l.side*0.095*hipWidth), knee = point(l.knee), ankle = point(l.foot,0,0.06);
    part(thigh,l.thigh,l.thigh.getWorldPosition(new THREE.Vector3()),[l.thigh],7,{kind:'capsule',length:RIDER.upperLeg*legScale,radius:characterHasShorts(character)?.045:0.065*(character==='kick'?1.2535:limbWidths?build.thigh:1)});
    part(shin,l.shin,l.shin.getWorldPosition(new THREE.Vector3()),[l.shin,l.knee],4,{kind:'capsule',length:RIDER.lowerLeg*legScale,radius:characterHasShorts(character)?.033:0.05*(character==='kick'?1.311:limbWidths?build.shin:1)});
    part(foot,l.foot,point(l.foot,0,0.025,-0.02),[l.foot],1,{kind:'box',half:new THREE.Vector3(0.06,0.045,0.12)});
    joints.push({a:'pelvis',b:thigh,anchor:hip,kind:'ball'}, {a:shin,b:foot,anchor:ankle,kind:'fixed'});
    hinge(thigh,shin,hip,knee,ankle);
  }
  return { parts,joints,visualScale:bodyScale };
}
