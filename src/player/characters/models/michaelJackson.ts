import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {croppedHairGeometry} from '../geometry.ts';
import {cosmeticMesh as mesh,cosmeticLine as line,projectedPatch as patch,projectedLine as stroke,addGuestFace} from '../primitives.ts';

const WHITE=0xf0e9d8,BLUE=0x5c87aa,DARK=0x1b2029,HAIR=0x211d24;

/** Connected curl volume under the hat; small corrugations suggest curls without a curtain of loose tubes. */
function curlMassGeometry() {
  const positions:number[]=[],indices:number[]=[],segments=48,rows=12;
  for(let row=0;row<=rows;row++)for(let i=0;i<=segments;i++) {
    const a=.86+(Math.PI*2-1.72)*i/segments,t=row/rows;
    const edge=-.080-.014*(.5+.5*Math.cos(a*9));
    const y=THREE.MathUtils.lerp(edge,.083,t);
    const ripple=.0024*Math.sin(a*29+t*13)+.0014*Math.cos(a*17-t*21);
    const radius=(.080+.010*Math.sin(t*Math.PI)+ripple)*(1-.10*(1-t));
    positions.push(Math.sin(a)*radius,y,.014-Math.cos(a)*(radius+.003));
    if(row<rows&&i<segments){const j=row*(segments+1)+i,k=j+segments+1;indices.push(j,k,j+1,j+1,k,k+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
/** Oval, pinched crown and a thin brim with real thickness, readable from above and below. */
function hatLoft(rings:readonly(readonly[number,number,number])[],close:boolean) {
  const positions:number[]=[],indices:number[]=[],segments=40;
  for(let ring=0;ring<rings.length;ring++)for(let i=0;i<=segments;i++) {
    const [rx,rz,y]=rings[ring]!,a=i/segments*Math.PI*2;
    const pinch=ring>1&&!close?1-.10*Math.max(0,Math.cos(a)):1;
    positions.push(Math.sin(a)*rx*pinch,y+(close?-.012*Math.max(0,-Math.cos(a)):0),Math.cos(a)*rz);
  }
  for(let ring=0;ring<(close?rings.length:rings.length-1);ring++)for(let i=0;i<segments;i++) {
    const a=ring*(segments+1)+i,b=((ring+1)%rings.length)*(segments+1)+i;
    if(close)indices.push(a,b,a+1,a+1,b,b+1);else indices.push(a,a+1,b,a+1,b+1,b);
  }
  if(!close&&rings[rings.length-1]![0]<.01) {
    const cap=positions.length/3;positions.push(0,rings[rings.length-1]![2]-.002,0);
    for(let i=0;i<segments;i++)indices.push((rings.length-1)*(segments+1)+i,(rings.length-1)*(segments+1)+i+1,cap);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function addMichaelHead(parent:THREE.Group) {
  addGuestFace(parent,'mj',0xbc8767);mesh(parent,croppedHairGeometry('mj'),HAIR);
  mesh(parent,curlMassGeometry(),HAIR);
  for(let i=0;i<11;i++) {
    const a=1.05+i*(Math.PI*2-2.10)/10,points:readonly[number,number,number][]=Array.from({length:11},(_,j)=>{
      const t=j/10,r=.079+.003*Math.cos(t*Math.PI*3),theta=a+.045*Math.sin(t*Math.PI*3);
      return [Math.sin(theta)*r,-.034-t*.060,.014-Math.cos(theta)*r];
    });
    line(parent,i%3===0?0x302832:HAIR,points,.0023);
  }
  // Two asymmetric wet forelocks, with the familiar small forehead curl kept clear of the eyes.
  line(parent,HAIR,[[-.045,.080,-.069],[-.032,.053,-.082],[-.035,.026,-.085],[-.027,.006,-.085],[-.020,.011,-.086]],.0035);
  line(parent,HAIR,[[.055,.073,-.059],[.063,.042,-.066],[.061,.014,-.070],[.065,-.007,-.058]],.0038);
  const hat=new THREE.Group();hat.position.y=-.022;hat.rotation.set(.035,0,-.085);hat.updateMatrix();
  mesh(hat,hatLoft([[.095,.081,.109],[.102,.087,.132],[.094,.080,.182],[.078,.068,.207],[.003,.025,.202]],false),WHITE);
  mesh(hat,hatLoft([[.096,.083,.114],[.155,.130,.109],[.155,.130,.105],[.096,.083,.110]],true),WHITE);
  mesh(hat,hatLoft([[.103,.088,.119],[.101,.087,.140]],false),DARK);
  mesh(hat,new RoundedBoxGeometry(.005,.018,.032,1,.002),DARK,-.103,.129,.010);
  // Flatten the hat's fixed tilt into the same head batch as the face and curls.
  for(const child of [...hat.children]){child.applyMatrix4(hat.matrix);parent.add(child);}
  parent.scale.setScalar(1.08);
}

export function addMichaelOutfit(parent:THREE.Group,front:(x:number,y:number)=>number,back:(x:number,y:number)=>number) {
  // Subtle fine pinstripes, projected onto both sides of the actual jacket.
  for(const rear of [false,true])for(const x of [-.104,-.070,-.035,0,.035,.070,.104])
    stroke(parent,0xd2d8d3,[[x,.086],[x,.385]],rear?back:front,.0011,rear,.0035);
  patch(parent,BLUE,[[-.062,.418],[.062,.418],[.045,.327],[0,.222],[-.043,.329]],front,false,.005,2);
  for(const side of [-1,1]) {
    patch(parent,0xcdd6d3,[[side*.075,.419],[side*.116,.361],[side*.055,.348],[side*.078,.330],[0,.217]],front,false,.0065);
    patch(parent,WHITE,[[side*.071,.414],[side*.107,.365],[side*.049,.350],[side*.071,.331],[0,.229]],front,false,.0078);
    patch(parent,0x7f9eb3,[[side*.050,.414],[0,.397],[side*.017,.367],[side*.056,.396]],front,false,.0085);
    stroke(parent,0xb9c7c9,[[side*.056,.158],[side*.112,.161]],front,.002,false,.0045);
  }
  patch(parent,WHITE,[[-.011,.397],[.011,.397],[.008,.376],[0,.367],[-.008,.376]],front,false,.010);
  patch(parent,WHITE,[[-.006,.371],[.006,.371],[.014,.281],[0,.260],[-.014,.281]],front,false,.010);
  stroke(parent,0xc2cbd0,[[-.002,.366],[.007,.284]],front,.0011,false,.011);
  mesh(parent,new THREE.CylinderGeometry(.136,.136,.022,24,1,true),DARK,0,.074,0).scale.set(.94,1,.62);
  stroke(parent,0xb7c5c8,[[-.075,.304],[-.115,.306]],front,.002);
  patch(parent,WHITE,[[-.107,.309],[-.077,.325],[-.067,.307]],front,false,.005);
}

export function addMichaelLimb(parent:THREE.Group,kind:'upperarm'|'forearm'|'shin',side:number) {
  if(kind==='upperarm'&&side===-1)mesh(parent,new THREE.CylinderGeometry(.049,.049,.29,12,1,true),DARK,0,.10,0);
  if(kind==='forearm') {
    mesh(parent,new THREE.CylinderGeometry(.028,.029,.105,12,1,true),WHITE,0,.44,0);
    for(const y of [.28,.34])mesh(parent,new THREE.SphereGeometry(.003,6,4),0x8f9da4,side*.028,y,-.005).scale.y=2;
  }
  if(kind==='shin')mesh(parent,new THREE.CylinderGeometry(.042,.042,.045,12,1,true),0xe3e5dc,0,.40,0);
}

export function addMichaelShoe(parent:THREE.Group) {
  mesh(parent,new RoundedBoxGeometry(.104,.028,.159,2,.009),0x20232b,0,.054,-.021);
  mesh(parent,new RoundedBoxGeometry(.071,.010,.026,1,.003),0x394049,0,.068,-.037);
}
