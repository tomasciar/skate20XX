import * as THREE from 'three';
import { courseHeight, COURSE_STEP } from './course.ts';
export const LANDSCAPE_HALF_WIDTH = 260;
export const LANDSCAPE_X = [-260,-220,-180,-145,-115,-90,-70,-52,-38,-26,-18,-12,-8.3,0,8.3,12,18,26,38,52,70,90,115,145,180,220,260];
const STEP = COURSE_STEP;
function elevation(x: number, along: number, roadHeight: number) {
  const side = Math.sign(x), distance = Math.abs(x);
  const blend = THREE.MathUtils.smoothstep(distance,12,70);
  return roadHeight + 0.16 + blend * ((side < 0 ? 9 : -7) + Math.sin(along * 0.008 + side) * 5
    + Math.sin(distance * 0.026 + along * 0.005) * 6 + Math.sin(along * 0.021 + distance * 0.019) * 2.5);
}
// Placement and normal sampling repeatedly visit the same grid vertices. Keep a bounded
// set of height rows around streamed chunks instead of recomputing their terrain noise.
const heightRows = new Map<number,Float64Array>();
function heightRow(along: number) {
  let row=heightRows.get(along);
  if(!row) {
    const roadHeight=courseHeight(along);
    row=Float64Array.from(LANDSCAPE_X,x=>elevation(x,along,roadHeight));
    heightRows.set(along,row);
    if(heightRows.size>256)heightRows.delete(heightRows.keys().next().value!);
  }
  return row;
}
/** Uses the same triangles as the mesh, so scenery sits exactly on its supporting ground. */
export function landscapeHeight(x: number, along: number) {
  x = THREE.MathUtils.clamp(x,-LANDSCAPE_HALF_WIDTH,LANDSCAPE_HALF_WIDTH);
  let i = 0;
  while (i < LANDSCAPE_X.length - 2 && LANDSCAPE_X[i+1]! < x) i++;
  const x0 = LANDSCAPE_X[i]!, x1 = LANDSCAPE_X[i+1]!;
  const z = Math.floor(along / STEP) * STEP, u = (x-x0)/(x1-x0), v = (along-z)/STEP;
  const first=heightRow(z),second=heightRow(z+STEP);
  const a=first[i]!,b=first[i+1]!,c=second[i]!,d=second[i+1]!;
  return u+v <= 1 ? a+u*(b-a)+v*(c-a) : d+(1-u)*(c-d)+(1-v)*(b-d);
}
export function makeLandscape(index: number, material: THREE.Material, originHeight = 0) {
  const columns = LANDSCAPE_X.length, rows = 15;
  const positions = new Float32Array(columns * rows * 3), normals = positions.slice(), colors = positions.slice(), uv = new Float32Array(columns * rows * 2);
  const indices: number[] = [], normal = new THREE.Vector3(), color = new THREE.Color(), grass = new THREE.Color(0x68864e), forest = new THREE.Color(0x3e6c49), rock = new THREE.Color(0x929585);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = LANDSCAPE_X[col]!, along = index * 70 + row * STEP, y = landscapeHeight(x,along), i = row*columns+col;
    positions.set([x,y-originHeight,-row*STEP],i*3); uv.set([x/20,along/20],i*2);
    const dx = (landscapeHeight(x+0.5,along)-landscapeHeight(x-0.5,along));
    const dz = (landscapeHeight(x,along+0.5)-landscapeHeight(x,along-0.5));
    normal.set(-dx,1,dz).normalize().toArray(normals,i*3);
    color.copy(x < 0 ? forest : grass).lerp(rock,THREE.MathUtils.clamp((y-courseHeight(along)-12)/25,0,0.45));
    color.multiplyScalar(0.96 + Math.sin(x*0.05+along*0.013)*0.04); color.toArray(colors,i*3);
    if (row < rows-1 && col < columns-1) { const a=i,b=i+1,c=i+columns,d=c+1; indices.push(a,b,c,b,d,c); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3)); geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2)); geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry,material); mesh.name = 'surrounding-terrain'; mesh.receiveShadow = true; return mesh;
}
