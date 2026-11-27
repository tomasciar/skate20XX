import * as THREE from 'three';
import {BOARD,FOOT_Y,RIDER,SNOWBOARD} from '../dimensions.ts';
import {CARVE} from '../movement/carve.ts';
import {TUCK,createGrabTransform,softenGrab} from './grabPose.ts';
import type {GrabDef} from '../tricks/grabs.ts';
import {createRiderMotion,createLimbSolver} from './pose.ts';
import {createCruisePose} from './cruisePose.ts';
import {createAirPose} from './airPose.ts';
import {sampleTrickFoot} from './trickFeet.ts';
import type {TrickFootPose} from './trickFeet.ts';
import type {RiderRig} from '../visuals/riderRig.ts';
import type {BoardVisual} from '../visuals/boardVisual.ts';
import type {SkaterPose,SkaterAppearance} from '../visuals/types.ts';

const RIDING_GRAB = {...TUCK,offset:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},
  crouch:0.95,hipDrop:0.14,chestPitch:-0.4};
/** Radians of upper-body lean at full flip speed; `head` adds subtle neck follow-through. Rates are per second. */
export const FLIP_LEAN = {forward:0.744,back:0.696,side:0.672,head:1.1,tuck:0.36,grab:0.785,ease:15,settle:14} as const;

/** Pose only: every rig owns its blend state, IK buffers, and reset lifecycle. */
export function createRiderPose(rig:RiderRig,equipment:BoardVisual,appearance:SkaterAppearance) {
  const {rider,hips,torso,head}=rig;
  const {board,deck,wheels}=equipment;
  const arms=rig.arms.map(arm=>({...arm,restHand:new THREE.Vector3(),restReady:false,
    airHand:new THREE.Vector3(),airReady:false,shoulderTarget:new THREE.Vector3(),handTarget:new THREE.Vector3(),
    gripTarget:new THREE.Vector3(),pole:new THREE.Vector3(),sleeveEnd:new THREE.Vector3(),solve:createLimbSolver()}));
  const legs=rig.legs.map(leg=>({...leg,trickPose:{x:0,y:0,z:0,pitch:0,yaw:0,roll:0} satisfies TrickFootPose,
    ankle:new THREE.Vector3(),hipTarget:new THREE.Vector3(),kneePole:new THREE.Vector3(),solve:createLimbSolver()}));
  const axis = new THREE.Vector3(0, 1, 0);
  const hipReachDelta=new THREE.Vector3(),segmentDirection=new THREE.Vector3();
  function segment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    const direction = segmentDirection.copy(b).sub(a); m.scale.y = direction.length();
    m.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  const motion = createRiderMotion();
  const cruisePose=createCruisePose(),restTarget=new THREE.Vector3();
  const airPose=createAirPose(),airTarget=new THREE.Vector3(),gripReach=new THREE.Vector3();
  let grabBlend = 0, carve = 0, manual = 0, flipPitch = 0, flipRoll = 0;
  const carveTilt = new THREE.Quaternion(), riderX = new THREE.Vector3(1,0,0), gripPivot = new THREE.Vector3(0,BOARD.gripY,0);
  let heldGrab: GrabDef | null = null;
  let heldGroundGrab = false;
  const manualRotation=new THREE.Quaternion(),manualPivot=new THREE.Vector3(),manualOffset=new THREE.Vector3();
  const inverseStance=new THREE.Quaternion();
  const headDirection=new THREE.Vector3(),headParent=new THREE.Quaternion();
  const headAngles=new THREE.Euler(0,0.65,0,'YXZ');
  let headYaw=0.65;
  const kickRotation=new THREE.Quaternion(),kickEuler=new THREE.Euler();
  const sampleGrab=createGrabTransform(),gripRotationOffset=new THREE.Vector3();
  const stance=new THREE.Quaternion().setFromAxisAngle(axis,RIDER.stanceY),reverseStance=stance.clone().invert();
  const grabRotation=new THREE.Quaternion(),inverseHips=new THREE.Quaternion(),inverseTorso=new THREE.Quaternion();
  function setPose(opts:SkaterPose) {
    const {mode}=appearance;
    const {bodyScale,legScale,armScale,hipDrop,hipWidth,shoulderSpan}=appearance.proportions;
    const slide=opts.airborne || opts.grinding || opts.bail ? 0 : THREE.MathUtils.clamp(opts.slide ?? 0,-1,1);
    const m = motion.update(opts.dt, opts.crouch, opts.lean, opts.airborne && !opts.grinding, opts.push, opts.verticalSpeed, opts.speed, opts.pump, opts.grinding);
    const riding = !opts.airborne && !opts.grinding && !opts.bail;
    const groundGrab = riding ? opts.groundTrick?.grab : null;
    const selectedGrab = groundGrab ?? (opts.airborne && !opts.grinding && !opts.bail ? opts.grab : null);
    const cruise=cruisePose.update({dt:opts.dt,active:riding&&!groundGrab,
      speed:opts.speed,turn:opts.carve ?? m.lean*.6,surfacePitch:opts.surfacePitch,travelSide:opts.travelSide ?? 1});
    const footTrick=opts.airborne && !opts.grinding && !opts.bail && !selectedGrab ? opts.trick : null;
    const trickProgress=footTrick ? (opts.trickTime ?? 0)/footTrick.duration : 0;
    const air=airPose.update({dt:opts.dt,active:opts.airborne&&!opts.grinding&&!opts.bail,verticalSpeed:opts.verticalSpeed,
      turn:opts.lean,yaw:opts.rotationRate?.yaw,
      pitch:opts.rotationRate?.pitch ?? opts.flipLean?.pitch ?? 0,roll:opts.rotationRate?.roll ?? opts.flipLean?.roll ?? 0,
      travelSide:cruise.travelSide});
    // Blend out before changing hands or grip targets, avoiding a hand snapping across the board.
    if (selectedGrab && (!heldGrab || heldGrab.id === selectedGrab.id || grabBlend < 0.02)) {
      heldGrab = selectedGrab;heldGroundGrab=!!groundGrab;
    }
    const grabbing = !!selectedGrab && heldGrab?.id === selectedGrab.id;
    grabBlend = THREE.MathUtils.damp(grabBlend, grabbing ? 1 : 0, 14, opts.dt);
    if ((heldGroundGrab ? !riding : !opts.airborne) || opts.grinding || opts.bail) grabBlend = 0;
    if (!selectedGrab && grabBlend < 0.002) { heldGrab = null; grabBlend = 0; }
    if (opts.boardSpin.x || opts.boardSpin.y || opts.boardSpin.z) { grabBlend = 0; heldGrab = null; }
    carve = THREE.MathUtils.damp(carve, opts.airborne || opts.grinding || opts.bail ? 0 : THREE.MathUtils.clamp(opts.carve ?? 0,-1,1), 10, opts.dt);
    if (Math.abs(carve) < 1e-5) carve = 0;
    manual = riding ? THREE.MathUtils.damp(manual,(opts.groundTrick?.manual ?? 0)*(opts.travelSide ?? 1),10,opts.dt) : 0;
    if (Math.abs(manual)<1e-5) manual=0;
    const cruiseWeight=cruise.weight*(1-grabBlend)*(1-Math.abs(manual)*.25)*(1-m.push)*(1-Math.abs(slide))
      *(1-THREE.MathUtils.smoothstep(m.crouch,.15,.65));
    // Roll about the grip centerline: the soles stay planted and the wheels stay on the road.
    const tilt = carve ? -carve * CARVE.deckTilt : 0;
    deck.rotation.z = tilt;
    deck.position.copy(gripPivot).sub(gripRotationOffset.copy(gripPivot).applyEuler(deck.rotation));
    const edgeLift=mode==='snowboard' ? Math.abs(Math.sin(tilt))*SNOWBOARD.halfWidth+(1-Math.cos(tilt))*(BOARD.gripY-SNOWBOARD.baseY) : 0;
    deck.position.y+=edgeLift;
    carveTilt.setFromAxisAngle(riderX, tilt);
    // Lean into a whole-body flip: ease in with the rotation, and settle quickly once the wheels are down.
    const flip=opts.airborne && !opts.grinding && !opts.bail ? opts.flipLean : undefined;
    const flipRate=opts.airborne ? FLIP_LEAN.ease : FLIP_LEAN.settle;
    flipPitch=THREE.MathUtils.damp(flipPitch,THREE.MathUtils.clamp(flip?.pitch ?? 0,-1,1),flipRate,opts.dt);
    flipRoll=THREE.MathUtils.damp(flipRoll,THREE.MathUtils.clamp(flip?.roll ?? 0,-1,1),flipRate,opts.dt);
    if(opts.bail || (!flip?.pitch && !flip?.roll && Math.hypot(flipPitch,flipRoll)<1e-3))flipPitch=flipRoll=0;
    // Keep held-grab lean restrained so the fixed grip remains within arm's reach.
    const flipScale=1-FLIP_LEAN.grab*grabBlend;
    const rotationWeight=air.weight*(1-cruiseWeight)*flipScale;
    const spinCheck=Math.min(1,Math.max(0,Math.abs(air.hipYaw)-Math.abs(air.yaw))*2);
    const leanPitch=flipPitch*(flipPitch>0 ? FLIP_LEAN.back : FLIP_LEAN.forward)*flipScale, leanRoll=flipRoll*FLIP_LEAN.side*flipScale;
    const flipTuck=Math.min(1,Math.hypot(flipPitch,flipRoll));
    // The rear grab arches the back by itself; leaning back with a flip on top would cock the rider too far.
    const baseTweak = heldGroundGrab ? RIDING_GRAB : heldGrab?.tweak ?? TUCK;
    const tweak = heldGrab?.direction==='back' && !heldGroundGrab ? softenGrab(baseTweak,Math.max(0,flipPitch)) : baseTweak;
    const c = THREE.MathUtils.lerp(THREE.MathUtils.clamp(m.crouch+m.air*0.25+m.kneeLoad+Math.abs(manual)*0.25+Math.abs(slide)*0.5+flipTuck*FLIP_LEAN.tuck
      +cruiseWeight*(.06+cruise.pace*.035+Math.abs(cruise.turn)*.05+cruise.compression)
      +rotationWeight*(Math.abs(air.yaw)*.07+Math.abs(air.spinEffort)*.04+Math.abs(air.pitchEffort)*.04),0,1),tweak.crouch,grabBlend);
    const grabPose = sampleGrab(tweak,grabBlend);
    board.position.copy(grabPose.offset).applyQuaternion(stance);
    const rhythm = Math.sin(m.time * 5.2);
    const breathing = Math.sin(m.time * 1.15) * .0012;
    const pushSwing = Math.sin(m.pushPhase) * m.push;
    for (const w of wheels) w.rotation.x = opts.wheelRoll;
    equipment.activeShape?.update(opts.dt,opts.speed,opts.airborne || opts.grinding ? undefined : opts.travelSide ?? 1);
    // Wheel contacts stay fixed. Weight shifts belong to the rider, not a rolling wheel group.
    board.rotation.set(opts.boardSpin.x, opts.boardSpin.y, opts.boardSpin.z);
    if (grabBlend > 0) board.quaternion.premultiply(grabRotation.copy(stance).multiply(grabPose.rotation).multiply(reverseStance));
    if (manual) {
      // Pitch around the supporting axle: its wheel centers and contact height stay fixed.
      manualRotation.setFromAxisAngle(riderX,manual*0.22);
      manualPivot.set(0,BOARD.wheelY,Math.sign(manual)*BOARD.truckZ);
      manualOffset.copy(manualPivot).sub(manualPivot.applyQuaternion(manualRotation));
      board.position.copy(manualOffset);board.quaternion.premultiply(manualRotation);
      inverseStance.copy(stance).invert();
      grabPose.offset.copy(manualOffset).applyQuaternion(inverseStance);
      grabPose.rotation.copy(inverseStance).multiply(manualRotation).multiply(stance);
    }
    const ridingGrabBlend=heldGroundGrab ? grabBlend : 0;
    const grabHand=heldGrab?.hand ?? 1;
    const hipY = RIDER.hipHeight - hipDrop - c * 0.22 - grabBlend * tweak.hipDrop - m.landing - m.push * (0.035 + Math.abs(m.lean) * 0.025) + breathing;
    hips.position.set(pushSwing * 0.012 + m.sway * 0.5 + tweak.hipX*grabBlend + manual*0.16 - grabHand*ridingGrabBlend*0.08,
      hipY - Math.abs(carve)*0.03, 0.025 + c * 0.1 - m.lean * 0.065*(1-grabBlend) - carve*0.09 + m.sway + slide*0.07);
    // Hips counter the flip lean so the weight stays over the board.
    hips.position.x+=leanRoll*0.04;hips.position.z-=leanPitch*0.03;
    hips.position.x+=cruiseWeight*cruise.travelSide*(-.012+cruise.acceleration*.035+cruise.settle*.024);
    hips.position.z+=cruiseWeight*(cruise.settle*.008-cruise.turn*.018);
    hips.rotation.set(cruiseWeight*(cruise.settle*.025-cruise.turn*.04),
      cruiseWeight*(cruise.turn*.09+cruise.settle*.055),
      cruiseWeight*cruise.travelSide*(cruise.settle*.025+cruise.acceleration*.035));
    hips.rotation.x+=rotationWeight*air.pitchEffort*.035;
    hips.rotation.y+=rotationWeight*air.hipYaw*.10;
    hips.rotation.z+=rotationWeight*air.rollEffort*.04;
    // Toeside carves fold the chest over the toes; heelside carves sit back over the heels.
    torso.rotation.set(THREE.MathUtils.lerp(-0.08-c*0.25-m.brake*0.1,tweak.chestPitch,grabBlend) - carve*(carve>0 ? 0.26 : 0.14) - slide*0.15,
      -0.15+pushSwing*0.07+m.sway*2, m.lean*0.13-m.sway*1.2+tweak.chestRoll*grabBlend - manual*0.12 - grabHand*ridingGrabBlend*0.95);
    torso.rotation.x+=leanPitch;torso.rotation.z+=leanRoll;
    torso.rotation.x+=cruiseWeight*(-.065+(cruise.turn-cruise.chestTurn)*.13-cruise.chestSettle*.025);
    torso.rotation.y=THREE.MathUtils.lerp(torso.rotation.y,cruise.travelSide*.18+cruise.chestTurn*.14-cruise.chestSettle*.07,cruiseWeight);
    torso.rotation.z-=cruiseWeight*cruise.travelSide*(cruise.acceleration*.085+cruise.chestSettle*.035);
    torso.rotation.x+=rotationWeight*air.pitchEffort*.09;
    torso.rotation.y+=rotationWeight*(air.yaw*.22+air.spinEffort*.18);
    torso.rotation.z+=rotationWeight*air.rollEffort*.10;
    for (const l of legs) {
      // Only the pushing foot leaves the grip; all other weight shifts preserve the stance.
      l.foot.position.set(0,FOOT_Y-BOARD.gripY,0).applyQuaternion(carveTilt);
      l.foot.position.x+=l.side*0.255; l.foot.position.y+=BOARD.gripY+edgeLift;
      l.foot.position.applyQuaternion(grabPose.rotation).add(grabPose.offset);
      l.foot.quaternion.copy(grabPose.rotation).multiply(carveTilt);
      if (l.side === 1) {
        const phase = m.pushPhase;
        const lift = Math.max(0, Math.sin(phase));
        const stroke = Math.max(0, -Math.sin(phase));
        l.foot.position.x += Math.cos(phase) * m.push * 0.09;
        l.foot.position.z += m.push * (0.16 + stroke * 0.07);
        l.foot.position.y += m.push * (lift * 0.06 - stroke * 0.10);
      }
      if(footTrick) {
        sampleTrickFoot(footTrick.id,trickProgress,l.side,l.trickPose);
        const kick=l.trickPose;
        l.foot.position.x+=kick.x;l.foot.position.y+=kick.y;l.foot.position.z+=kick.z;
        kickRotation.setFromEuler(kickEuler.set(kick.pitch,kick.yaw,kick.roll));
        l.foot.quaternion.multiply(kickRotation);
      }
      // Keep the deck and planted shoes at their actual size while Kick's anatomy is smaller.
      l.foot.position.divideScalar(bodyScale);
      l.ankle.set(0,.06/bodyScale,0).applyQuaternion(l.foot.quaternion).add(l.foot.position);
    }
    // A shorter rider shifts his hips slightly toward extended feet, keeping both ankles
    // connected through full-size board tweaks instead of stretching the lower legs.
    if(bodyScale<1)for(let pass=0;pass<6;pass++)for(const l of legs) {
      hipReachDelta.set(l.side*.095*hipWidth,0,0).applyQuaternion(hips.quaternion).add(hips.position).sub(l.ankle).negate();
      const distance=hipReachDelta.length(),reach=(RIDER.upperLeg+RIDER.lowerLeg)*legScale-.0002;
      if(distance>reach)hips.position.addScaledVector(hipReachDelta,(distance-reach)/distance);
    }
    for(const l of legs) {
      const hip = l.hipTarget.set(l.side * 0.095 * hipWidth, 0, 0).applyQuaternion(hips.quaternion).add(hips.position);
      const ankle=l.ankle;
      // Rear tucks fold the knees down below the hips, rather than up through the waist.
      const pole=tweak.kneePole;
      const kneePole=pole ? l.kneePole.set(pole.x*grabBlend,pole.y*grabBlend,THREE.MathUtils.lerp(-1,pole.z,grabBlend)) : l.kneePole.set(0,0,-1);
      const solved = l.solve(hip, ankle, kneePole, RIDER.upperLeg*legScale, RIDER.lowerLeg*legScale);
      segment(l.thigh, hip, solved.joint); segment(l.shin, solved.joint, solved.end); l.knee.position.copy(solved.joint);
    }
    for (const a of arms) {
      const leading=(1-a.side*cruise.travelSide)/2,load=Math.abs(cruise.turn),lag=cruise.turn-cruise.armTurn;
      const airLeading=(1-a.side*air.travelSide)/2;
      const airWeight=air.weight*(1-cruiseWeight)*(heldGrab&&a.side===heldGrab.hand?1-grabBlend:1);
      const shoulderOffset=.17*(shoulderSpan-1);
      const shoulder = a.shoulderTarget.set(a.side * .17 * shoulderSpan, 0.36, 0);
      shoulder.y+=cruiseWeight*(-.006-leading*.008+a.side*cruise.chestTurn*.012-a.side*cruise.chestSettle*.008+manual*a.side*.012);
      shoulder.z+=cruiseWeight*(.006-leading*.018+a.side*lag*.008);
      shoulder.y+=airWeight*(air.lift*.012+air.descent*.008+a.side*air.roll*.012);
      shoulder.z+=airWeight*(air.pitch*.012+a.side*air.turn*.008);
      shoulder.z-=airWeight*a.side*(air.spinEffort*.02+air.yaw*.012);
      const spread = 0.27 + shoulderOffset + m.air * 0.07 + (opts.grinding ? 0.10 : 0) + Math.abs(manual)*0.1 + Math.abs(slide)*0.1;
      const hand = a.handTarget.set(a.side * spread + m.lean * 0.04 - m.sway,
        -0.04 + c * 0.14 + m.air * 0.04 + a.side * pushSwing * 0.035,
        -0.08 - c * 0.16 + a.side * pushSwing * 0.11 + rhythm * 0.009);
      // Let the arms hang loosely from the leaning shoulders, with a small directional follow-through.
      hand.x+=a.side*flipTuck*0.02-leanRoll*0.1;
      hand.y+=a.side*flipRoll*0.025*flipScale;
      hand.z+=leanPitch*0.1;
      // A leading arm slightly forward and a quieter trailing arm. Their balance corrections
      // follow the hips/chest at different rates; they don't swing on a shared idle clock.
      restTarget.set(a.side*(.28+leading*.03+load*.065)+cruise.settle*.012,
        .005+leading*.025+c*.10+load*(.05+leading*.03)-a.side*cruise.chestSettle*.018,
        -.065-leading*.085-c*.09-cruise.armTurn*.055+lag*.10+cruise.acceleration*.025-a.side*cruise.chestSettle*.018);
      // Arms counter the wheel balance: reach toward the nose in a manual and toward the tail in a nose manual.
      restTarget.x-=manual*.075;
      restTarget.x+=a.side*shoulderOffset;
      restTarget.y+=Math.abs(manual)*(.09+(1-a.side*Math.sign(manual))*.0225);
      restTarget.z+=manual*a.side*.035;
      if(!a.restReady){a.restHand.copy(restTarget);a.restReady=true;}
      else a.restHand.lerp(restTarget,1-Math.exp(-(4.5+leading*1.5)*opts.dt));
      hand.lerp(a.restHand,cruiseWeight);
      const flick=footTrick?Math.sin(Math.PI*THREE.MathUtils.smoothstep(trickProgress,0,.65))
        *(1-THREE.MathUtils.smoothstep(trickProgress,.5,.85)):0;
      airTarget.set(a.side*(.32+air.lift*.10+air.descent*.07+air.launch*.04+flick*.03-Math.abs(air.yaw)*.05+spinCheck*.07)
        +air.roll*.07+air.rollEffort*.055,
        .015+airLeading*.015+air.lift*.12+air.descent*.055+air.launch*.11+a.side*air.roll*.065+a.side*air.turn*.035+airLeading*flick*.035
        +Math.abs(air.spinEffort)*.05+spinCheck*.045+Math.abs(air.yaw)*.02+Math.abs(air.pitchEffort)*.045+a.side*air.rollEffort*.045,
        -.09-airLeading*.065-air.lift*.035+air.descent*.025+air.pitch*.09+a.side*air.turn*.09+THREE.MathUtils.lerp(.02,-.025,airLeading)*flick
        -a.side*(air.spinEffort*.12+air.yaw*.03)+air.pitchEffort*.06);
      airTarget.x+=a.side*shoulderOffset;
      if(!a.airReady){a.airHand.copy(airTarget);a.airReady=true;}
      else a.airHand.lerp(airTarget,1-Math.exp(-(5+airLeading*1.5)*opts.dt));
      hand.lerp(a.airHand,airWeight);
      const reach=hand.sub(shoulder);
      const restReach=.432+leading*.015+load*.02+Math.abs(manual)*.015;
      const airReach=Math.min(.478,.445+airLeading*.008+air.descent*.02+Math.abs(air.roll)*.012+air.launch*.008-air.lift*.006
        -Math.abs(air.yaw)*.015+spinCheck*.012);
      reach.setLength(THREE.MathUtils.lerp(THREE.MathUtils.lerp(THREE.MathUtils.lerp(.475,.48,flipTuck),restReach,cruiseWeight),airReach,airWeight)*armScale);
      hand.add(shoulder);
      if (heldGrab && a.side === heldGrab.hand) {
        const grip = a.gripTarget.set(heldGrab.grip.x,heldGrab.grip.y,heldGrab.grip.z);
        if (heldGroundGrab) { grip.sub(gripPivot).applyQuaternion(carveTilt).add(gripPivot);grip.y+=edgeLift; }
        grip.applyQuaternion(grabPose.rotation).add(grabPose.offset);
        // Convert the fixed board grip into the leaning torso's coordinate system.
        grip.divideScalar(bodyScale).sub(hips.position).applyQuaternion(inverseHips.copy(hips.quaternion).invert()).applyQuaternion(inverseTorso.copy(torso.quaternion).invert());
        hand.lerp(grip, grabBlend);
        // Let the shoulder reach a little when a combined flip/board tweak would
        // otherwise pull the grip beyond the arm, keeping both bone lengths intact.
        gripReach.copy(hand).sub(shoulder);
        const distance=gripReach.length();
        if(distance>.4895*armScale)shoulder.addScaledVector(gripReach,Math.min(.045+.49*(1-armScale),(distance-.4895*armScale)*grabBlend)/distance);
      }
      // Reach around the outside of the tucked leg for the rear grab.
      const pole = heldGrab?.direction==='back' && a.side===heldGrab.hand
        ? a.pole.set(a.side*THREE.MathUtils.lerp(0.25,1.5,grabBlend),-0.1,THREE.MathUtils.lerp(1,0.1,grabBlend))
        : a.pole.set(a.side*.25,-.1,1);
      const solved=a.solve(shoulder,hand,pole,.25*armScale,.24*armScale);
      segment(a.upper, shoulder, solved.joint);
      a.shoulder.position.copy(shoulder);a.shoulder.quaternion.copy(a.upper.quaternion);
      segment(a.sleeve, shoulder, a.sleeveEnd.copy(shoulder).lerp(solved.joint, 0.55));
      segment(a.fore, solved.joint, solved.end);
      a.elbow.position.copy(solved.joint); a.hand.position.copy(solved.end);
      a.hand.quaternion.copy(a.fore.quaternion);
      a.hand.rotateY(a.side*(.55*cruiseWeight+.35*airWeight));
    }
    // Keep the feet in board space; leaning the whole skeleton used to lift one sole.
    rider.rotation.set(opts.bail ? 1.1 : 0, RIDER.stanceY, opts.bail ? 0.8 : 0);
    // Keep the gaze in the chest's frame. During an aerial spin the neck stays comfortable,
    // so the face turns with the body instead of counter-rotating toward the course.
    if(riding && opts.headForward && opts.headForward.lengthSq()>1e-6) {
      headDirection.copy(opts.headForward).normalize().applyQuaternion(torso.getWorldQuaternion(headParent).invert());
      const desired=Math.atan2(-headDirection.x,-headDirection.z);
      const stance=opts.travelSide ?? 1;
      // A small continuous glance avoids a target jump when heading crosses +/-180 degrees.
      const glance=stance*0.65+Math.sin(desired-stance*0.65)*0.24;
      headYaw=THREE.MathUtils.damp(headYaw,glance,7,opts.dt);
    }
    headAngles.y=headYaw;
    const neckPitch=THREE.MathUtils.clamp(-torso.rotation.x*0.2+leanPitch*(FLIP_LEAN.head-1),-0.22,0.22);
    const neckRoll=THREE.MathUtils.clamp(-m.lean*0.05+leanRoll*(FLIP_LEAN.head-1),-0.13,0.13);
    headAngles.x=THREE.MathUtils.damp(headAngles.x,neckPitch,10,opts.dt);
    headAngles.z=THREE.MathUtils.damp(headAngles.z,neckRoll,10,opts.dt);
    head.quaternion.setFromEuler(headAngles);
  }
  function resetCruise() {cruisePose.reset();airPose.reset();for(const arm of arms){arm.restReady=false;arm.airReady=false;}}
  return {setPose,
    setRagdoll(active: boolean) {
      rider.visible = !active;
      if (active) {resetCruise();carve = manual = flipPitch = flipRoll = 0; deck.rotation.z = 0; deck.position.set(0,0,0);}
    },
    resetPose() {
      motion.reset();resetCruise();grabBlend = 0; carve = manual = flipPitch = flipRoll = 0; heldGroundGrab = false;
      headYaw=0.65;headAngles.set(0,0.65,0); deck.rotation.z = 0; deck.position.set(0,0,0); equipment.activeShape?.reset(); heldGrab = null; board.position.set(0,0,0); board.quaternion.identity();
    },
  };
}
