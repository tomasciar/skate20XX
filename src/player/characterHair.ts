import * as THREE from 'three';
import {croppedHairGeometry,sweptLockGeometry} from './modelGeometry.ts';

type Point=readonly[number,number,number];
function tuft(parent:THREE.Group,material:THREE.Material,root:Point,bend:Point,tip:Point,width:number,depth:number,rings=9,sides=10) {
  const mesh=new THREE.Mesh(sweptLockGeometry(root,bend,tip,width,depth,rings,sides),material);parent.add(mesh);
}
/** Base-form Goku: a low asymmetric fan, broad swept side locks, a broken fringe and a jagged nape. */
export function addGokuHair(parent:THREE.Group,hair:THREE.Material) {
  const first=parent.children.length;
  const cap=new THREE.Mesh(new THREE.SphereGeometry(1,24,16,0,Math.PI*2,0,Math.PI*.64),hair);cap.position.set(0,0.05,0.012);cap.scale.set(0.11,0.105,0.108);
  // Expose the forehead between the three bangs; a full cap reads as a solid helmet from the front.
  const capPoints=cap.geometry.getAttribute('position'),source=cap.geometry.index!,indices:number[]=[];
  for(let i=0;i<source.count;i+=3){const a=source.getX(i),b=source.getX(i+1),c=source.getX(i+2);
    if((capPoints.getZ(a)+capPoints.getZ(b)+capPoints.getZ(c))/3<-.25 && (capPoints.getY(a)+capPoints.getY(b)+capPoints.getY(c))/3<.16)continue;
    indices.push(a,b,c);
  }
  cap.geometry.setIndex(indices);cap.geometry.computeVertexNormals();parent.add(cap);
  const locks:readonly[Point,Point,Point,number,number][]=[
    [[-.055,.092,.005],[-.15,.12,.008],[-.232,.173,.015],.112,.086],
    [[-.035,.11,.018],[-.105,.19,.018],[-.175,.245,.016],.12,.087],
    [[.002,.118,.023],[-.005,.215,.025],[-.082,.277,.025],.108,.084],
    [[.048,.112,.035],[.091,.186,.04],[.121,.234,.033],.106,.084],
    [[.075,.084,.022],[.154,.124,.015],[.223,.16,.009],.105,.079],
    [[.08,.05,.035],[.139,.067,.04],[.181,.085,.031],.079,.068],
    // Layer the back outwards and down, instead of repeating the crown from every view.
    [[-.048,.063,.071],[-.108,.091,.125],[-.176,.118,.145],.096,.077],
    [[.038,.069,.073],[.099,.116,.135],[.151,.147,.16],.105,.074],
    [[-.042,.025,.075],[-.073,-.009,.1],[-.088,-.055,.114],.068,.046],
    [[.022,.029,.085],[.027,-.012,.109],[.047,-.061,.113],.067,.046],
    // Three broad, curved bangs give the hairline its characteristic broken outline.
    [[-.044,.09,-.049],[-.079,.049,-.092],[-.065,-.014,-.099],.061,.045],
    [[.006,.102,-.047],[.016,.061,-.099],[-.015,.008,-.105],.061,.046],
    [[.06,.077,-.041],[.086,.039,-.08],[.077,-.007,-.079],.052,.044],
  ];
  for(const [root,bend,tip,w,d] of locks)tuft(parent,hair,root,bend,tip,w,d);
  for(const child of parent.children.slice(first))if(child instanceof THREE.Mesh){child.geometry.scale(.83,.8,.95);child.position.multiply(new THREE.Vector3(.83,.8,.95));}
  parent.add(new THREE.Mesh(croppedHairGeometry('goku'),hair));
}
/** Naruto's hair is a short tousled mass with staggered locks, rather than points on an even crown. */
export function addNarutoHair(parent:THREE.Group,hair:THREE.Material) {
  parent.add(new THREE.Mesh(croppedHairGeometry('naruto'),hair));
  const cap=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),hair);cap.position.set(0,.059,.013);cap.scale.set(.101,.076,.093);parent.add(cap);
  const locks:readonly[Point,Point,Point,number,number][]=[
    [[-.065,.083,-.014],[-.102,.106,-.02],[-.137,.129,-.023],.06,.047],
    [[-.034,.107,-.019],[-.055,.152,-.025],[-.066,.18,-.03],.057,.049],
    [[.003,.111,-.009],[.023,.16,-.018],[.029,.191,-.021],.059,.047],
    [[.046,.101,-.005],[.074,.141,-.012],[.098,.165,-.015],.059,.049],
    [[.073,.074,-.009],[.111,.092,-.02],[.145,.108,-.023],.057,.045],
    [[-.066,.064,.051],[-.111,.077,.085],[-.143,.097,.106],.06,.049],
    [[-.03,.09,.065],[-.058,.129,.103],[-.079,.152,.125],.06,.052],
    [[.019,.098,.062],[.031,.139,.099],[.052,.165,.116],.059,.048],
    [[.063,.064,.054],[.108,.095,.079],[.139,.116,.096],.058,.048],
    [[-.07,.032,.036],[-.101,.017,.055],[-.119,-.007,.074],.049,.039],
    [[.069,.032,.042],[.1,.012,.063],[.117,-.014,.083],.049,.04],
    // Break up the smooth gaps between the main crown locks, including the rear silhouette.
    [[-.004,.114,-.039],[-.019,.15,-.047],[-.025,.175,-.053],.045,.032],
    [[.042,.105,-.037],[.059,.14,-.051],[.067,.174,-.057],.043,.032],
    [[-.066,.086,-.04],[-.09,.12,-.06],[-.113,.148,-.064],.044,.03],
    [[-.008,.113,.046],[-.017,.148,.073],[-.012,.18,.088],.046,.035],
    [[.06,.085,.071],[.081,.113,.11],[.097,.13,.131],.044,.035],
    [[-.046,.052,.075],[-.058,.024,.09],[-.069,-.021,.083],.038,.025],
    [[.001,.047,.085],[.009,.013,.097],[.014,-.035,.083],.039,.026],
    [[.046,.049,.073],[.067,.018,.086],[.068,-.024,.073],.037,.025],
  ];
  const shorten=(point:Point):Point=>[point[0]*.94,.065+(point[1]-.065)*.75,point[2]];
  for(const [root,bend,tip,w,d] of locks)tuft(parent,hair,shorten(root),shorten(bend),shorten(tip),w*.8,d*.65,7,8);
  for(const [x,dy] of [[-.055,.006],[-.018,-.004],[.024,.001],[.06,.008]])tuft(parent,hair,[x!,.094,-.048],[x!+.009,.072,-.086],[x!+.014,.039+dy!,-.1],.035,.012);
}
export function addPonytail(parent:THREE.Group,hair:THREE.Material,accent:THREE.Material) {
  tuft(parent,hair,[0,.004,.1],[.029,-.086,.172],[.01,-.191,.171],.071,.06);
  const tie=new THREE.Mesh(new THREE.TorusGeometry(.031,.007,6,16),accent);tie.position.set(0,-.012,.119);tie.rotation.x=.5;parent.add(tie);
  for(const side of [-1,1])tuft(parent,hair,[side*.078,.018,.006],[side*.089,-.025,.012],[side*.073,-.065,.027],.024,.026);
}
