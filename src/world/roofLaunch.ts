import {createRampShapeGeometry} from './rampShapes.ts';
import {LANDMARK_MATERIALS,landmarkPart} from './environments/landmarkParts.ts';
import {ROOF_LAUNCH} from './roofPlan.ts';
import {CHUNK_LENGTH} from './generation.ts';

const finish=LANDMARK_MATERIALS.concrete.clone();
finish.polygonOffset=true;finish.polygonOffsetFactor=-1;finish.polygonOffsetUnits=-2;

/** A physical roof-edge kicker with a wide flat bypass; no launch force is added to the rider. */
export function makeRoofLaunch(owner:number,end:number,x:number,roofHeight:number) {
  const {width,length,height}=ROOF_LAUNCH;
  const geometry=createRampShapeGeometry({kind:'curved',side:1,width,length,height},end-length),points=geometry.getAttribute('position');
  for(let i=0;i<points.count;i++)points.setXYZ(i,points.getX(i)+x,points.getY(i)+roofHeight,points.getZ(i)-(end-owner*CHUNK_LENGTH-length/2));
  geometry.computeVertexNormals();const mesh=landmarkPart(geometry,finish);mesh.name='roof-exit-kicker';return mesh;
}
