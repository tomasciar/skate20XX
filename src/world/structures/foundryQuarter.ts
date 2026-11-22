import * as THREE from 'three';
import {FOUNDRY,FOUNDRY_DRIVEWAY_START,foundryPoint,foundryLocal,foundryForChunk} from '../planning/foundryQuarter.ts';
import {courseHeight,courseX} from '../terrain/course.ts';
import {landscapeHeight} from '../terrain/landscape.ts';
import {LANDMARK_MATERIALS as M,landmarkBox,landmarkPart} from './parts.ts';
import {makeTerrainPaving} from './terrainPaving.ts';
import {makeCar} from '../props/vehicles.ts';
import {makeShopSign} from '../props/city.ts';
import {seededRandom} from '../planning/generation.ts';
import {makeFoundrySign} from '../props/foundrySigns.ts';
import {RAMP} from '../config.ts';
import {prepareArchitectureFinish} from '../rendering/architectureFinish.ts';

const BRICK=0xa86149,TEAL=0x357a7c,RED=0xb64d43;
const floor=(x:number,s:number)=>landscapeHeight(x,s)-courseHeight(s);
const ease=(s:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(s-a)/(b-a)));return t*t*(3-2*t);};

/** Geometry in the car park's horizontal world frame. It must not receive the course warp again. */
function garageMesh(index:number,vertices:number[],indices:number[],material:THREE.Material,name:string,flip=false,decorative=false) {
  if(material instanceof THREE.MeshStandardMaterial)prepareArchitectureFinish(material);
  const base=index*70,positions:number[]=[],uv:number[]=[],point=new THREE.Vector3();
  for(let i=0;i<vertices.length;i+=3) {
    foundryPoint(vertices[i]!,vertices[i+1]!,vertices[i+2]!,point);
    positions.push(point.x-courseX(base),point.y-courseHeight(base),point.z+base);uv.push(vertices[i]!/6,vertices[i+2]!/6);
  }
  if(flip)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2]!,indices[i+1]!];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.userData.courseWarped=true;
  if(decorative)mesh.userData.collision=false;return mesh;
}
function garageBox(index:number,size:number[],at:number[],material:THREE.Material,name:string,decorative=false,roll=0,heading=0) {
  const geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);geometry.rotateZ(roll);geometry.rotateY(heading);geometry.translate(at[0]!,at[1]!,at[2]!);
  const mesh=garageMesh(index,Array.from(geometry.getAttribute('position').array),Array.from(geometry.index!.array),material,name,true,decorative);geometry.dispose();return mesh;
}
/** Closed deck, helical ramp or parapet; angular samples share endpoints exactly. */
function circularDeck(index:number,inner:number,outer:number,height:(t:number)=>number,thickness:number,turns:number,start:number,material:THREE.Material,name:string,guard=false) {
  const steps=64*turns,positions:number[]=[],indices:number[]=[];
  for(let step=0;step<steps;step++) {
    const t0=step/steps,t1=(step+1)/steps,theta=start+(t0+t1)/2*Math.PI*2*turns;
    const wrap=(a:number)=>Math.atan2(Math.sin(theta-a),Math.cos(theta-a));
    if(guard&&([.72,Math.PI/2,Math.PI-.72].some(a=>Math.abs(wrap(a))<.23)||(wrap(Math.PI)>-.4&&wrap(Math.PI)<.7)))continue;
    const at=positions.length/3;
    for(const bottom of [false,true])for(const t of [t0,t1])for(const r of [inner,outer]) {
      const a=start+t*Math.PI*2*turns;
      positions.push(FOUNDRY.garageX+r*Math.cos(a),height(t)-(bottom?thickness:0),r*Math.sin(a));
    }
    for(const tri of [[0,1,2],[1,3,2],[4,6,5],[5,6,7],[0,2,4],[2,6,4],[1,5,3],[3,5,7]])indices.push(...tri.map(v=>v+at));
    if(guard||step===0)indices.push(at,at+4,at+1,at+1,at+4,at+5);
    if(guard||step===steps-1)indices.push(at+2,at+3,at+6,at+3,at+7,at+6);
  }
  return garageMesh(index,positions,indices,material,name);
}
/** A slab ribbon between arbitrary hill-frame points, shared by warehouse and upper-deck routes. */
function bridgeCurve(a:THREE.Vector3,b:THREE.Vector3,bend=false) {
  if(!bend)return new THREE.LineCurve3(a,b);
  const start=foundryLocal(a),end=foundryLocal(b);
  return new THREE.CubicBezierCurve3(a,foundryPoint(start.x,start.y,start.z+40),foundryPoint(end.x,end.y,end.z-32),b);
}
function bridge(index:number,a:THREE.Vector3,b:THREE.Vector3,width:number,material:THREE.Material,name:string,bend=false) {
  const base=index*70,vertices:number[]=[],indices:number[]=[],curve=bridgeCurve(a,b,bend);
  const up=new THREE.Vector3(0,Math.cos(RAMP.angleDeg*Math.PI/180),Math.sin(RAMP.angleDeg*Math.PI/180));
  const steps=Math.ceil(curve.getLength()/2.5);
  for(const bottom of [false,true])for(let i=0;i<=steps;i++)for(const sign of [-1,1]) {
    const side=curve.getTangent(i/steps).cross(up).normalize().multiplyScalar(width/2);
    const p=curve.getPoint(i/steps).addScaledVector(side,sign);if(bottom)p.addScaledVector(up,-.32);
    vertices.push(p.x-courseX(base),p.y-courseHeight(base),p.z+base);
  }
  const count=(steps+1)*2;
  for(let i=0;i<steps;i++) {
    const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2,n+count,n+2+count,n+1+count,n+1+count,n+2+count,n+3+count);
    indices.push(n,n+2,n+count,n+2,n+2+count,n+count,n+1,n+1+count,n+3,n+3,n+1+count,n+3+count);
  }
  indices.push(0,count,1,1,count,count+1,steps*2,steps*2+1,steps*2+count,steps*2+1,steps*2+count+1,steps*2+count);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]!/6,vertices[i+2]!/6);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.userData.courseWarped=true;return mesh;
}

/** A source-frame ribbon: entrances, canopy decks and banks all use the same support reference. */
function ribbon(index:number,x:number,width:number,start:number,end:number,height:(s:number)=>number,material:THREE.Material,name:string,slab=false) {
  const base=index*70,a=Math.max(base,start),b=Math.min(base+70,end);if(b<=a)return null;
  const step=2.5,rows=[a];for(let s=Math.ceil((a+1e-6)/step)*step;s<b;s+=step)rows.push(s);rows.push(b);
  const positions:number[]=[],indices:number[]=[],uv:number[]=[],count=rows.length*2;
  for(const bottom of [false,true])for(const s of rows)for(const side of [-1,1]) {
    const px=x+side*width/2,reference=floor(x,s),h=height(s);
    positions.push(px,bottom?(slab?reference+h-.3:floor(px,s)-.2):reference+h+.025,-(s-base));
    uv.push(px/8,s/14);
  }
  for(let i=0;i<rows.length-1;i++) {
    const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2,n+count,n+2+count,n+1+count,n+1+count,n+2+count,n+3+count);
    indices.push(n,n+2,n+count,n+2,n+2+count,n+count,n+1,n+1+count,n+3,n+3,n+1+count,n+3+count);
  }
  indices.push(0,count,1,1,count,count+1,count-2,count-1,count*2-2,count-1,count*2-1,count*2-2);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=landmarkPart(geometry,material as THREE.MeshStandardMaterial);mesh.name=name;return mesh;
}

export function* makeFoundryQuarter(index:number,deckMaterial:THREE.Material) {
  if(!foundryForChunk(index))return;
  const from=index*70,to=from+70,owns=(s:number)=>s>=from&&s<to;
  const box=(material:THREE.MeshStandardMaterial,size:number[],x:number,y:number,s:number,name:string,decorative=false)=>{
    const mesh=landmarkBox(material,size,[x,y,-(s-from)],decorative,true);mesh.name=name;return mesh;
  };
  // Continuous street/court surfaces give the buildings shared ground instead of isolated grassy pads.
  for(const [near,far] of [[11.4,52],[52,126]]) {
    const paving=makeTerrainPaving(index,near!,far!,near===52?425:210,near===52?550:FOUNDRY.end,M.setts);if(paving)yield paving;
  }
  // Partition the left court at the arcade outline so each patch has one visible floor.
  for(const [near,far,start,end] of [
    [-52,-11.4,210,215],[-52,-24.5,215,315],[-12.5,-11.4,215,315],[-52,-11.4,315,FOUNDRY.end],
  ]) {
    const court=makeTerrainPaving(index,near,far,start,end,M.setts);
    if(court)yield court;
  }
  const pavement=makeTerrainPaving(index,-24.5,-12.5,215,315,M.concrete);if(pavement){pavement.name='foundry-covered-pavement';yield pavement;}
  // Left shops and covered pavement form a street wall; the central opening leads into the existing plaza.
  for(const [start,end] of [[215,315]]) {
    const a=Math.max(from,start!),b=Math.min(to,end!);if(b<=a)continue;
    const rear=ribbon(index,-27,4,start!,end!,()=>8.2,M.brick,'foundry-shop-row');if(rear){rear.userData.sceneryTint=BRICK;yield rear;}
    const roof=ribbon(index,-19,13,start!,end!,s=>4.4+floor(-27,s)-floor(-19,s),M.roof,'foundry-arcade-roof',true);if(roof)yield roof;
    for(let s=start!+7,bay=0;s<end!;s+=14,bay++)if(owns(s)) {
      const y=floor(-27,s);
      const base=floor(-13,s),top=y+4.25;
      yield box(M.trim,[.5,top-base,.5],-13,(top+base)/2,s,'foundry-arcade-pier');
      yield box(M.dark,[.08,2.8,11],-24.92,y+1.7,s,'foundry-shop-reveal',true);
      yield box(M.glass,[.04,2.5,10.6],-24.84,y+1.7,s,'foundry-shop-glass',true);
      for(const dz of [-3.5,0,3.5])yield box(M.trim,[.14,2.6,.12],-24.75,y+1.7,s+dz,'foundry-shop-mullion',true);
      const sign=makeShopSign(bay+3,8.8);sign.rotation.y=Math.PI/2;sign.position.set(-24.66,y+3.45,-(s-from));sign.name='foundry-shop-sign';yield sign;
      const awning=box(M.paint,[3.1,.15,11.8],-23.3,y+3.1,s,'foundry-shop-awning',true);awning.userData.sceneryTint=bay%2?TEAL:RED;yield awning;
      yield box(M.trim,[.2,.2,13.5],-25,y+7.2,s,'foundry-upper-storey-band',true);
      yield box(M.glass,[.04,1.5,9.5],-24.9,y+6.1,s,'foundry-upper-window',true);
      yield box(M.trim,[.16,.18,10],-24.8,y+5.3,s,'foundry-window-sill',true);
      yield box(M.dark,[.12,2.7,1.3],-24.67,y+1.4,s-4.4,'foundry-shop-door',true);
      yield box(M.trim,[.13,.12,.18],-24.52,y+1.35,s-4,'foundry-door-handle',true);
      yield box(M.steel,[.16,3.4,.16],-24.55,y+1.7,s+6.2,'foundry-drainpipe',true);
      if(bay%2===0) {
        yield box(M.trim,[1.2,.65,2],-23.3,floor(-23.3,s)+.325,s+4.4,'foundry-flower-box');
        const plant=box(M.paint,[1,.42,1.8],-23.3,floor(-23.3,s)+.86,s+4.4,'foundry-shop-plant',true);plant.userData.sceneryTint=0x56834b;yield plant;
      }
    }
  }
  // The canopy rejoins the old roof's descending bank diagonally, leaving the plaza approach beneath it clear.
  if(index===4)yield bridge(index,new THREE.Vector3(-19+courseX(315),landscapeHeight(-27,315)+4.425,-315),
    new THREE.Vector3(-38+courseX(370),landscapeHeight(-38,370)+.025,-370),7,M.roof,'foundry-arcade-roof-exit');
  // The service court is deliberately arranged around the warehouse's usable outer roof and landing lane.
  for(const [start,end,x] of [[250,340,52],[445,550,43]]) {
    const wall=ribbon(index,x!,7,start!,end!,()=>6.6,M.brick,'foundry-market-wing');if(wall){wall.userData.sceneryTint=BRICK;yield wall;}
    for(let s=start!+8,n=0;s<end!;s+=16,n++)if(owns(s)) {
      const y=floor(x!,s),front=x!-3.58;
      yield box(M.glass,[.045,3.1,11.5],front,y+2,s,'foundry-market-shopfront',true);
      const canopy=box(M.paint,[4,.18,12.5],front-1.9,y+4,s,'foundry-market-awning',true);canopy.userData.sceneryTint=n%2?RED:TEAL;yield canopy;
      for(const dz of [-4,0,4])yield box(M.trim,[.13,3.2,.12],front-.06,y+2,s+dz,'foundry-market-frame',true);
      const sign=makeShopSign(n+8,9);sign.rotation.y=-Math.PI/2;sign.position.set(front-.15,y+4.8,-(s-from));sign.name='foundry-market-sign';yield sign;
      yield box(M.dark,[.1,2.9,1.2],front-.07,y+1.5,s-4.7,'foundry-market-door',true);
      // Recessed cafe tables stay under the awning, away from the through lane and parking cars.
      const tx=front-2.2,ground=floor(tx,s);
      yield box(M.trim,[1.65,.12,2.3],tx,ground+.92,s,'foundry-cafe-table');
      for(const dz of [-.75,.75])yield box(M.steel,[.12,.85,.12],tx,ground+.425,s+dz,'foundry-cafe-table-leg',true);
      for(const dz of [-1.7,1.7])yield box(M.paint,[1.5,.45,.55],tx,ground+.225,s+dz,'foundry-cafe-seat');
    }
  }
  // Low seating banks lead into a covered market roof: objects define two lines through the court.
  for(const [x,start,end,height] of [[38,267,289,.65],[38,312,334,.9],[38,425,451,1.1],[49,390,435,2.7],[-46,330,352,1.2]]) {
    const deck=ribbon(index,x!,x===49?10:6,start!,end!,t=>height!*ease(t,start!,start!+8)*(1-ease(t,end!-8,end!)),x===49?M.roof:M.concrete,x===49?'foundry-market-roof-line':'foundry-seating-bank');if(deck)yield deck;
  }
  // The big rotunda is one bounded landmark, retained while all of its spiral is in the streaming window.
  if(index===FOUNDRY.owner) {
    yield circularDeck(index,FOUNDRY.radius-FOUNDRY.rampWidth/2,FOUNDRY.radius+FOUNDRY.rampWidth/2,t=>.03+FOUNDRY.rise*t,.3,FOUNDRY.turns,Math.PI/2,deckMaterial,'foundry-spiral-ramp');
    yield circularDeck(index,16.82,17.02,t=>.23+FOUNDRY.rise*t,.2,FOUNDRY.turns,Math.PI/2,M.trim,'foundry-spiral-inner-curb');
    for(const h of [0,4.6,9.2]) {
      yield circularDeck(index,FOUNDRY.innerRadius,FOUNDRY.outerRadius,()=>h+.03,.35,1,0,deckMaterial,'foundry-parking-floor');
      yield circularDeck(index,31.9,32.12,()=>h+.58,.55,1,0,M.brick,'foundry-parking-parapet',true);
      yield circularDeck(index,31.88,32.2,()=>h-.16,.2,1,0,M.trim,'foundry-parking-fascia');
      // Upper landings extend after the seam in the direction of travel. Extending one
      // over the incoming helix would put its underside through the last few meters.
      const side=h>0?-1:1;
      yield garageBox(index,[36,.32,8],[88+side*18,h-.13,21],deckMaterial,'foundry-spiral-landing');
      // Painted spaces explain the decks visually; they add no collision or unique materials.
      for(let slot=0;slot<32;slot++) {
        const a=slot*Math.PI/16;if(a>.7&&a<2.45)continue;
        const verts:number[]=[];
        for(const r of [27.1,31.6])for(const d of [-.035,.035])verts.push(88+r*Math.cos(a)-d*Math.sin(a),h+.045,r*Math.sin(a)+d*Math.cos(a));
        yield garageMesh(index,verts,[0,2,1,1,2,3],M.trim,'foundry-parking-bay-line',false,true);
      }
      for(const [theta,n] of [[0,0],[Math.PI,1],[Math.PI*1.25,2],[Math.PI*1.7,3],[Math.PI*.15,4],[Math.PI*1.5,5]]) {
        const car=makeCar(seededRandom(70+Math.round(h)*11+n!)),bottom=new THREE.Box3().setFromObject(car).min.y,carMeshes:THREE.Mesh[]=[];
        car.position.set(88+30.8*Math.cos(theta!),h+.03-bottom,30.8*Math.sin(theta!));car.rotation.y=-theta!;car.updateMatrixWorld(true);
        car.traverse(child=>{if(!(child instanceof THREE.Mesh)||Array.isArray(child.material))return;const source=child.geometry,owned=source.clone();owned.applyMatrix4(child.matrixWorld);
          const mesh=garageMesh(index,Array.from(owned.getAttribute('position').array),Array.from(owned.index?.array??Array.from({length:owned.getAttribute('position').count},(_,i)=>i)),child.material,'foundry-parked-car',true,child.userData.collision===false);carMeshes.push(mesh);owned.dispose();});
        yield* carMeshes;
      }
    }
    for(const theta of [0,Math.PI,Math.PI*1.25,Math.PI*1.5,Math.PI*1.75])yield garageBox(index,[.6,9.3,.6],[88+31.4*Math.cos(theta),4.65,31.4*Math.sin(theta)],M.trim,'foundry-garage-column');
    for(const theta of [0,Math.PI,Math.PI*1.5])yield garageBox(index,[.45,9.3,.45],[88+25.5*Math.cos(theta),4.65,25.5*Math.sin(theta)],M.steel,'foundry-spiral-support');
    // A clock tower in the atrium gives the whole district one recognizable center.
    yield garageBox(index,[8,23,8],[88,11.5,0],M.brick,'foundry-clock-tower');
    for(const y of [2,17.8,23])yield garageBox(index,[8.6,.45,8.6],[88,y,0],M.trim,'foundry-clock-cornice');
    yield garageBox(index,[4.5,.6,4.5],[88,24.2,0],M.roof,'foundry-clock-crown');
    for(let face=0;face<4;face++) {
      const rotation=face*Math.PI/2,co=Math.cos(rotation),si=Math.sin(rotation);
      const at=(x:number,y:number,z:number)=>[88+x*co+z*si,y,-x*si+z*co];
      const circle=new THREE.CircleGeometry(2.3,24);circle.translate(0,20.3,-4.08);circle.rotateY(rotation);circle.translate(88,0,0);
      yield garageMesh(index,Array.from(circle.getAttribute('position').array),Array.from(circle.index!.array),M.trim,'foundry-clock-face',false,true);circle.dispose();
      for(let i=0;i<12;i++){const a=i*Math.PI/6;yield garageBox(index,[.13,.35,.06],at(1.95*Math.sin(a),20.3+1.95*Math.cos(a),-4.14),M.dark,'foundry-clock-tick',true,-a,rotation);}
      yield garageBox(index,[.12,1.7,.07],at(0,20.9,-4.2),M.dark,'foundry-clock-hand',true,0,rotation);
      yield garageBox(index,[1.5,.14,.08],at(.6,20.3,-4.21),M.dark,'foundry-clock-hand',true,0,rotation);
      for(const y of [6,10,14])yield garageBox(index,[1.2,2.4,.08],at(0,y,-4.06),M.glass,'foundry-tower-window',true,0,rotation);
    }
    // Broad approaches connect the branch road, spiral and lower court with actual surfaces.
    const drivewayStart=new THREE.Vector3(142+courseX(FOUNDRY_DRIVEWAY_START),landscapeHeight(142,FOUNDRY_DRIVEWAY_START)+.025,-FOUNDRY_DRIVEWAY_START);
    yield bridge(index,drivewayStart,foundryPoint(124,.03,21),11,deckMaterial,'foundry-garage-entry');
    const exit=new THREE.Vector3(58+courseX(550),landscapeHeight(58,550)+.025,-550);
    yield bridge(index,foundryPoint(52,9.23,21),exit,9,deckMaterial,'foundry-garage-descent');
    const sign=makeFoundrySign(2,8),at=foundryPoint(88,4,-4.2);
    sign.position.set(at.x-courseX(from),at.y-courseHeight(from),at.z+from);sign.rotation.x=RAMP.angleDeg*Math.PI/180;sign.userData.courseWarped=true;yield sign;
  }
  if(index===5) {
    const warehouseRoof=new THREE.Vector3(23.5+courseX(380),courseHeight(380)+4.5,-380);
    const roofEnd=foundryPoint(59.9,9.23,0),curve=bridgeCurve(warehouseRoof,roofEnd,true);
    yield bridge(index,warehouseRoof,roofEnd,8,M.roof,'foundry-warehouse-roof-link',true);
    for(const t of [.2,.5,.8]) {
      const top=curve.getPoint(t),along=-top.z,x=top.x-courseX(along);
      const ground=foundryLocal(new THREE.Vector3(top.x,landscapeHeight(x,along),top.z)),deck=foundryLocal(top);
      const height=deck.y-ground.y-.32;if(height<=0)continue;
      for(const offset of [-3.1,3.1])yield garageBox(index,[.55,height,.55],[deck.x+offset,ground.y+height/2,deck.z],M.brick,'foundry-roof-link-pier');
    }
  }
  if(owns(211)) {
    yield box(M.brick,[.8,8,.9],-12.1,4.3,211,'foundry-entry-pier');
    yield box(M.trim,[6,.85,.7],-15.4,7.9,211,'foundry-entry-sign-backing');
    const label=makeFoundrySign(0,5.6);label.position.set(-15.4,7.9,-(210.6-from));label.name='foundry-entry-sign';yield label;
  }
}

