import * as THREE from 'three';
import {landscapeHeight,LANDSCAPE_X} from './landscape.ts';
import {courseHeight,COURSE_STEP} from './course.ts';
import {CHUNK_LENGTH} from './generation.ts';
import {LANDMARK_MATERIALS as M,landmarkPart,landmarkBox,sharedGeometry} from './environments/landmarkParts.ts';
import type {RidingSite} from './ridingSites.ts';
import {ridingPathX} from './ridingSites.ts';

const finish=M.trim.clone();finish.polygonOffset=true;finish.polygonOffsetFactor=-1;finish.polygonOffsetUnits=-2;
const cliffFinish=finish.clone();cliffFinish.color.setHex(0x9c9c52);
const cliffRock=sharedGeometry(new THREE.DodecahedronGeometry(1));
const smooth=(v:number,a:number,b:number)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};

/** Broad, open profiles leave several lines available through each piece of architecture. */
export function ridingStructureHeight(site:RidingSite,x:number,along:number) {
  const s=along-site.start,length=site.end-site.start;
  if(site.kind==='pavilion')return site.height*smooth(s,0,18)*(1-smooth(s,length-18,length));
  if(site.kind==='cliff') {
    const rise=smooth(s,0,40)*(1-smooth(s,length-40,length));
    const banking=-site.side*.1*Math.cos(s/length*Math.PI*2);
    return rise*(site.height+(x-ridingPathX(site,along))*banking);
  }
  const edge=THREE.MathUtils.clamp((Math.abs(x-site.x)-3.8)/(site.width/2-3.8),0,1);
  const end=site.x*(x-site.x)>0?length-14:length-9;
  return site.height*edge*edge*smooth(s,0,10)*(1-smooth(s,end,length));
}

/** Closed solids follow the exact terrain samples and join the existing chunk collision/batches. */
export function makeRidingStructure(site:RidingSite) {
  const swept=site.kind==='cliff',base=site.owner*CHUNK_LENGTH,min=swept?-site.width/2:site.x-site.width/2,max=swept?site.width/2:site.x+site.width/2;
  const xs=[min,max];
  const columns=site.kind==='spillway'?12:swept?8:4;
  for(let i=1;i<columns;i++)xs.push(min+site.width*i/columns);
  if(!swept)for(const x of LANDSCAPE_X)if(x>min && x<max)xs.push(x);
  xs.sort((a,b)=>a-b);const columnsX=xs.filter((x,i)=>!i || x-xs[i-1]!>1e-7);
  const rows=[site.start,site.end];
  for(let s=site.start;s<site.end;s++)rows.push(s);
  for(let s=Math.ceil(site.start/COURSE_STEP)*COURSE_STEP;s<site.end;s+=COURSE_STEP)rows.push(s);
  rows.sort((a,b)=>a-b);const samples=rows.filter((s,i)=>!i || s-rows[i-1]!>1e-7);
  const vertices:number[]=[],indices:number[]=[],top:number[]=[],ncols=columnsX.length;
  for(const bottom of [false,true])for(const s of samples)for(const column of columnsX) {
    const x=column+(swept?ridingPathX(site,s):0);
    const ground=landscapeHeight(x,s)-courseHeight(s),height=ridingStructureHeight(site,x,s);
    vertices.push(x,ground+(bottom?-.22:height+.008),-(s-base));
  }
  const count=samples.length*ncols;
  for(let row=0;row<samples.length-1;row++)for(let col=0;col<ncols-1;col++) {
    const a=row*ncols+col,b=a+1,c=a+ncols,d=c+1;
    top.push(a,b,c,b,d,c);indices.push(a,b,c,b,d,c,a+count,c+count,b+count,b+count,c+count,d+count);
  }
  for(let row=0;row<samples.length-1;row++) {
    const a=row*ncols,b=a+ncols,c=a+ncols-1,d=c+ncols;
    indices.push(a,b,a+count,b,b+count,a+count,c,c+count,d,d,c+count,d+count);
  }
  for(let col=0;col<ncols-1;col++) {
    const a=col,b=a+1,c=(samples.length-1)*ncols+col,d=c+1;
    indices.push(a,a+count,b,b,a+count,b+count,c,d,c+count,d,d+count,c+count);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const solid=landmarkPart(geometry,M.concrete);solid.name=`rideable-${site.kind}`;
  if(swept)solid.userData.sceneryTint=0xa18a62;
  const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(vertices.slice(0,count*3),3));surface.setIndex(top);surface.computeVertexNormals();
  const meshes=[solid,landmarkPart(surface,swept?cliffFinish:finish,true)];
  const box=(material:THREE.MeshStandardMaterial,size:number[],x:number,y:number,along:number,decorative=false)=>{
    const mesh=landmarkBox(material,size,[x,y,-(along-base)],decorative,true);meshes.push(mesh);return mesh;
  };
  if(site.kind==='pavilion') {
    // Recessed glazing makes the sloping roof read as a pavilion rather than an isolated ramp.
    for(const side of [-1,1])for(const s of [site.start+22,site.start+29,site.start+36]) {
      const x=site.x+side*(site.width/2+.025),ground=landscapeHeight(x,s)-courseHeight(s);
      box(M.dark,[.08,1.9,4.9],x,ground+1.5,s,true);
      box(M.glass,[.035,1.65,4.6],x+side*.06,ground+1.5,s,true);
      box(M.steel,[.08,1.8,.06],x+side*.1,ground+1.5,s,true);
      box(M.trim,[.14,.11,5.05],x+side*.03,ground+.48,s,true);
    }
  } else if(site.kind==='spillway') {
    for(const side of [-1,1])for(let s=site.start+14;s<site.end-12;s+=10) {
      const x=site.x+side*(site.width/2+.12),ground=landscapeHeight(x,s)-courseHeight(s);
      const height=ridingStructureHeight(site,site.x+side*site.width/2,s);
      box(M.brick,[.3,.45,1.35],x,ground+height-.25,s,true);
      box(M.steel,[.32,.07,.9],x,ground+height+.015,s,true);
    }
  } else {
    for(const s of [site.start+35,site.start+75,site.start+110]) {
      const x=ridingPathX(site,s)+site.side*(site.width/2+4),ground=landscapeHeight(x,s)-courseHeight(s);
      const rock=landmarkPart(cliffRock,M.concrete);rock.name='cliff-outcrop';rock.userData.sceneryTint=0xa18a62;
      rock.position.set(x,ground+2.2,-(s-base));rock.scale.set(3.2,4.6,5);rock.rotation.y=(s-site.start)*.08;meshes.push(rock);
    }
  }
  return meshes;
}
