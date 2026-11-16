import * as THREE from 'three';

export type EmblemStroke={points:readonly(readonly[number,number])[];width:number};
const points=(path:THREE.Path)=>path.getPoints(8).map(point=>[point.x,point.y] as const);

/** Normalized, front-readable contours. Both gi patches use the same complete 亀 character. */
export function turtleSchoolStrokes():EmblemStroke[] {
  const crown=new THREE.Path();crown.moveTo(-.03,.87);crown.quadraticCurveTo(-.22,.62,-.56,.44);
  const top=new THREE.Path();top.moveTo(-.26,.65);top.lineTo(.37,.65);top.quadraticCurveTo(.26,.48,.06,.33);
  const hook=new THREE.Path();hook.moveTo(-.01,.34);hook.lineTo(-.01,-.55);hook.quadraticCurveTo(-.01,-.73,.22,-.73);
  hook.lineTo(.48,-.73);hook.quadraticCurveTo(.69,-.73,.67,-.43);
  return [
    {points:points(crown),width:.13},
    {points:points(top),width:.12},
    {points:[[-.49,.33],[.48,.33],[.48,-.36],[-.49,-.36],[-.49,.33]],width:.12},
    {points:[[-.47,-.015],[.46,-.015]],width:.115},
    {points:points(hook),width:.125},
  ];
}

/** Konoha's inward spiral, pointed leaf base and rising stem; not a partial torus plus a slash. */
export function hiddenLeafStrokes():EmblemStroke[] {
  const leaf=new THREE.Path();leaf.moveTo(.06,-.02);
  leaf.bezierCurveTo(-.26,-.06,-.26,.30,.02,.32);
  leaf.bezierCurveTo(.48,.36,.59,-.13,.36,-.39);
  leaf.bezierCurveTo(.18,-.61,-.19,-.62,-.42,-.40);
  leaf.lineTo(-.85,-.40);leaf.lineTo(-.57,-.09);leaf.lineTo(-.42,-.40);
  const stem=new THREE.Path();stem.moveTo(-.16,.35);stem.quadraticCurveTo(-.36,.47,-.51,.79);
  return [{points:points(leaf),width:.13},{points:points(stem),width:.13}];
}

/** A circular whirl without the Leaf emblem's stem; used as a cut through the red back patch. */
export function uzumakiWhorl() {
  return Array.from({length:72},(_,i)=>{
    const t=i/71,angle=-Math.PI*.5+t*Math.PI*3.4,r=.065+t*.71;
    return [Math.cos(angle)*r,Math.sin(angle)*r] as const;
  });
}
