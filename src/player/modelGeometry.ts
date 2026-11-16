import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {CharacterId} from '../characters.ts';

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

// Jaw, cheeks, temples, and cranium; no separate floating chin or spherical face overlay.
const HEAD=[[-0.103,0.023,0.023,-0.016],[-0.087,0.049,0.043,-0.012],[-0.052,0.071,0.062,-0.004],[-0.005,0.084,0.078,0],
  [0.045,0.086,0.078,0.004],[0.083,0.071,0.067,0.006],[0.108,0.038,0.035,0.005],[0.116,0.001,0.001,0.003]] as const;
const HEADS={
  goku:[[-.106,.019,.02,-.022],[-.09,.041,.036,-.014],[-.064,.065,.053,-.008],[-.025,.081,.07,-.002],[.016,.087,.078,0],[.057,.084,.078,.003],[.09,.069,.063,.006],[.116,.001,.001,.003]],
  naruto:[[-.103,.025,.024,-.014],[-.084,.052,.044,-.006],[-.048,.078,.064,-.001],[-.024,.086,.075,0],[.012,.089,.08,0],[.057,.088,.08,.003],[.09,.07,.065,.006],[.116,.001,.001,.003]],
  kick:[[-.102,.016,.017,-.008],[-.094,.047,.032,-.010],[-.073,.086,.047,-.007],[-.04,.102,.061,-.002],[-.018,.108,.070,0],[.016,.108,.073,0],[.06,.102,.074,.003],[.097,.073,.057,.005],[.119,.001,.001,.003]],
} as const;
function headProfile(id:CharacterId){return id==='goku'?HEADS.goku:id==='naruto'?HEADS.naruto:id==='kick'?HEADS.kick:HEAD;}
function headSection(y:number,id:CharacterId) {
  const profile=headProfile(id);let i=1;while(i<profile.length-1&&y>profile[i]![0])i++;
  const a=profile[i-1]!,b=profile[i]!,t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  return {x:THREE.MathUtils.lerp(a[1],b[1],t),z:THREE.MathUtils.lerp(a[2],b[2],t),center:THREE.MathUtils.lerp(a[3],b[3],t)};
}
export function headHalfWidth(y:number,id:CharacterId){return headSection(y,id).x*(id==='girl'?.95:1);}
function noseProjection(x:number,y:number,id:CharacterId) {
  if(id!=='goku'&&id!=='naruto')return 0;
  const width=.014,height=id==='goku'?.027:.023,strength=id==='goku'?.018:.012;
  return Math.max(0,1-Math.abs(x)/width)*Math.max(0,1-Math.abs(y+.025)/height)*strength;
}
export function headSurface(x:number,y:number,id:CharacterId) {
  const section=headSection(y,id);
  return section.center-section.z*Math.sqrt(Math.max(.02,1-(x/headHalfWidth(y,id))**2))-noseProjection(x,y,id);
}
export function headGeometry(id:CharacterId) {
  const width=id==='girl'?.95:1,profile=headProfile(id);
  const geometry=new THREE.LatheGeometry(profile.map(([y,x])=>new THREE.Vector2(x,y)),32),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const section=headSection(p.getY(i),id),front=p.getZ(i)<0,x=p.getX(i)*width;
    p.setX(i,x);p.setZ(i,p.getZ(i)*section.z/section.x+section.center-(front?noseProjection(x,p.getY(i),id):0));
  }
  geometry.computeVertexNormals();return geometry;
}

/** A thin scalp following the actual jaw/temple profile, with ear clearance and a jagged nape. */
export function croppedHairGeometry(id:'goku'|'naruto') {
  const positions:number[]=[],indices:number[]=[],segments=40,rings=8;
  for(let ring=0;ring<=rings;ring++)for(let segment=0;segment<=segments;segment++) {
    const angle=segment/segments*Math.PI*2,front=Math.cos(angle);
    const forehead=THREE.MathUtils.smoothstep(front,-.3,.65);
    const sideburn=Math.exp(-(((Math.acos(front)-1.12)/(id==='goku'?.21:.24))**2))*(id==='goku'?.081:.10);
    const edge=-.062+forehead*.132-sideburn+Math.sin(angle*11)*.003*(1-forehead);
    const y=THREE.MathUtils.lerp(edge,.115,ring/rings),section=headSection(y,id);
    positions.push(Math.sin(angle)*(section.x+.004),y,-Math.cos(angle)*(section.z+.004)+section.center);
    if(ring<rings&&segment<segments) {
      const a=ring*(segments+1)+segment,b=a+1,c=a+segments+1;indices.push(a,c,b,b,c,c+1);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Paint patches on the curved surface rather than suspending flat boxes in front of it. */
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

const TORSO=[[-0.18,0.13],[-0.16,0.14],[-0.11,0.138],[-0.01,0.15],[0.08,0.16],[0.145,0.163],[0.18,0.145],[0.185,0.11],[0.192,0.06]] as const;
export function torsoRadius(y:number) {
  const local=y-0.23;let i=1;while(i<TORSO.length-1 && local>TORSO[i]![0])i++;
  const a=TORSO[i-1]!,b=TORSO[i]!;return THREE.MathUtils.lerp(a[1],b[1],THREE.MathUtils.clamp((local-a[0])/(b[0]-a[0]),0,1));
}
export function torsoGeometry() {
  const geometry=new THREE.LatheGeometry(TORSO.map(([y,r])=>new THREE.Vector2(r,y)),24),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),angle=Math.atan2(p.getX(i),p.getZ(i)),fold=1+Math.sin(angle*6+y*27)*0.012*Math.sin((y+0.18)/0.36*Math.PI);
    p.setX(i,p.getX(i)*fold);p.setZ(i,p.getZ(i)*fold);
  }
  geometry.computeVertexNormals();return geometry;
}
export type LimbKind='upperarm'|'forearm'|'thigh'|'shin'|'sleeve';
const LIMBS:Record<LimbKind,readonly(readonly[number,number])[]>={
  upperarm:[[-0.5,0.04],[-0.3,0.044],[-0.04,0.042],[0.25,0.034],[0.5,0.032]],
  forearm:[[-0.5,0.03],[-0.26,0.033],[0,0.029],[0.32,0.025],[0.5,0.025]],
  thigh:[[-0.5,0.073],[-0.3,0.079],[-0.04,0.075],[0.25,0.065],[0.5,0.056]],
  shin:[[-0.5,0.038],[-0.24,0.044],[0,0.048],[0.25,0.051],[0.5,0.052]],
  sleeve:[[-0.5,0.054],[-0.32,0.058],[0.16,0.053],[0.4,0.05],[0.5,0.05]],
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

/** Open-face shell: a low brow, ear coverage and an open chin/neck, with no spherical chin bar. */
export function stuntHelmetRim(angle:number) {
  const y=THREE.MathUtils.lerp(-.057,.018,THREE.MathUtils.smoothstep(Math.cos(angle),.15,.7));
  const latitude=Math.acos((y-.046)/.156);
  return new THREE.Vector3(Math.sin(angle)*.14*Math.sin(latitude),y,.022-Math.cos(angle)*.126*Math.sin(latitude));
}
export function stuntHelmetGeometry(stripe=false) {
  const positions:number[]=[],indices:number[]=[],segments=48;
  if(stripe) {
    const rear=Math.acos((-.057-.046)/.156),front=Math.acos((.018-.046)/.156);
    for(let i=0;i<=segments;i++)for(const x of [-.017,0,.017]) {
      const angle=THREE.MathUtils.lerp(-rear,front,i/segments),shrink=Math.sqrt(1-(x/.14)**2);
      positions.push(x,.046+.157*shrink*Math.cos(angle),.022-.127*shrink*Math.sin(angle));
    }
    for(let i=0;i<segments;i++)for(let j=0;j<2;j++){const a=i*3+j,b=a+1,c=a+3;indices.push(a,b,c,b,c+1,c);}
  } else {
    const rings=16;
    for(let ring=0;ring<=rings;ring++)for(let segment=0;segment<=segments;segment++) {
      const angle=segment/segments*Math.PI*2,rim=stuntHelmetRim(angle);
      const latitude=Math.acos((rim.y-.046)/.156)*ring/rings;
      positions.push(Math.sin(angle)*.14*Math.sin(latitude),.046+.156*Math.cos(latitude),.022-Math.cos(angle)*.126*Math.sin(latitude));
      if(ring<rings&&segment<segments) {
        const a=ring*(segments+1)+segment,b=a+1,c=a+segments+1;indices.push(a,b,c,b,c+1,c);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** A thin two-sided strip with a curved drape, used for tied headband fabric. */
export function ribbonGeometry(root:Point3,bend:Point3,tip:Point3,width:number) {
  const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(...root),new THREE.Vector3(...bend),new THREE.Vector3(...tip)),vertices:number[]=[];
  const edge=(t:number,side:number)=>curve.getPoint(t).add(new THREE.Vector3(side*width*(1-.25*t)/2,0,0));
  for(let i=0;i<10;i++) {
    const a=edge(i/10,-1),b=edge(i/10,1),c=edge((i+1)/10,-1),d=edge((i+1)/10,1);
    for(const point of [a,b,c,b,d,c,a,c,b,b,c,d])vertices.push(point.x,point.y,point.z);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}

/** One merged palm, four relaxed fingers and a thumb; wrist/grab targets are unchanged. */
export function handGeometry(side:number) {
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
  for(let i=0;i<4;i++) {
    const x=-.0195+i*.013,length=[.022,.028,.026,.019][i]!;
    digit([x,.034,0],[x,.034+length*.65,.002],.0054);
    digit([x,.034+length*.65,.002],[x,.034+length,.009],.0049);
  }
  digit([-side*.022,.011,.001],[-side*.033,.025,.004],.0075);
  digit([-side*.033,.025,.004],[-side*.031,.037,.012],.006);
  const flat=parts.map(part=>part.index?part.toNonIndexed():part.clone()),geometry=mergeGeometries(flat)!;
  geometry.scale(1.1,1.1,1.1);
  parts.forEach(part=>part.dispose());flat.forEach(part=>part.dispose());return geometry;
}
