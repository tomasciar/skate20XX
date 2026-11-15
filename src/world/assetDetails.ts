import * as THREE from 'three';

const shared=<T extends THREE.BufferGeometry>(geometry:T)=>{geometry.userData.shared=true;return geometry;};
const cube=shared(new THREE.BoxGeometry()),panel=shared(new THREE.PlaneGeometry());
type Point=[number,number,number];
function solid(faces:Point[][]) {
  const positions:number[]=[];
  for(const face of faces)for(let i=1;i<face.length-1;i++)positions.push(...face[0]!,...face[i]!,...face[i+1]!);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(Array.from({length:positions.length/3},(_,i)=>i));geometry.computeVertexNormals();return shared(geometry);
}
function pitched(hip:boolean) {
  const a:Point=[-0.5,0,0.5],b:Point=[0.5,0,0.5],c:Point=[0.5,0,-0.5],d:Point=[-0.5,0,-0.5];
  const e:Point=[hip?-0.25:-0.5,1,hip?0:-0.22],f:Point=[hip?0.25:0.5,1,hip?0:-0.22];
  return solid([[a,b,f,e],[c,d,e,f],[b,c,f],[d,a,e],[a,d,c,b]]);
}
const hipRoof=pitched(true),saltboxRoof=pitched(false),skillionRoof=solid([
  [[-0.5,0,0.5],[0.5,0,0.5],[0.5,0.15,0.5],[-0.5,0.15,0.5]],
  [[0.5,0,-0.5],[-0.5,0,-0.5],[-0.5,1,-0.5],[0.5,1,-0.5]],
  [[0.5,0,0.5],[0.5,0,-0.5],[0.5,1,-0.5],[0.5,0.15,0.5]],
  [[-0.5,0,-0.5],[-0.5,0,0.5],[-0.5,0.15,0.5],[-0.5,1,-0.5]],
  [[-0.5,0.15,0.5],[0.5,0.15,0.5],[0.5,1,-0.5],[-0.5,1,-0.5]],
  [[-0.5,0,0.5],[-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5]],
]);
const roundAwning=(()=>{
  const faces:Point[][]=[],point=(x:number,t:number,inner=false):Point=>[x,(inner?0.92:1)*Math.cos(t)-0.5,(inner?0.92:1)*Math.sin(t)-0.5];
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
    faces.push([point(-0.5,a),point(-0.5,b),point(0.5,b),point(0.5,a)],
      [point(-0.5,a,true),point(0.5,a,true),point(0.5,b,true),point(-0.5,b,true)],
      [point(-0.5,a),point(-0.5,a,true),point(-0.5,b,true),point(-0.5,b)],
      [point(0.5,a),point(0.5,b),point(0.5,b,true),point(0.5,a,true)]);
  }
  for(const t of [0,Math.PI/2])faces.push(t===0?[point(-0.5,t),point(0.5,t),point(0.5,t,true),point(-0.5,t,true)]:[point(-0.5,t),point(-0.5,t,true),point(0.5,t,true),point(0.5,t)]);
  return solid(faces);
})();
const coneCap=shared(new THREE.ConeGeometry(0.5,0.5,8).translate(0,0.25,0));

/** A second visual stream combines these details with the existing colour and silhouette choices. */
export function addAssetDetails(root:THREE.Object3D,family:string|undefined,style:number,detailMaterial:THREE.Material,accent:number,trim:number) {
  root.userData.detailVariant=style;
  const roofs:THREE.Object3D[]=[];
  root.traverse(object=>{if(object.userData.variantPart==='roof')roofs.push(object);});
  for(const roof of roofs) {
    const size=roof.userData.roofSize as number[]|undefined,source=roof.children[1] as THREE.Mesh|undefined;
    if(!size || !source || style===0){roof.userData.roofProfile='gable';continue;}
    const mesh=new THREE.Mesh([hipRoof,saltboxRoof,skillionRoof][style-1]!,source.material);
    mesh.scale.set(size[0]!,size[1]!,size[2]!);mesh.userData.sceneryTint=source.userData.sceneryTint;
    roof.clear();roof.add(mesh);roof.userData.roofProfile=['gable','hip','saltbox','skillion'][style];
  }
  if(family==='bench') {
    const back=root.children[1] as THREE.Mesh;
    if(style===1) {
      const other=back.clone();back.scale.y=other.scale.y=0.22;back.position.y=0.8;other.position.y=1.2;root.add(other);
    } else if(style===2)root.remove(back);
    else if(style===3){back.scale.y=0.58;back.position.z=0.27;back.rotation.x=-0.12;}
  }
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    if(object.userData.variantPart==='awning') {
      if(style===1){object.rotation.x=0.16;object.position.z-=0.12;}
      if(style===2){object.geometry=roundAwning;object.scale.y=0.55;object.position.z-=0.1;}
      if(style===3){object.scale.z*=0.65;object.position.z-=0.12;}
    }
    if(object.userData.variantPart==='floor-band' && style===3){object.scale.y*=1.5;object.userData.sceneryTint=accent;}
    if((family==='tank' || family==='silo') && style===2 && object.geometry.type==='SphereGeometry')object.geometry=coneCap;
  });
  if(family!=='car')return;
  function piece(geometry:THREE.BufferGeometry,size:Point,at:Point,tint:number) {
    const mesh=new THREE.Mesh(geometry,detailMaterial);mesh.scale.set(...size);mesh.position.set(...at);
    mesh.userData.collision=false;mesh.userData.sceneryTint=tint;root.add(mesh);return mesh;
  }
  if(style===1)for(const side of [-1,1])piece(panel,[3.4,0.14,1],[side*0.932,0.76,0],accent).rotation.y=side*Math.PI/2;
  if(style===2) {
    let top=0;
    root.traverse(object=>{if(object instanceof THREE.Mesh && object.material.userData.paletteRole==='paint')top=Math.max(top,object.position.y+object.scale.y/2);});
    if(root.userData.vehicleStyle==='van')piece(cube,[0.7,0.16,0.35],[0,top+0.09,0.3],trim);
    else for(const side of [-1,1])piece(cube,[0.065,0.07,1.35],[side*0.58,top+0.04,-0.15],accent);
  }
  if(style===3)for(const side of [-1,1])piece(panel,[0.14,0.6,1],[side*0.27,0.997,1.6],trim).rotation.x=-Math.PI/2;
}
