import * as THREE from 'three';
import {planChunk, seededRandom} from '../planning/generation.ts';
import {makeCone} from '../props/furniture.ts';
import type {SceneryExclusion} from '../environments/layout.ts';
import {populateDistrict} from '../environments/districts.ts';
import {createShadowBuilder} from '../rendering/shadows.ts';
import {landscapeWorldHeight} from '../terrain/landscape.ts';
import {courseHeight, courseSlope, courseX, COURSE_STEP} from '../terrain/course.ts';
import {placeScenery} from '../props/placement.ts';
import {makeLandscape} from '../terrain/landscape.ts';
import {makeStartPlatform, makeStartBoostPad, START_PLATFORM, START_BOOST} from '../structures/startPlatform.ts';
import {makeRampShape} from '../structures/rampShapes.ts';
import {ROOFTOP, makeRooftopLane} from '../structures/workshop.ts';
import {makeLongWarehouse} from '../structures/warehouse.ts';
import {warehouseSiteAt,WAREHOUSE} from '../planning/warehouseSite.ts';
import {explorationExclusions, sideBuildingForChunk, sideRouteCenter} from '../planning/exploration.ts';
import {makeSideBuildingSteps} from '../structures/sideBuildings.ts';
import {ridingSiteForChunk, ridingSiteExclusions} from '../planning/ridingSites.ts';
import {makeRidingStructure} from '../structures/ridingStructures.ts';
import {makeBankFeatures} from '../structures/bankFeatures.ts';
import {RAMP} from '../config.ts';
import {placesForChunk,placeExclusions,placeHasSide} from '../planning/places.ts';
import {writeArchitectureUV} from '../rendering/architectureFinish.ts';
import {makeCurbCollision} from '../physics/curbSurface.ts';
import {makePlaceMeshes} from '../structures/places.ts';
import {branchRoadsForChunk,branchRoadExclusions,branchRoadX} from '../planning/branchRoads.ts';
import {makeBranchRoad,branchCrossesSidewalk} from '../structures/branchRoads.ts';
import {makeBranchFeatures} from '../structures/branchFeatures.ts';
import {makeBranchPlay,makeBranchDockRail} from '../structures/branchPlay.ts';
import {foundryForChunk,foundryExclusions} from '../planning/foundryQuarter.ts';
import {makeFoundryQuarter} from '../structures/foundryQuarter.ts';
import {makeQuarterTraffic} from '../physics/quarterTraffic.ts';
import type {Chunk} from './types.ts';
import type {makeSharedMaterials} from '../rendering/materials.ts';

type ChunkContentOptions={
  index:number;
  root:THREE.Group;
  angle:number;
  sunOnHill:THREE.Vector3;
  asphaltMaterial:THREE.Material;
  mats:ReturnType<typeof makeSharedMaterials>;
  startPlatform:boolean;
  rails:Chunk['rails'];
};

/** Build deterministic course content, yielding between the same bounded work units as the runtime. */
export function* buildChunkContent({index,root,angle,sunOnHill,asphaltMaterial,mats,startPlatform,rails}:ChunkContentOptions) {
  const rng=seededRandom(Math.imul(index,2654435761)^0x9e3779b9);
  const {district,entering,encounters}=planChunk(index);
  const baseHeight=courseHeight(index*RAMP.chunkLength),baseX=courseX(index*RAMP.chunkLength);
  const cosine=Math.cos(angle),sine=Math.sin(angle);
  const coneMeshes:THREE.Group[]=[];
  const places=placesForChunk(index);
  const branches=branchRoadsForChunk(index);

  function* unblockedSpans(crossingAt:(along:number)=>boolean) {
    let start=0;
    for(let end=COURSE_STEP;end<=RAMP.chunkLength;end+=COURSE_STEP) {
      const crossing=[end-COURSE_STEP,end-COURSE_STEP/2,end].some(s=>crossingAt(index*RAMP.chunkLength+s));
      if(!crossing&&end<RAMP.chunkLength)continue;
      const stop=crossing?end-COURSE_STEP:end;
      if(stop>start)yield [start,stop] as const;
      start=end;
    }
  }

  function warpCourse(mesh: THREE.Mesh) {
    if(mesh.geometry.userData.shared) {
      // BufferGeometry.clone shares userData with its source. Give this owned copy
      // separate metadata before clearing the flag, or the next instance mutates the template.
      const source=mesh.geometry;
      mesh.geometry=source.clone();mesh.geometry.userData={...source.userData};delete mesh.geometry.userData.shared;
    }
    mesh.updateMatrix();
    const positions=mesh.geometry.getAttribute('position'),point=new THREE.Vector3();
    const material=mesh.material as THREE.MeshStandardMaterial;
    const mapped=material.userData.architectureFinish && material.userData.architectureFinish!=='asphalt';
    if(mapped){writeArchitectureUV(mesh.geometry,mesh.matrix,index*RAMP.chunkLength);mesh.userData.architectureUV=true;}
    const levelBase=mesh.userData.levelBase as number|undefined,levelHeight=levelBase===undefined?0:courseHeight(levelBase);
    for(let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrix);
      const along=index*RAMP.chunkLength-point.z,height=courseHeight(along);
      if(levelBase!==undefined) {
        // Towers have level floors and vertical walls in world space, even on the tilted hill.
        const rise=point.y-.46+cosine*(levelHeight-height)-sine*(levelBase-along);
        point.y=.46+height-baseHeight+rise*cosine;point.z+=rise*sine;
      } else point.y+=height-baseHeight;
      point.x+=courseX(along)-baseX;
      positions.setXYZ(i,point.x,point.y,point.z);
    }
    mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);
    mesh.updateMatrix();mesh.geometry.computeVertexNormals();return mesh;
  }
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(RAMP.width,RAMP.thickness,RAMP.chunkLength,1,1,RAMP.chunkLength/COURSE_STEP),
    asphaltMaterial
  );
  deck.receiveShadow = true;
  deck.castShadow = true;
  deck.position.set(0, 0, -RAMP.chunkLength / 2);
  root.add(warpCourse(deck));

  for (const side of [-1, 1] as const) {
    // Most edges are open to explore. Short ridge sections still mark exposed shoulders.
    if(!places.some(site=>placeHasSide(site,side)) && district==='ridge' && (index+(side>0?1:0))%2===0 && Math.abs(sideRouteCenter(index*RAMP.chunkLength+10,side))>14) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.5,20,1,1,4), mats.barrier);
      rail.position.set(side * (RAMP.width / 2 + 0.08), RAMP.thickness / 2 + 0.18, -10);
      root.add(warpCourse(rail));
    }

    const x=side*(RAMP.width/2-.4);
    for(const [start,end] of unblockedSpans(s=>branches.some(road=>road.side===side&&s>=road.start&&s<=road.end&&Math.abs(branchRoadX(road,s)-x)<road.width/2+.15))) {
      const edge=new THREE.Mesh(new THREE.BoxGeometry(.12,.002,end-start,1,1,(end-start)/COURSE_STEP),mats.edge);
      edge.position.set(x,RAMP.thickness/2+.001,-(start+end)/2);edge.userData.collision=false;edge.name='road-edge-paint';root.add(warpCourse(edge));
    }
  }

  const dashes = Math.floor(RAMP.chunkLength / 7);
  for (let i = 0; i < dashes; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.002,2.6,1,1,4), mats.dash);
    dash.position.set(0, RAMP.thickness / 2 + 0.001, -4 - i * 7);
    dash.userData.collision = false;
    root.add(warpCourse(dash));
  }

  root.add(makeLandscape(index,mats.terrain,baseHeight,baseX));
  if(index===0 && startPlatform) {
    const platform=makeStartPlatform();
    // A normal offset of h*cos(angle) gives exactly h metres of vertical clearance above the road.
    platform.position.y=RAMP.thickness/2+START_PLATFORM.height*Math.cos(angle);
    root.add(platform);
    for(const side of [-1,1]) {
      const boost=makeStartBoostPad();boost.position.set(side*START_BOOST.x,RAMP.thickness/2,-START_BOOST.along);
      root.add(boost);
    }
  }
  for (const side of [-1,1]) {
    for(const [start,stop] of unblockedSpans(s=>branches.some(road=>branchCrossesSidewalk(road,side,s)))) {
      const length=stop-start;
      const path=new THREE.Mesh(new THREE.BoxGeometry(1.8,.08,length,1,1,length/COURSE_STEP),mats.path);
      path.position.set(side*10.5,.44,-(start+stop)/2);path.receiveShadow=true;path.name='sidewalk';path.userData.collision=false;root.add(warpCourse(path));
      const riding=new THREE.Mesh(makeCurbCollision(1.8,.08,length),mats.path);
      riding.name='sidewalk-support';riding.position.set(side*10.5,.44,-(start+stop)/2);riding.userData.collisionProxy=true;riding.visible=false;root.add(warpCourse(riding));
    }
  }
  for(const road of branches)for(const mesh of makeBranchRoad(index,road,asphaltMaterial,mats.dash))root.add(warpCourse(mesh));
  yield;
  const shadows = createShadowBuilder(sunOnHill), bounds = new THREE.Box3();
  const centerAt = (z: number) => courseX(index*RAMP.chunkLength-z)-baseX;
  const groundAt = (x: number, z: number) => landscapeWorldHeight(x+baseX,index*RAMP.chunkLength-z)-baseHeight+0.1;
  function plant(object: THREE.Object3D, x: number, along: number, yaw = 0) {
    const placed = placeScenery(object,x,along,index*RAMP.chunkLength,baseHeight,angle,yaw,baseX);
    // Roadside shadows are draped on the terrain, which runs underneath the raised road and footpath,
    // so each stays on its own verge. Street lamps stand inside that strip and go without.
    const verge = 11.6;
    if (object.userData.shadow !== 'none' && Math.abs(x) >= verge) {
      // Measure the prop itself, not the terrace it may stand on.
      placed.updateMatrixWorld(true);
      shadows.add(bounds.setFromObject(object), object.userData.shadow === 'round' ? 'round' : 'box', groundAt,
        x > 0 ? verge : -Infinity, x > 0 ? Infinity : -verge,centerAt);
    }
    root.add(placed);
  }

  const warehouse=warehouseSiteAt(index);
  const sideBuilding=sideBuildingForChunk(index);
  const ridingSite=ridingSiteForChunk(index);
  const rooftop=index===2 || (!places.some(site=>placeHasSide(site,1)) && !warehouse && sideBuilding?.side!==1 && ridingSite?.side!==1 && index>2 && index%17===2 && encounters.every(item=>item.x<0));
  const exclusions:SceneryExclusion[]=explorationExclusions(index);
  if(foundryForChunk(index))exclusions.push(...foundryExclusions(index));
  for(const road of branches)exclusions.push(...branchRoadExclusions(road,index));
  for(const place of places)exclusions.push(...placeExclusions(place,index));
  if(rooftop)exclusions.push({minX:7.6,maxX:17,start:10,end:ROOFTOP.end+3});
  if(warehouse)exclusions.push({minX:8.4,maxX:32,start:warehouse.owner===index?WAREHOUSE.rampStart-2:warehouse.start-index*RAMP.chunkLength-4,end:warehouse.end-index*RAMP.chunkLength+warehouse.clearance});
  if(ridingSite)exclusions.push(...ridingSiteExclusions(ridingSite,index));
  yield* populateDistrict({ district, index, entering, rng, plant,exclusions });
  if(rooftop)for(const mesh of makeRooftopLane(index*RAMP.chunkLength))root.add(warpCourse(mesh));
  if(warehouse?.owner===index) {
    let processed=0;
    for(const mesh of makeLongWarehouse(index)) {
      root.add(warpCourse(mesh));if(++processed%8===0)yield;
    }
  }
  if(sideBuilding?.owner===index) {
    let processed=0;
    for(const mesh of makeSideBuildingSteps(sideBuilding)) {
      root.add(warpCourse(mesh));if(++processed%8===0)yield;
    }
  }
  if(ridingSite?.owner===index) {
    let processed=0;
    for(const mesh of makeRidingStructure(ridingSite)) {
      root.add(warpCourse(mesh));if(++processed%8===0)yield;
    }
  }
  for(const mesh of makeBankFeatures(index))root.add(warpCourse(mesh));
  for(const road of branches) {
    let processed=0;
    for(const mesh of makeBranchFeatures(index,road,asphaltMaterial)) {
      root.add(warpCourse(mesh));if(++processed%8===0)yield;
    }
    for(const mesh of makeBranchPlay(index,road,asphaltMaterial)) {
      root.add(warpCourse(mesh));if(++processed%8===0)yield;
    }
    const dock=makeBranchDockRail(index,road,mats.rail);
    if(dock){root.add(...dock.meshes);rails.push(dock.rail);}
  }
  for(const place of places) {
    let processed=0;
    for(const mesh of makePlaceMeshes(index,place,asphaltMaterial)) {
      root.add(warpCourse(mesh));if(++processed%8===0)yield;
    }
  }
  if(foundryForChunk(index)) {
    let processed=0;
    for(const mesh of makeFoundryQuarter(index,asphaltMaterial)) {
      root.add(mesh.userData.courseWarped?mesh:warpCourse(mesh));if(++processed%6===0)yield;
    }
    const traffic=makeQuarterTraffic(index);if(traffic)root.add(traffic);
  }

  for (const item of encounters) {
    const { x, along, width, length, height, kind } = item;
    const y = RAMP.thickness / 2;
    if(kind==='curved' || kind==='bank') {
      const shape={kind,width,length,height,side:(x<0?-1:1) as -1|1};
      for(const mesh of makeRampShape(shape,kind==='bank'?mats.bank:mats.kicker,mats.lip,index*RAMP.chunkLength+along-length/2)) {
        mesh.position.set(x,y,-along);root.add(warpCourse(mesh));
      }
      continue;
    }
    if (kind === 'rail' || kind === 'ledge') {
      // Each grind remains a straight, rigid line, aligned between two points on the bend.
      const s=index*RAMP.chunkLength+along;
      const start=new THREE.Vector3(x+courseX(s-length/2)-baseX,y+courseHeight(s-length/2)-baseHeight+height,-along+length/2);
      const end=new THREE.Vector3(x+courseX(s+length/2)-baseX,y+courseHeight(s+length/2)-baseHeight+height,-along-length/2);
      const tangent=end.clone().sub(start),physicalLength=tangent.length();tangent.normalize();
      const normal=new THREE.Vector3(0,1,(end.y-start.y)/length).normalize();
      const right=new THREE.Vector3().crossVectors(tangent,normal).normalize();
      const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,tangent.clone().negate()));
      const center=start.clone().lerp(end,0.5);
      if(kind==='ledge') {
        const depth=height+0.5;
        const block=new THREE.Mesh(new THREE.BoxGeometry(width,depth,physicalLength),mats.ledge);
        block.position.copy(center).addScaledVector(normal,0.07-depth/2);block.quaternion.copy(rotation);root.add(block);
        for(const side of [-1,1]) {
          const coping=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,physicalLength),mats.rail);
          coping.position.copy(center).addScaledVector(normal,0.045).addScaledVector(right,side*(width/2-0.02));
          coping.quaternion.copy(rotation);coping.userData.collision=false;root.add(coping);
        }
      } else {
        const top=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.14,physicalLength),mats.rail);
        top.position.copy(center);top.quaternion.copy(rotation);root.add(top);
        for(const z of [-length/2+0.6,0,length/2-0.6]) {
          const point=start.clone().lerp(end,(length/2-z)/length),ground=y+courseHeight(s-z)-baseHeight;
          const support=new THREE.Mesh(new THREE.BoxGeometry(0.12,Math.max(0.05,point.y-ground),0.12),mats.rail);
          support.position.set(point.x,(ground+point.y)/2,point.z);root.add(support);
          const foot=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.05,0.5),mats.lip);
          foot.position.set(point.x,ground+0.025,point.z);foot.quaternion.copy(rotation);root.add(foot);
        }
      }
      rails.push({id:`${index}:${along}`,normal,
        start:start.addScaledVector(normal,0.07),end:end.addScaledVector(normal,0.07)});
      continue;
    }
    if (kind === 'cones') {
      for (let i = 0; i < 3; i++) {
        const cone = makeCone();
        cone.userData.collision=false;cone.userData.looseProp=true;cone.name='loose-cone';
        const s=index*RAMP.chunkLength+along-(i-1)*1.5;
        cone.position.set(x+courseX(s)-baseX,y+courseHeight(s)-baseHeight,-along+(i-1)*1.5); cone.rotation.x=Math.atan(courseSlope(s));
        root.add(cone);
        coneMeshes.push(cone);
      }
      continue;
    }
    // A solid kicker wedge begins flush with the asphalt; physics and render share vertices.
    const w = width / 2, l = length / 2;
    const vertices = new Float32Array([-w, 0, l, w, 0, l, -w, 0, -l, w, 0, -l, -w, height, -l, w, height, -l]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0,1,5, 0,5,4, 2,4,5, 2,5,3, 0,4,2, 1,3,5, 0,2,3, 0,3,1]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mats.kicker);
    mesh.position.set(x,y,-along); root.add(warpCourse(mesh));
    // Colored lip announces the optional jump without forming a raised collision seam.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, 0.25), mats.lip);
    lip.position.set(x, y + height - height*0.13/length + 0.003, -along - length / 2 + 0.13); lip.userData.collision = false; root.add(warpCourse(lip));
  }
  return {coneMeshes,shadows};
}
