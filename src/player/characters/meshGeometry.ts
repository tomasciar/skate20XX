import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
type Point3=readonly[number,number,number];
/** A closed, curved clump with a broad root and a sharp tip. Rings follow the curve, not a vertical cone. */
export function sweptLockGeometry(root:Point3,bend:Point3,tip:Point3,width:number,depth:number,rings=9,sides=10) {
  const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(...root),new THREE.Vector3(...bend),new THREE.Vector3(...tip));
  const positions:number[]=[],indices:number[]=[];
  const tangent=new THREE.Vector3(),across=new THREE.Vector3(),normal=new THREE.Vector3(),point=new THREE.Vector3();
  const front=new THREE.Vector3(0,0,-1);
  for(let ring=0;ring<rings;ring++) {
    const t=ring/rings,center=curve.getPoint(t);curve.getTangent(t,tangent).normalize();
    across.crossVectors(tangent,front);
    if(across.lengthSq()<0.01)across.crossVectors(tangent,new THREE.Vector3(0,1,0));
    across.normalize();normal.crossVectors(tangent,across).normalize();
    const taper=Math.pow(Math.cos(t*Math.PI/2),0.85)*(0.82+0.28*Math.sin(t*Math.PI));
    for(let side=0;side<sides;side++) {
      const angle=side/sides*Math.PI*2;
      point.copy(center).addScaledVector(across,Math.cos(angle)*width*0.5*taper)
        .addScaledVector(normal,Math.sin(angle)*depth*0.5*taper);
      positions.push(point.x,point.y,point.z);
      if(ring<rings-1) {
        const a=ring*sides+side,b=ring*sides+(side+1)%sides,c=a+sides,d=b+sides;
        indices.push(a,b,c,b,d,c);
      }
    }
  }
  const end=positions.length/3;positions.push(...tip);
  const base=positions.length/3;positions.push(...root);
  for(let side=0;side<sides;side++) {
    indices.push((rings-1)*sides+side,(rings-1)*sides+(side+1)%sides,end);
    indices.push(base,(side+1)%sides,side);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function surfacePatch(points:readonly(readonly[number,number])[],surface:(x:number,y:number)=>number,back=false,offset=0.0012,subdivisions=2) {
  const shape=new THREE.Shape();points.forEach(([x,y],i)=>{if(i)shape.lineTo(x,y);else shape.moveTo(x,y);});shape.closePath();
  const source=new THREE.ShapeGeometry(shape).toNonIndexed(),p=source.getAttribute('position'),positions:number[]=[];
  const emit=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2,level:number)=>{
    if(level){const ab=a.clone().lerp(b,0.5),bc=b.clone().lerp(c,0.5),ca=c.clone().lerp(a,0.5);emit(a,ab,ca,level-1);emit(ab,b,bc,level-1);emit(ca,bc,c,level-1);emit(ab,bc,ca,level-1);return;}
    for(const point of back?[a,b,c]:[a,c,b])positions.push(point.x,point.y,surface(point.x,point.y)+(back?offset:-offset));
  };
  for(let i=0;i<p.count;i+=3)emit(new THREE.Vector2(p.getX(i),p.getY(i)),new THREE.Vector2(p.getX(i+1),p.getY(i+1)),new THREE.Vector2(p.getX(i+2),p.getY(i+2)),subdivisions);
  source.dispose();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}

export type LimbKind='upperarm'|'forearm'|'thigh'|'shin'|'sleeve'|'barethigh'|'bareshin'|'flaredshin'|'stockythigh'|'stockyshin'|'tailoredthigh'|'tailoredshin';
const LIMBS:Record<LimbKind,readonly(readonly[number,number])[]>={
  upperarm:[[-0.5,0.04],[-0.3,0.044],[-0.04,0.042],[0.25,0.034],[0.5,0.032]],
  forearm:[[-0.5,0.03],[-0.26,0.033],[0,0.029],[0.32,0.025],[0.5,0.025]],
  thigh:[[-0.5,0.073],[-0.3,0.079],[-0.04,0.075],[0.25,0.065],[0.5,0.056]],
  shin:[[-0.5,0.038],[-0.24,0.044],[0,0.048],[0.25,0.051],[0.5,0.052]],
  sleeve:[[-0.5,0.054],[-0.32,0.058],[0.16,0.053],[0.4,0.05],[0.5,0.05]],
  barethigh:[[-.5,.05],[-.25,.052],[0,.049],[.3,.044],[.5,.04]],
  bareshin:[[-.5,.038],[-.25,.042],[0,.037],[.3,.029],[.5,.025]],
  flaredshin:[[-.5,.040],[-.25,.045],[0,.052],[.25,.066],[.5,.083]],
  stockythigh:[[-.5,.070],[-.3,.080],[0,.075],[.3,.066],[.5,.058]],
  stockyshin:[[-.5,.054],[-.25,.057],[0,.054],[.3,.049],[.5,.043]],
  tailoredthigh:[[-.5,.064],[-.25,.067],[0,.063],[.3,.055],[.5,.048]],
  tailoredshin:[[-.5,.045],[-.25,.046],[0,.044],[.3,.040],[.5,.038]],
};
export function limbGeometry(kind:LimbKind) {
  const profile=LIMBS[kind],geometry=new THREE.LatheGeometry(profile.map(([y,r])=>new THREE.Vector2(r,y)),12);
  if(kind==='thigh'||kind==='sleeve') {
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const y=positions.getY(i),angle=Math.atan2(positions.getX(i),positions.getZ(i));
      const fold=1+.022*Math.sin(angle*7+y*13)*Math.sin((y+.5)*Math.PI);
      positions.setX(i,positions.getX(i)*fold);positions.setZ(i,positions.getZ(i)*fold);
    }
    geometry.computeVertexNormals();
  }
  geometry.userData.radiusTop=profile[profile.length-1]![1];geometry.userData.radiusBottom=profile[0]![1];return geometry;
}
const legGeometries=new Map<string,THREE.BufferGeometry>();
export function characterLegGeometry(kind:'thigh'|'shin',style:'standard'|'bare'|'flared'|'stocky'|'tailored'='standard') {
  const key: LimbKind=style==='bare'?(kind==='thigh'?'barethigh':'bareshin'):style==='stocky'?(kind==='thigh'?'stockythigh':'stockyshin')
    :style==='tailored'?(kind==='thigh'?'tailoredthigh':'tailoredshin'):style==='flared'&&kind==='shin'?'flaredshin':kind;
  let geometry=legGeometries.get(key);if(!geometry){geometry=limbGeometry(key);legGeometries.set(key,geometry);}return geometry;
}

export function handGeometry(side:number,fingers=4) {
  // The wrist is the origin. A tapered palm leads into staggered, slightly curled fingers,
  // instead of a large palm centered over the wrist with fingertips peeking out of it.
  const palm=new RoundedBoxGeometry(.054,.042,.025,1,.008);palm.translate(0,.017,0);
  const parts:THREE.BufferGeometry[]=[palm];
  const digit=(a:Point3,b:Point3,radius:number)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const part=new THREE.CapsuleGeometry(radius,direction.length(),2,6);
    part.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    part.translate(...start.add(end).multiplyScalar(.5).toArray());parts.push(part);
  };
  for(let i=0;i<fingers;i++) {
    const x=fingers===3?-.017+i*.017:-.0195+i*.013,length=(fingers===3?[.023,.029,.022]:[.022,.028,.026,.019])[i]!;
    digit([x,.034,0],[x,.034+length*.65,.002],fingers===3?.0065:.0054);
    digit([x,.034+length*.65,.002],[x,.034+length,.009],fingers===3?.006:.0049);
  }
  digit([-side*.022,.011,.001],[-side*.033,.025,.004],.0075);
  digit([-side*.033,.025,.004],[-side*.031,.037,.012],.006);
  const flat=parts.map(part=>part.index?part.toNonIndexed():part.clone()),geometry=mergeGeometries(flat)!;
  geometry.scale(1.1,1.1,1.1);
  parts.forEach(part=>part.dispose());flat.forEach(part=>part.dispose());return geometry;
}
const handGeometries=new Map<string,THREE.BufferGeometry>();
export function characterHandGeometry(side:number,cartoon:boolean) {
  const key=`${side}:${cartoon}`;let geometry=handGeometries.get(key);
  if(!geometry){geometry=handGeometry(side,cartoon?3:4);handGeometries.set(key,geometry);}return geometry;
}
