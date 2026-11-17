import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Kinto'un: a puffy golden cloud the rider stands in, with a wispy tail that trails the direction of travel.
 * Lobe tops rise about 2.5 cm above the grip line, so shoes sink in; the belly reaches the wheel contact line. */
export const NIMBUS={halfWidth:0.24,halfLength:0.52} as const;
const TAIL={anchor:.36,stretch:.45,minSpeed:4,fullSpeed:55} as const;

type Puff=[x:number,y:number,z:number,rx:number,ry:number,rz:number];
// Body lobes: a long row along the board with smaller lobes bulging out to each side.
const BODY:Puff[]=[
  [0,-0.025,0,0.18,0.06,0.23],[0,-0.025,-0.24,0.16,0.058,0.18],[0,-0.03,0.25,0.16,0.055,0.18],
  [0,-0.035,-0.4,0.11,0.048,0.11],[0,-0.04,0.42,0.1,0.045,0.1],
  [0.16,-0.035,-0.12,0.08,0.05,0.1],[-0.16,-0.035,-0.1,0.08,0.05,0.1],
  [0.15,-0.04,0.16,0.075,0.046,0.09],[-0.15,-0.04,0.18,0.075,0.046,0.09],
  [0.1,-0.04,-0.33,0.07,0.044,0.08],[-0.1,-0.045,0.34,0.07,0.042,0.08],
];
// A darker, flatter layer showing beneath the body.
const BELLY:Puff[]=[[0,-0.062,-0.12,0.14,0.03,0.24],[0,-0.062,0.2,0.13,0.03,0.22],[0,-0.064,-0.36,0.09,0.026,0.1]];
// Shrinking puffs behind the cloud, in tail space (+z trails).
const TAIL_PUFFS:Puff[]=[[0,-0.035,0.045,0.085,0.042,0.085],[0.014,-0.03,0.14,0.062,0.033,0.078],[-0.008,-0.025,0.225,0.041,0.024,0.058],[0.004,-0.02,0.285,0.024,0.016,0.035]];

function puffs(list:Puff[],widthSegments=16,heightSegments=10) {
  const parts=list.map(([x,y,z,rx,ry,rz])=>{
    const g=new THREE.SphereGeometry(1,widthSegments,heightSegments);g.deleteAttribute('uv');g.scale(rx,ry,rz);g.translate(x,y,z);return g;
  });
  // Keep the analytic smooth normals; recomputing the old non-indexed puffs made every face flat.
  const merged=mergeGeometries(parts)!;for(const part of parts)part.dispose();return merged;
}
/** Curl marks: short arcs pressed into each side of the body, as drawn on the cloud. */
function curls() {
  const parts:THREE.BufferGeometry[]=[];
  for(const side of [-1,1])for(const [z,r] of [[-0.2,0.027],[0.05,0.031],[0.3,0.026]] as const) {
    const g=new THREE.TorusGeometry(r,0.0018,4,14,Math.PI*1.3);g.deleteAttribute('uv');
    g.rotateY(Math.PI/2);g.rotateX(side>0?0.5:-0.5);g.translate(0,-0.025,z);
    const positions=g.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const y=positions.getY(i),z=positions.getZ(i);let surface=0;
      for(const [cx,cy,cz,rx,ry,rz] of BODY) {
        const remaining=1-((y-cy)/ry)**2-((z-cz)/rz)**2;
        if(remaining>=0)surface=Math.max(surface,side*cx+rx*Math.sqrt(remaining));
      }
      // Drape the ink onto the lobe surface, rather than leaving little floating hoops.
      positions.setX(i,side*(surface+.0008)+positions.getX(i)*.5);
    }
    g.computeVertexNormals();parts.push(g);
  }
  const merged=mergeGeometries(parts)!;for(const part of parts)part.dispose();return merged;
}

function createResources() {
  const gold=new THREE.MeshStandardMaterial({color:0xffd23a,emissive:0x5a3c00,roughness:0.85});
  const amber=new THREE.MeshStandardMaterial({color:0xef9a24,emissive:0x3a1c00,roughness:0.9});
  const ochre=new THREE.MeshStandardMaterial({color:0xc9741a,roughness:0.9});
  const body=puffs(BODY),belly=puffs(BELLY),marks=curls(),tail=puffs(TAIL_PUFFS,12,8);
  for(const geometry of [body,belly,marks,tail])geometry.userData.shared=true;
  return {gold,amber,ochre,body,belly,marks,tail};
}
let resources:ReturnType<typeof createResources>|undefined;

export function createNimbusVisual() {
  const root=new THREE.Group();root.name='nimbus';root.userData.boardShape='nimbus';root.visible=false;
  const art=resources??=createResources();
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D)=>{
    const m=new THREE.Mesh(geometry,material);m.castShadow=m.receiveShadow=true;parent.add(m);return m;
  };
  const body=new THREE.Group(),tail=new THREE.Group();body.name='nimbus-body';tail.name='nimbus-tail';root.add(body,tail);
  mesh(art.body,art.gold,body);mesh(art.belly,art.amber,body);mesh(art.marks,art.ochre,body);
  mesh(art.tail,art.gold,tail);
  let time=0,heading=0,targetHeading=0,stretch=0;
  function paint() {
    // Follow an ellipse around the body, keeping the root attached while changing stance.
    tail.position.set(Math.sin(heading)*(NIMBUS.halfWidth-.07),0,Math.cos(heading)*TAIL.anchor);
    tail.scale.set(1-stretch*.15,1-stretch*.15,1+stretch*TAIL.stretch);
    tail.rotation.y=heading+Math.sin(time*2.1)*.055;
    tail.rotation.z=Math.sin(time*1.6+.4)*.035*stretch;
    const breath=1+Math.sin(time*1.7)*.009;body.scale.set(breath,1,breath);
  }
  /** Leave direction unspecified during aerial tricks so a spin cannot flip the trail around. */
  function update(dt:number,speed:number,travelSide?:number) {
    const step=THREE.MathUtils.clamp(dt,0,.1);
    time+=step;
    if(travelSide!==undefined && Math.abs(travelSide)>.1)targetHeading=travelSide<0?Math.PI:0;
    const turn=Math.atan2(Math.sin(targetHeading-heading),Math.cos(targetHeading-heading));
    heading+=turn*(1-Math.exp(-7*step));
    stretch=THREE.MathUtils.damp(stretch,THREE.MathUtils.smoothstep(Math.abs(speed),TAIL.minSpeed,TAIL.fullSpeed),4,step);
    paint();
  }
  function reset(){time=heading=targetHeading=stretch=0;paint();}
  reset();
  return {root,update,reset};
}
