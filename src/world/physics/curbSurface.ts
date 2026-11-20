import * as THREE from 'three';

/** Only explicitly opted-in sidewalks use this. Never apply to doorways, rails, lips or arbitrary props. */
export function makeCurbCollision(width:number,height:number,length:number,run=.22) {
  const positions:number[]=[],indices:number[]=[],half=width/2,rows=Math.ceil(length/5);
  // Broad eased shoulders replace only the small riser. The centre and chunk ends stay exact.
  const across=[-half-run,-half-run*.7,-half-run*.3,-half,half,half+run*.3,half+run*.7,half+run];
  const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  for(let row=0;row<=rows;row++)for(const x of across) {
    const rise=Math.abs(x)<=half?1:1-smooth((Math.abs(x)-half)/run);
    positions.push(x,-height/2+height*rise,length/2-row*length/rows);
  }
  const columns=across.length;
  for(let row=0;row<rows;row++)for(let col=0;col<columns-1;col++) {
    const a=row*columns+col,b=a+1,c=a+columns,d=c+1;indices.push(a,b,c,b,d,c);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
