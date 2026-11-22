import * as THREE from 'three';
import {CHUNK_LENGTH,seededRandom} from '../planning/generation.ts';
import {COURSE_STEP,courseHeight} from '../terrain/course.ts';
import {landscapeHeight} from '../terrain/landscape.ts';
import {placePatches,placePatchLift,placePatchShift,placeRouteX} from '../planning/places.ts';
import type {PlaceSite,PlacePatch} from '../planning/places.ts';
import {LANDMARK_MATERIALS as M,landmarkBox,landmarkPart} from './parts.ts';
import {makeBench,makePlanter} from '../props/furniture.ts';
import {makeTree} from '../props/nature.ts';
import {varyScenery} from '../props/variety.ts';
import {makeRoofLaunch} from './roofLaunch.ts';
import {RAMP} from '../config.ts';
import {prepareArchitectureFinish} from '../rendering/architectureFinish.ts';
import {makeShopSign} from '../props/city.ts';
import {sharedGeometry} from './parts.ts';
import {makePlaceFurnishings} from './placeFurnishings.ts';
import {makePlaceDetails} from './placeDetails.ts';

const tankCylinder=sharedGeometry(new THREE.CylinderGeometry(1,1,1,10)),tankCap=sharedGeometry(new THREE.ConeGeometry(1,1,10));
const paving=M.trim.clone();paving.userData.architectureFinish='paving';paving.polygonOffset=true;paving.polygonOffsetFactor=-1;paving.polygonOffsetUnits=-2;
const ground=(x:number,along:number)=>landscapeHeight(x,along)-courseHeight(along);
function samples(start:number,end:number,step:number) {
  const result=[start];for(let value=Math.ceil((start+1e-6)/step)*step;value<end-1e-6;value+=step)result.push(value);
  result.push(end);return result;
}

/** Slice large surfaces into ordinary owner chunks; no extra retention window or physics bodies. */
function* surface(index:number,site:PlaceSite,patch:PlacePatch,deckMaterial:THREE.Material) {
  const base=index*CHUNK_LENGTH,start=Math.max(base,patch.start),end=Math.min(base+CHUNK_LENGTH,patch.end);if(end<=start)return;
  const along=samples(start,end,COURSE_STEP),across=patch.profile==='terrace'||patch.profile==='fall'?samples(patch.near,patch.far,6):
    patch.profile==='channel'?[103,104.75,106.5,109.5,112.5,114.25,116]:
    [patch.near,...[18,22,26].filter(x=>x>patch.near && x<patch.far),patch.far],positions:number[]=[],indices:number[]=[],top:number[]=[];
  for(const bottom of [false,true])for(const s of along)for(const d of across) {
    const x=site.side*(d+placePatchShift(patch,s)),floor=ground(x,s),height=placePatchLift(patch,d,s);
    const y=bottom?(patch.slab?floor+height-.38:floor-.2):floor+height+.008;
    positions.push(x,y,-(s-base));
  }
  const columns=across.length,count=columns*along.length;
  const triangle=(target:number[],a:number,b:number,c:number)=>site.side>0?target.push(a,b,c):target.push(a,c,b);
  for(let row=0;row<along.length-1;row++)for(let col=0;col<columns-1;col++) {
    const a=row*columns+col,b=a+1,c=a+columns,d=c+1;
    triangle(top,a,b,c);triangle(top,b,d,c);
    // The finish supplies the top triangles for both rendering and collision.
    // Ground-backed bases are buried in terrain; only elevated slabs expose an underside.
    if(patch.slab){triangle(indices,a+count,c+count,b+count);triangle(indices,b+count,c+count,d+count);}
  }
  for(let row=0;row<along.length-1;row++) {
    const a=row*columns,b=a+columns,c=a+columns-1,d=c+columns;
    triangle(indices,a,b,a+count);triangle(indices,b,b+count,a+count);triangle(indices,c,c+count,d);triangle(indices,d,c+count,d+count);
  }
  for(let col=0;col<columns-1;col++) {
    const a=col,b=a+1,c=(along.length-1)*columns+col,d=c+1;
    triangle(indices,a,a+count,b);triangle(indices,b,a+count,b+count);triangle(indices,c,d,c+count);triangle(indices,d,d+count,c+count);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const solid=landmarkPart(geometry,site.kind==='yard'?M.brick:M.concrete);solid.name=`place-${patch.name}`;yield solid;
  const finish=new THREE.BufferGeometry();finish.setAttribute('position',new THREE.Float32BufferAttribute(positions.slice(0,count*3),3));finish.setIndex(top);finish.computeVertexNormals();
  const skin=site.kind==='plaza'?landmarkPart(finish,paving):new THREE.Mesh(finish,deckMaterial);
  if(site.kind==='plaza')skin.userData.sceneryTint=0xe5decc;
  skin.name=site.kind==='plaza'?'plaza-paving':'place-deck';
  if(site.kind!=='plaza'){const uv:number[]=[];for(const s of along)for(const d of across)uv.push(site.side*(d+placePatchShift(patch,s))/10,s/14);finish.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}yield skin;
}

function* prop(index:number,site:PlaceSite,build:()=>THREE.Object3D,x:number,along:number,height:number,yaw=0) {
  if(along<index*CHUNK_LENGTH || along>=(index+1)*CHUNK_LENGTH)return;
  const object=build();
  object.position.set(x,ground(x,along)+height,-(along-index*CHUNK_LENGTH));object.rotation.y=yaw;object.updateMatrixWorld(true);
  const meshes:THREE.Mesh[]=[];
  object.traverse(child=>{if(child instanceof THREE.Mesh && !Array.isArray(child.material)) {
    const source=child.geometry,geometry=source.clone();geometry.userData={...source.userData};delete geometry.userData.shared;
    geometry.applyMatrix4(child.matrixWorld);
    const mesh=new THREE.Mesh(geometry,child.material);mesh.userData={...child.userData};mesh.name=`place-${site.kind}-detail`;meshes.push(mesh);
    if(!source.userData.shared)source.dispose();
  }});
  yield* meshes;
}

/** Reuse common materials and box profiles; every tall facade is clipped to its current chunk. */
export function* makePlaceMeshes(index:number,site:PlaceSite,deckMaterial:THREE.Material=M.deck) {
  if(deckMaterial instanceof THREE.MeshStandardMaterial)prepareArchitectureFinish(deckMaterial);
  const from=index*CHUNK_LENGTH,to=from+CHUNK_LENGTH,s=site.start,rng=seededRandom(site.seed),side=site.side;
  const box=(material:THREE.MeshStandardMaterial,size:number[],x:number,y:number,along:number,decorative=false)=>landmarkBox(material,size,[x,y,-(along-from)],decorative,true);
  function* span(material:THREE.MeshStandardMaterial,x:number,width:number,a:number,b:number,y:number,height:number,name:string,decorative=false,levelBase?:number) {
    a=Math.max(a,from);b=Math.min(b,to);if(b<=a)return;
    const mesh=box(material,[width,height,b-a],x,y,(a+b)/2,decorative);mesh.name=name;if(levelBase!==undefined)mesh.userData.levelBase=levelBase;yield mesh;
  }
  function* facade(x:number,a:number,b:number,y:number,height:number,name:string,anchor:number,face:number,tint?:number,material=M.glass) {
    a=Math.max(a,from);b=Math.min(b,to);if(b<=a)return;
    // Glazing only needs its outward face; solid walls already supply its backing and collision.
    const geometry=new THREE.PlaneGeometry(b-a,height,Math.max(1,Math.ceil((b-a)/COURSE_STEP)));
    const mesh=landmarkPart(geometry,material,true);mesh.rotation.y=face*Math.PI/2;
    mesh.position.set(x,y,-((a+b)/2-from));mesh.name=name;mesh.userData.levelBase=anchor;
    if(tint!==undefined)mesh.userData.sceneryTint=tint;yield mesh;
  }
  function* building(x:number,width:number,a:number,b:number,height:number,material:THREE.MeshStandardMaterial,name:string) {
    const angle=RAMP.angleDeg*Math.PI/180;
    const drop=Math.abs(Math.cos(angle)*(courseHeight(b)-courseHeight(a))-Math.sin(angle)*(b-a))+1;
    yield* span(material,x,width,a,b,.46+(height-drop)/2,height+drop,name,false,a);
    yield* span(M.trim,x,width+.5,a,b,.46+height+.12,.24,`${name}-cornice`,true,a);
    // Larger bays suggest storeys without recreating a detailed building on every metre.
    for(const face of [-1,1]) {
      for(let level=3;level+5<height;level+=9)for(let z=a+10;z<b-4;z+=22) {
        yield* facade(x+face*(width/2+.085),z-6,z+6,.46+level+2.2,5.6,`${name}-glazing`,a,face,
          [0x527d87,0x718e91,0x9eaa9b][(Math.floor(z/22)+Math.floor(level/9)+site.seed)%3]);
      }
      for(let level=9;level<height-1;level+=18)yield* facade(x+face*(width/2+.21),a,b,.46+level,.18,`${name}-floor-band`,a,face,undefined,M.trim);
      for(let z=a+10;z<b-4;z+=22)yield* span(M.trim,x+face*(width/2+.14),.22,z-.09,z+.09,.46+height/2,height,`${name}-facade-fin`,true,a);
    }
    // Front/rear walls are prominent on approach and while spinning, not just the long sides.
    for(const [end,normal] of [[a,1],[b,-1]]) {
      const at=end-normal*.085;
      if(at>=from && at<to)for(let level=3;level+5<height;level+=9) {
        const mesh=landmarkPart(new THREE.PlaneGeometry(width*.8,5.6,3),M.glass,true);
        mesh.position.set(x,.46+level+2.2,-(at-from));mesh.rotation.y=normal>0?0:Math.PI;
        mesh.name=`${name}-end-glazing`;mesh.userData.levelBase=a;mesh.userData.sceneryTint=0x688e94;yield mesh;
      }
      for(let level=9;level<height-1;level+=18)
        yield* span(M.trim,x,width+.18,at-.08,at+.08,.46+level,.18,`${name}-end-floor-band`,true,a);
      for(const offset of [-width/6,width/6])
        yield* span(M.trim,x+offset,.18,at-.10,at+.10,.46+height/2,height,`${name}-end-mullion`,true,a);
    }
    if(height>20) {
      const face=-Math.sign(x),edge=x+face*(width/2+.3);
      for(let level=12;level<height-6;level+=18)for(const along of [a+32,a+64]) {
        yield* span(M.trim,edge+face*.6,1.7,along-3,along+3,.46+level,.18,`${name}-balcony`,false,a);
        yield* span(M.steel,edge+face*1.4,.08,along-3,along+3,.46+level+.75,.08,`${name}-balcony-rail`,true,a);
        for(const z of [along-2.9,along+2.9])yield* span(M.steel,edge+face*1.4,.08,z-.05,z+.05,.46+level+.4,.7,`${name}-balcony-post`,true,a);
      }
    }
    if(a-.2>=from && a-.2<to) {
      const sign=makeShopSign(site.seed%16,Math.min(12,width*.7));sign.scale.y=1.25;sign.position.set(x,10.8,-(a-.2-from));
      sign.userData.levelBase=a;sign.name=`${name}-front-sign`;yield sign;
    }
    if(height===52 && a+28>=from && a+28<to) {
      const along=a+28,cx=x-width*.23;
      for(const offset of [-1.4,1.4])yield* span(M.steel,cx+offset,.14,along-1.4,along+1.4,.46+height+.65,1.3,`${name}-tank-support`,false,a);
      for(const [geometry,scale,y] of [[tankCylinder,[2.1,3.3,2.1],height+3.4],[tankCap,[2.35,1.15,2.35],height+5.55]] as const) {
        const mesh=landmarkPart(geometry,M.roof);mesh.scale.set(scale[0],scale[1],scale[2]);mesh.position.set(cx,y,-(along-from));
        mesh.userData.levelBase=a;mesh.userData.sceneryTint=0x986c49;mesh.name=`${name}-water-tank`;yield mesh;
      }
    }
    // A rooftop setback changes the silhouette without adding a second detailed facade.
    const capHeight=height>60?7:3.2,capStart=b-34,capEnd=b-9;
    yield* span(M.roof,x+width*.08,width*.62,capStart,capEnd,.46+height+capHeight/2,capHeight,`${name}-rooftop-setback`,false,a);
    yield* span(M.trim,x+width*.08,width*.65,capStart-.2,capEnd+.2,.46+height+capHeight+.10,.20,`${name}-setback-cap`,true,a);
    const face=-Math.sign(x),front=x+face*(width/2+.13);
    for(let along=a+16;along<b-10;along+=32) {
      yield* span(M.dark,front,.12,along-5.2,along+5.2,2.18,3.35,`${name}-entrance-reveal`,true,along);
      yield* facade(front+face*.11,along-4.8,along+4.8,2.22,3.2,`${name}-lobby-glass`,along,face);
      for(const offset of [-4.9,0,4.9])yield* span(M.steel,front+face*.15,.16,along+offset-.08,along+offset+.08,2.2,3.4,`${name}-lobby-frame`,true,along);
      yield* span(M.trim,front+face*1.3,2.8,along-5.8,along+5.8,4.02,.22,`${name}-entrance-canopy`,false,along);
      yield* span(M.brick,front+face*.19,.12,along-4.8,along+4.8,3.94,.4,`${name}-entrance-fascia`,true,along);
    }
  }
  for(const patch of placePatches(site))yield* surface(index,site,patch,deckMaterial);

  if(site.kind==='plaza') {
    // A low colonnade frames the high terrace, leaving the central banks and view open.
    yield* span(M.brick,side*118,3.5,s+35,site.end-35,ground(side*118,(s+site.end)/2)+4,8,'plaza-retaining-gallery');
    yield* span(M.trim,side*109,18.5,s+45,site.end-45,8.5,.28,'plaza-gallery-canopy');
    for(let along=s+50;along<site.end-40;along+=30) {
      if(along>=from&&along<to)yield box(M.trim,[.6,8,.6],side*103,4.46,along);
      const patch=placePatches(site)[0]!,distance=83,lift=placePatchLift(patch,distance,along);
      yield* prop(index,site,()=>makeBench(),side*distance,along,lift,side*Math.PI/2);
      yield* prop(index,site,()=>{
        const tree=varyScenery(makeTree(rng,'autumn'),'village',index,Math.floor(along));
        tree.scale.multiplyScalar(.85);return tree;
      },side*98,along,lift+1.8);
      yield* prop(index,site,()=>makePlanter(rng),side*83,along+6,lift);
    }
    for(const d of [68,88])yield* span(M.brick,side*d,.24,s+42,site.end-42,ground(side*d,(s+site.end)/2)+(d===68?1.25:2.65),.08,'plaza-terrace-edge',true);
  } else if(site.kind==='highrise') {
    // Unequal blocks frame the road; the right-hand parking roofs remain exposed and rideable.
    yield* building(-side*36,22,s+5,s+98,52,M.brick,'highrise-street-tower');
    yield* building(-side*42,28,s+136,s+267,72,M.concrete,'highrise-stepped-tower');
    yield* building(side*114,20,s+38,s+172,58,M.roof,'highrise-outer-tower');
    yield* building(side*115,22,s+214,s+270,38,M.brick,'highrise-outer-annex');
    for(const [a,b,near,far] of [[70,180,26,56],[90,250,70,100]]) {
      for(const d of [near,far])yield* span(M.steel,side*(d+(d===near?-.05:.05)),.18,s+a,s+b,7.08,.25,'parking-deck-fascia',true);
      for(const along of [s+a+14,s+b-14])if(along>=from&&along<to)
        for(const d of [near+.35,far-.35])yield box(M.trim,[.65,6.42,.65],side*d,3.67,along);
    }
    // The bridge slab leaves the service lane below physically open.
    for(const d of [56,70])yield* span(M.steel,side*d,.22,s+90,s+230,7.08,.18,'parking-bridge-edge',true);
  } else {
    // Long low volumes, loading bays and a chimney give the yard a different skyline.
    yield* building(side*122,14,s+15,s+124,13,M.brick,'yard-service-building');
    yield* span(M.steel,side*123,16,s+12,s+127,13.85,.35,'yard-shed-roof',true,s+15);
    yield* building(side*122,16,s+181,s+252,9,M.roof,'yard-workshop');
    for(const [a,b,near,far] of [[70,180,26,56],[90,250,70,100]])for(const d of [near,far]) {
      yield* span(M.trim,side*d,.20,s+a+6,s+b-6,4.72,.14,'warehouse-roof-trim',true);
    }
    for(const along of [s+45,s+175,s+250])if(along>=from&&along<to) {
      yield box(M.brick,[3.5,2.2,7],side*18,1.56,along);
      yield box(M.steel,[3.6,.12,7.1],side*18,2.72,along,true);
    }
    yield* span(M.brick,side*124,3.4,s+238.3,s+241.7,14.46,30,'yard-chimney',false,s+240);
    yield* span(M.steel,side*124,3.8,s+238.1,s+241.9,29.6,.35,'yard-chimney-cap',true,s+240);
    // An optional outer kicker has a flat lane beside it and a banked landing beyond.
    const lip=s+250;
    if(site.seed%2 && Math.floor((lip-1e-6)/CHUNK_LENGTH)===index) {
      const kicker=makeRoofLaunch(index,lip,side*90,4.2+.46,deckMaterial);kicker.name='yard-roof-kicker';yield kicker;
    }
  }
  yield* makePlaceDetails(index,site);
  yield* makePlaceFurnishings(index,site);

  // A narrow worn approach/rejoin ribbon hints at the line, while remaining ordinary ground.
  for(const [a,b] of [[site.entryStart,site.start],[site.end,site.exitEnd]]) {
    const start=Math.max(from,a),end=Math.min(to,b);if(end<=start)continue;
    const rows=samples(start,end,COURSE_STEP),positions:number[]=[],indices:number[]=[];
    for(const along of rows)for(const offset of [-1.6,1.6]) {
      const x=placeRouteX(site,along)+offset;positions.push(x,ground(x,along)+.025,-(along-from));
    }
    for(let row=0;row<rows.length-1;row++){const i=row*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=landmarkPart(geometry,paving,true);mesh.userData.sceneryTint=0xc6bd96;mesh.name='place-approach';yield mesh;
  }
}
