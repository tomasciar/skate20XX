import * as THREE from 'three';
import type {NitroState} from '../player/movement/nitro.ts';
import {nitroHeading} from '../player/movement/nitro.ts';
import type {createParticles,ParticleStyle} from './particles.ts';

const TRAIL:ParticleStyle={color:0x20cfff,size:.3,life:.28,drag:.8,grow:.2,opacity:.8,glow:true};
const CORE:ParticleStyle={color:0xc5faff,size:.13,life:.18,drag:.6,grow:.1,opacity:1,glow:true};

/** Uses the existing fixed particle pool; no extra draw calls or per-frame objects. */
export function createNitroEffects(particles:ReturnType<typeof createParticles>) {
  const direction=new THREE.Vector3(),side=new THREE.Vector3(),at=new THREE.Vector3(),motion=new THREE.Vector3();
  let strength=0,owed=0;
  function reset(){strength=owed=0;}
  function update(dt:number,nitro:Readonly<NitroState>,position:THREE.Vector3,velocity:THREE.Vector3,up:THREE.Vector3,forward:THREE.Vector3,downhill:THREE.Vector3,crashed=false) {
    dt=Math.max(0,Math.min(.05,dt));
    const active=nitro.active && !crashed;
    strength=THREE.MathUtils.damp(strength,active?1:0,active?16:7,dt);
    if(!active){owed=0;if(strength<.001)strength=0;return;}
    nitroHeading(forward,downhill,up,direction);
    side.crossVectors(direction,up).normalize();
    motion.copy(velocity).multiplyScalar(.08).addScaledVector(direction,-5).addScaledVector(up,.2);
    // Fill the distance travelled this frame so fast motion leaves a continuous wake.
    owed+=180*dt;
    const count=Math.floor(owed);owed-=count;
    for(let i=0;i<count;i++) {
      at.copy(position).addScaledVector(velocity,-dt*i/Math.max(count,1))
        .addScaledVector(direction,-.38).addScaledVector(up,.04).addScaledVector(side,i%2?.15:-.15);
      particles.emit(TRAIL,at,motion,.65);
      particles.emit(CORE,at,motion,.2);
    }
  }
  return {update,reset,get strength(){return strength;}};
}
