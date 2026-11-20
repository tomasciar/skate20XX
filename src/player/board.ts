import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type {PlayerIntent} from './controller.ts';
import type {TrickState} from './tricks/tricks.ts';
import type {BoardPlayer,CrashCause} from './types.ts';
import {BOARD,RIDER} from './dimensions.ts';
import {createSkaterVisual} from './visuals/skaterVisual.ts';
import {createSurfaceSupport} from './visuals/surfaceSupport.ts';
import {createBoardBody} from './movement/boardPhysics.ts';
import {createDeckFrame} from './movement/deckFrame.ts';
import {createWallRide,WALL_RIDE} from './movement/wallRide.ts';
import {createSuspension} from './movement/suspension.ts';
import {createCrashDetection} from './movement/crashDetection.ts';
import {createCrashPhysics} from './movement/crashPhysics.ts';
import {createPumpCycle} from './movement/pump.ts';
import {createGrindSystem} from './movement/grind.ts';
import {createAirRotation,describeAirRotation,AIR_YAW_SPEED,AIR_ROTATION_SPEED} from './movement/airRotation.ts';
import {coastSpeed,dragSpeed,SPEED} from './movement/speed.ts';
import {CARVE,carveDrag,carveLean,carveTurnRate} from './movement/carve.ts';
import {createSlide,SLIDE} from './movement/slide.ts';
import {judgeLanding,LANDING} from './movement/landing.ts';
import {createRideContact,RIDE_CONTACT} from './movement/rideContact.ts';
import {clampSensitivity} from './movement/sensitivity.ts';
import {LANDSCAPE_HALF_WIDTH} from '../world/terrain/landscape.ts';
import {courseSlope} from '../world/terrain/course.ts';
import {RAMP,type RampWorld} from '../world/ramp.ts';
import {applyRideSkin} from '../mode.ts';
import type {RideMode} from '../mode.ts';
import {applyCharacterSkin} from './characters/skin.ts';
import type {CharacterId} from './characters/catalog.ts';
import type {BoardStyleId} from '../boards.ts';

// Jump forgiveness is separate from contact: tiny gaps must not fake landings or wheel grip.
const OLLIE_GRACE=0.1,OLLIE_BUFFER=0.1;

export type {BoardPlayer,CrashCause} from './types.ts';

export function createBoardPlayer(
  scene: THREE.Scene,
  world: RAPIER.World,
  ramp: RampWorld,
  mode:RideMode='skate',character:CharacterId='boy',boardStyle:BoardStyleId='classic'
): BoardPlayer {
  const grind = createGrindSystem();
  const pump = createPumpCycle();
  const air = createAirRotation();
  const slide = createSlide();
  const rideContact=createRideContact();
  const visual = createSkaterVisual(mode,character,boardStyle);
  scene.add(visual.root);

  const spawn = ramp.spawn.clone();
  const {body,collider:boardCollider}=createBoardBody(world,spawn);
  const originShift = new THREE.Vector3();
  const position = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const previousQuat = new THREE.Quaternion();
  const renderPosition = new THREE.Vector3();
  const renderBodyPosition = new THREE.Vector3();
  const airOffset = new THREE.Vector3(), previousAirOffset = new THREE.Vector3(), renderAirOffset = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const forward = ramp.forward.clone();
  const courseForward=ramp.forward.clone();
  const quat = new THREE.Quaternion();
  const boardUp = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let resetCount = 0;
  let ollieCount = 0;
  let grounded = false;
  let introLanding = false;
  let boostEntered = false;
  let speed = 0;
  let uprightDot = 1;
  let lean = 0;
  let yaw = 0;
  let yawVelocity=0;
  const spinAxis=new THREE.Vector3(),spinFrame=new THREE.Quaternion(),spinUp=new THREE.Vector3(0,1,0);
  let wheelRoll = 0;
  let ollieCooldown = 0;
  let leaveGround = 0;
  let ollieGrace = 0;
  let pendingOllie = 0;
  let pendingOlliePower = 0;
  let nearGround = false;
  const ollieNormal = ramp.surfaceNormal.clone();
  let crashElapsed = 0;
  let crashCause: CrashCause | null = null;
  const recoveryPosition=new THREE.Vector3(),recoverySpawn=new THREE.Vector3();
  let landingBoost = 0;
  const landingHeading = new THREE.Vector3();
  const impactVelocity = new THREE.Vector3();
  let followSurface = false;
  let wasOnKicker = false,rebaseContactGrace=0;
  const surfaceUp = ramp.surfaceNormal.clone(),surfaceTurn=new THREE.Quaternion(),identityTurn=new THREE.Quaternion();
  function followNormal(n:THREE.Vector3,dt:number) {
    const angle=surfaceUp.angleTo(n);if(angle<1e-6){surfaceUp.copy(n);return;}
    surfaceTurn.setFromUnitVectors(surfaceUp,n).slerp(identityTurn,1-Math.min(1,WALL_RIDE.normalRate*dt/angle));
    surfaceUp.applyQuaternion(surfaceTurn).normalize();
  }
  const renderQuat = new THREE.Quaternion();
  let poseDt = 0;
  let posePush = 0;
  let aeroTuck = 0;
  const grindPoint=new THREE.Vector3(),paintUp=new THREE.Vector3();
  // Per-player workspaces: physics and presentation never retain these temporary values.
  const courseRight=new THREE.Vector3(),courseUp=new THREE.Vector3(),courseProgress=new THREE.Vector3();
  const groundTravel=new THREE.Vector3(),groundVelocity=new THREE.Vector3(),rollingDirection=new THREE.Vector3();
  const streamedProgress=new THREE.Vector3();

  const crash=createCrashPhysics({scene,world,normal:ramp.surfaceNormal,body,collider:boardCollider,visual});
  const suspension=createSuspension(world,body,ramp.surfaceNormal,{position,rotation:quat,up:boardUp,forward});
  const deckFrame=createDeckFrame(body,ramp.forward,ramp.surfaceNormal,air.rotation,{position,rotation:quat,up:boardUp,forward,airOffset});
  const wall=createWallRide(world,body,ramp.surfaceNormal,{position,forward,up:boardUp});
  const support=createSurfaceSupport(world,body,ramp.surfaceNormal);
  const crashDetection=createCrashDetection(world,body,boardCollider,ramp.surfaceNormal,position,velocity);

  function facingQuat(): THREE.Quaternion {
    const n = ramp.surfaceNormal;
    const f = ramp.forward.clone().applyAxisAngle(n, yaw).normalize();
    const r = tmp.copy(f).cross(n).normalize();
    const basis = new THREE.Matrix4().makeBasis(r, n, f.clone().negate());
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  }

  function holdDeck(up:THREE.Vector3=ramp.surfaceNormal) {
    deckFrame.apply(yaw,up,air.state.engaged && !grounded && !grind.state.active,wall.state.active?wall.state.heading:undefined);
  }

  function readPose() {
    const t = body.translation();
    const r = body.rotation();
    const v = body.linvel();
    position.set(t.x, t.y, t.z);
    quat.set(r.x, r.y, r.z, r.w);
    velocity.set(v.x, v.y, v.z);
    speed = velocity.length();
    boardUp.set(0, 1, 0).applyQuaternion(quat);
    forward.set(0, 0, -1).applyQuaternion(quat);
    uprightDot = boardUp.dot(ramp.surfaceNormal);
  }

  function reset(to: THREE.Vector3,restartCourse=true) {
    crash.clear();
    if (liveTricks) {
      liveTricks.ground = null; liveTricks.groundTime = liveTricks.groundMeters = 0;
      liveTricks.active = null; liveTricks.grab = null; liveTricks.grabTime = liveTricks.t = 0;
      liveTricks.boardSpin = {x:0,y:0,z:0}; liveTricks.bail = false;
      liveTricks.message = liveTricks.lastLanded = null; liveTricks.messageAge = 0;
    }
    resetCount++;
    ollieCount=0;
    pump.reset();
    rideContact.reset();surfaceUp.copy(ramp.surfaceNormal);
    slide.reset();
    air.reset();airOffset.set(0,0,0);previousAirOffset.set(0,0,0);
    grind.reset();deckFrame.reset();wall.reset();
    visual.resetPose();
    support.reset();
    poseDt = posePush = 0;
    aeroTuck=0;
    if(restartCourse)ramp.reset();
    introLanding = restartCourse && !!ramp.startPlatform && to.distanceToSquared(ramp.spawn)<1e-8;
    boostEntered = false;
    yaw = 0;
    if(!restartCourse && ramp.directionAt) {
      ramp.directionAt(to,courseForward);
      yaw=Math.atan2(-courseForward.x,courseForward.dot(ramp.forward));
    }
    yawVelocity=0;
    const q = facingQuat();
    const p = to.clone().addScaledVector(ramp.surfaceNormal, 0.22);
    body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    crashElapsed = 0;
    ollieCooldown = 0;
    leaveGround = 0;
    ollieGrace = pendingOllie = pendingOlliePower = 0;
    nearGround = false;
    ollieNormal.copy(ramp.surfaceNormal);
    wasOnKicker = false;rebaseContactGrace=0;
    followSurface = false;
    lean = 0;
    wheelRoll = 0;
    grounded = true;
    readPose();
    previousPosition.copy(position); renderPosition.copy(position); previousQuat.copy(quat);
    renderQuat.copy(quat);
    paint(0, { x: 0, y: 0, z: 0 });
  }

  function respawn() {
    const at=crash.active?recoveryPosition:position;
    if(ramp.recoveryAt)ramp.recoveryAt(at,recoverySpawn);
    else {
      // Simple test/custom courses can fall back to their base road plane.
      recoverySpawn.copy(at).addScaledVector(ramp.surfaceNormal,-tmp.copy(at).sub(ramp.anchor).dot(ramp.surfaceNormal));
      recoverySpawn.x-=ramp.roadOffset?.(at) ?? at.x-ramp.anchor.x;
    }
    reset(recoverySpawn,false);
  }

  function paint(crouch: number, boardSpin: { x: number; y: number; z: number }, at = position) {
    // Riding switch, the board points back up the hill: its right edge is on the rider's left as they travel.
    // Lean toward the inside of the turn as travelled, not toward a fixed side of the deck.
    const travelSide = !rideContact.airborne && velocity.dot(forward) < -0.1 ? -1 : 1;
    visual.root.quaternion.copy(renderQuat);
    const up = paintUp.set(0, 1, 0).applyQuaternion(renderQuat);
    // The suspension body stays stable; its visible wheel bottoms sit on the measured surface.
    visual.root.position.copy(at).addScaledVector(up, support.heightOffset);
    // Project the actual yaw onto the rider's axes, including while inverted in a flip.
    spinAxis.copy(ramp.surfaceNormal).multiplyScalar(yawVelocity)
      .applyQuaternion(spinFrame.copy(renderQuat).invert()).applyAxisAngle(spinUp,-RIDER.stanceY);
    visual.setPose({
      headForward: speed>1 ? velocity : ramp.directionAt?.(at,courseForward) ?? ramp.forward,
      flipLean: air.lean,
      rotationRate:{yaw:spinAxis.y/AIR_YAW_SPEED,pitch:air.lean.pitch+spinAxis.x/AIR_ROTATION_SPEED,
        roll:air.lean.roll+spinAxis.z/AIR_ROTATION_SPEED},
      grab: liveTricks?.grab ?? null,
      groundTrick: slide.state.active ? null : liveTricks?.ground ?? null,
      travelSide,
      surfacePitch:!rideContact.airborne?Math.asin(THREE.MathUtils.clamp(forward.y*travelSide,-1,1)):undefined,
      slide: slide.state.amount*slide.state.side,
      trick: liveTricks?.active ?? null,
      trickTime: liveTricks?.t ?? 0,
      pump: pump.state,
      dt: poseDt,
      speed,
      push: posePush,
      verticalSpeed: velocity.dot(surfaceUp),
      grinding: grind.state.active,
      crouch: grind.state.active ? Math.max(crouch, 0.25) : crouch,
      lean: grind.state.active ? grind.state.balance : lean * travelSide,
      carve: !rideContact.airborne && !grind.state.active ? carveLean(speed, lean) * travelSide * (1-slide.state.amount) : 0,
      airborne: rideContact.airborne,
      bail: false,
      wheelRoll,
      boardSpin,
    });
  }

  function startCrash(tricks: TrickState, momentum: THREE.Vector3, cause: CrashCause) {
    crashCause = cause;
    if (crash.active) return;
    recoveryPosition.copy(position);
    // Capture the current articulated pose rather than spawning a different crash model.
    render(1, 0);
    crash.capture(momentum);
    pump.reset(); grind.reset();wall.release(); crashElapsed = 0; grounded = false; followSurface = false;
    slide.reset();
    ollieGrace = pendingOllie = 0; nearGround = false;
    air.reset();airOffset.set(0,0,0);previousAirOffset.set(0,0,0);
    tricks.active = null; tricks.grab = null; tricks.grabTime = 0;
    tricks.ground = null; tricks.groundTime = tricks.groundMeters = 0;
    tricks.boardSpin = {x:0,y:0,z:0}; tricks.bail = true; tricks.message = "Bail!"; tricks.messageAge = 0;
    crash.releaseBoard();
    position.copy(crash.focus); previousPosition.copy(position); renderPosition.copy(position);
  }

  function canOllie() {
    return !crash.active && !grind.state.active && !air.state.engaged && ollieCooldown <= 0 &&
      (grounded || nearGround || ollieGrace > 0);
  }

  function simulate(dt: number, intent: PlayerIntent, tricks: TrickState) {
    if (intent.reset) {
      reset(ramp.spawn);
      return;
    }

    if (crash.active) {
      crashElapsed += dt;
      if (crashElapsed >= 3.2) {
        respawn(); tricks.bail = false; tricks.message = null; tricks.lastLanded = null; return;
      }
      previousPosition.copy(position); previousQuat.copy(quat); crash.beginStep();
      tricks.message = "Bail!"; tricks.messageAge = 0;
      return;
    }
    readPose();
    previousPosition.copy(position); previousQuat.copy(quat);
    previousAirOffset.copy(airOffset);
    deckFrame.step(dt,!air.state.engaged && !intent.toggleAirFlip);
    if(originShift.lengthSq()>0 && !rideContact.airborne && leaveGround<=0 && !wasOnKicker)rebaseContactGrace=.025;
    rebaseContactGrace=Math.max(0,rebaseContactGrace-dt);
    if (tricks.bail) { startCrash(tricks, velocity, 'trick'); return; }
    const queriesReady=originShift.lengthSq()===0,wasOnWall=wall.state.active;
    wall.update(dt,velocity,(leaveGround<=0 || (ollieNormal.dot(ramp.surfaceNormal)>.4 && ollieCooldown<.22)) && !air.state.engaged && !grind.state.active && !intent.wantOllie,queriesReady);
    if(wall.entering){deckFrame.land();surfaceUp.copy(boardUp);wasOnKicker=false;leaveGround=0;}
    if(wall.state.active){followNormal(wall.state.normal,dt);followSurface=true;holdDeck(surfaceUp);}
    else if(wall.state.floorExit){deckFrame.land();followNormal(wall.state.floorNormal,dt);followSurface=true;holdDeck(surfaceUp);}
    else if(wasOnWall){deckFrame.preserveLaunchAngle();}
    if (crashDetection.obstacleAhead(dt,speed,wall.allows)) { startCrash(tricks, velocity, 'obstacle'); return; }
    ramp.directionAt?.(position,courseForward);
    const courseYaw=Math.atan2(-courseForward.x,courseForward.dot(ramp.forward));
    const carveSensitivity=clampSensitivity(intent.carveSensitivity??1);
    const flipSensitivity=clampSensitivity(intent.flipSensitivity??1);
    const turnSensitivity=clampSensitivity(intent.turnSensitivity??1);
    const wantSlide=intent.wantSlide ?? intent.push<0;
    const boostSpeed=ramp.boostAt?.(position) ?? 0;
    if(!boostSpeed)boostEntered=false;
    air.update(dt,intent.toggleAirFlip ?? false,intent.push,intent.steer,rideContact.airborne && !wall.state.active && !grind.state.active,yaw-courseYaw,flipSensitivity);
    aeroTuck=THREE.MathUtils.damp(aeroTuck,THREE.MathUtils.clamp(intent.crouchHold,0,1),12,dt);
    pump.update(dt, intent.push > 0, speed, !rideContact.airborne && !wantSlide && !grind.state.active && !slide.state.active && !tricks.ground && !intent.crouch && !intent.wantOllie && !tricks.bail);
    ollieCooldown = Math.max(0, ollieCooldown - dt);
    leaveGround = Math.max(0, leaveGround - dt);
    ollieGrace = Math.max(0, ollieGrace - dt);
    pendingOllie = Math.max(0, pendingOllie - dt);
    if (intent.wantOllie) {
      pendingOllie = OLLIE_BUFFER;
      pendingOlliePower = intent.olliePower;
    }
    const steering=air.state.active ? 0 : intent.steer;
    const slideYaw=slide.update(dt,wantSlide,steering,yaw,
      Math.atan2(-velocity.x,velocity.dot(ramp.forward)),speed,
      (!rideContact.airborne || canOllie()) && !grind.state.active && !air.state.engaged,turnSensitivity);
    lean = THREE.MathUtils.damp(lean, slide.state.active ? 0 : steering, !rideContact.airborne ? CARVE.response : 8, dt);

    // On the road the trucks turn as weight shifts onto an edge; in the air the rider spins freely.
    const previousYaw=yaw;
    if (slide.state.active) yaw=slideYaw;
    else yaw = slideYaw - ((!rideContact.airborne || wall.state.active) ? lean * carveTurnRate(speed)*carveSensitivity : steering * AIR_YAW_SPEED*turnSensitivity)*dt;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    wall.steer(Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw)));
    yawVelocity=rideContact.airborne&&!grind.state.active&&dt>0?Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw))/dt:0;

    const wasGrinding = grind.state.active;
    grindPoint.copy(position).addScaledVector(boardUp, support.heightOffset);
    if (grind.update(dt, grindPoint, velocity, forward, ramp.surfaceNormal, ramp.grindRails,
      steering, intent.wantOllie, wantSlide, !tricks.active && leaveGround <= 0 && boardUp.dot(ramp.surfaceNormal)>0.8,aeroTuck)) {
      if(!grind.state.active && grind.state.message==='Ollie out')ollieCount++;
      slide.reset();
      air.reset();airOffset.set(0,0,0);
      // The board keeps whatever heading it has on the rail, sideways included, into the air.
      yaw = Math.atan2(-grind.heading.x,grind.heading.dot(ramp.forward));
      deckFrame.setGrindPitch(grind.state.active?grind.pitch:0,!wasGrinding || !grind.state.active);
      grounded = false; followSurface = grind.state.active; wasOnKicker = false;
      rideContact.takeoff();
      ollieGrace = pendingOllie = 0; nearGround = false;
      surfaceUp.copy(grind.normal);
      if (!grind.state.active) leaveGround = 0.25;
      holdDeck(followSurface ? surfaceUp : ramp.surfaceNormal);
      position.copy(grindPoint).addScaledVector(boardUp, -support.heightOffset);
      body.setTranslation(position, true); body.setLinvel(velocity, true);
      return;
    }

    if(air.state.engaged)holdDeck();
    if((air.state.engaged || (rideContact.airborne && boardUp.dot(ramp.surfaceNormal)<.65)) && !wall.state.active && !wall.state.floorExit && crashDetection.invertedLanding(quat,boardUp)) { startCrash(tricks,velocity,'inverted');return; }

    const {wheelsDown,wallWheels,nearbyWheels,rollingWheels,normal:contactN,nearbyNormal,rollingNormal}=suspension.sample(dt,queriesReady?leaveGround:Math.max(leaveGround,dt),slide.state.amount,wall.state.active?wall.state.normal:undefined);
    if(queriesReady)wall.pull(dt,wallWheels);
    const supported=leaveGround<=0 && wheelsDown>=2;
    const nearRoad=leaveGround<=0 && ((rollingWheels>=2 && boardUp.dot(rollingNormal)>.8 &&
      Math.abs(velocity.dot(rollingNormal))<RIDE_CONTACT.normalSpeed) || (wall.state.active && wall.state.age<.2) || wall.state.floorExit || rebaseContactGrace>0);
    let clearDeparture=false;
    if(!supported && rollingWheels<2 && !rideContact.airborne && rebaseContactGrace<=0) {
      clearDeparture=suspension.isDeparting(surfaceUp);
    }
    const wasAirborne=rideContact.airborne;
    const landed=rideContact.update(dt,supported,nearRoad,-velocity.dot(contactN),clearDeparture);
    const startingFlight=!wasAirborne && rideContact.airborne;
    const landingFromStart=introLanding && tmp.copy(position).sub(ramp.spawn).dot(ramp.surfaceNormal)<-2;
    if (!grounded && leaveGround <= 0 && wheelsDown >= 2) {
      // Touchdown: a board pointing along its travel can take a harder hit, more so the faster it rolls.
      const impact=-velocity.dot(contactN);
      const rolling=tmp.copy(velocity).addScaledVector(contactN,impact).length();
      landingHeading.copy(forward).addScaledVector(contactN,-forward.dot(contactN));
      let misalignment=rolling>1 && landingHeading.lengthSq()>1e-6
        ? Math.acos(Math.min(1,Math.abs(tmp.dot(landingHeading))/(rolling*landingHeading.length()))) : 0;
      if(air.state.engaged)misalignment=Math.max(misalignment,Math.acos(THREE.MathUtils.clamp(boardUp.dot(contactN),-1,1)));
      const landing=judgeLanding(impact,rolling,misalignment);
      if (impact > (landingFromStart ? ramp.startPlatform!.landingSpeed : landing.limit)) {
        startCrash(tricks, velocity, 'hardLanding'); return;
      }
      landingBoost=landed?landing.boost:0;
      tricks.landing=landed?landing.grade:null;
      if(landed && landing.grade && impact>=LANDING.callout) { tricks.message=`${landing.grade} Landing`;tricks.messageAge=0; }
    }
    grounded = leaveGround <= 0 && wheelsDown >= 2;
    if (grounded && landingFromStart) introLanding=false;
    nearbyNormal.normalize();
    nearGround = leaveGround <= 0 && nearbyWheels >= 2 && boardUp.dot(nearbyNormal) > 0.8 &&
      Math.abs(velocity.dot(nearbyNormal)) < 2.5;
    if (grounded) {
      ollieGrace = OLLIE_GRACE;
      ollieNormal.copy(contactN);
    } else if (nearGround) ollieNormal.copy(nearbyNormal);

    // Wheel grip and pushing still require real suspension contact.
    if (grounded) {
      if(wasAirborne && !air.state.engaged) {
        // Keep the recovered launch heading when its aerial offset is cleared.
        const yawStep=Math.atan2(Math.sin(yaw-previousYaw),Math.cos(yaw-previousYaw));
        courseRight.crossVectors(ramp.forward,ramp.surfaceNormal);
        yaw=Math.atan2(-forward.dot(courseRight),forward.dot(ramp.forward))+yawStep;
      }
      // The launch offset belongs to the airborne frame. Do not apply it again on the landing plane.
      deckFrame.land();
      if(air.state.engaged) {
        courseRight.crossVectors(ramp.forward,ramp.surfaceNormal);
        yaw=Math.atan2(-forward.dot(courseRight),forward.dot(ramp.forward));
        const landedFlip=describeAirRotation(air.state);
        if(landedFlip) { tricks.lastLanded=landedFlip;tricks.message=tricks.landing ? `${landedFlip} · ${tricks.landing}` : landedFlip;tricks.messageAge=0; }
        air.reset();airOffset.set(0,0,0);
      }
      if(!wall.state.active)followNormal(contactN.lengthSq()>.5?contactN:ramp.surfaceNormal,dt);
      const n=surfaceUp;
      const coursePitch = Math.atan(courseSlope(ramp.distance + courseProgress.copy(position).sub(ramp.anchor).dot(ramp.forward)));
      courseUp.copy(ramp.surfaceNormal).multiplyScalar(Math.cos(coursePitch)).addScaledVector(ramp.forward,-Math.sin(coursePitch));
      const onKicker = n.dot(courseUp) < 0.97;
      if (wasOnKicker && !onKicker && !wall.state.active && velocity.dot(contactN)>1.5) {
        // Keep the speed you had going up the face, so the lip throws you.
        wasOnKicker = false;
        leaveGround = 0.35;
        landingBoost = 0;
        grounded = false;
        rideContact.takeoff();
        followSurface = false;
        deckFrame.preserveLaunchAngle();
        holdDeck();
      } else {
        wasOnKicker = onKicker;
        const travel = wall.state.active?groundTravel.copy(wall.state.heading):groundTravel.copy(ramp.forward).applyAxisAngle(ramp.surfaceNormal,yaw);
        travel.addScaledVector(n, -travel.dot(n));
        if (travel.lengthSq() < 1e-6) travel.copy(ramp.forward);
        travel.normalize();

        // Keep the suspension impulses applied above, including their normal lift.
        const current = body.linvel();
        const vel = groundVelocity.set(current.x, current.y, current.z);
        const normalSpeed = vel.dot(n);
        vel.addScaledVector(n, -normalSpeed);
        // A 180 changes stance, not momentum: land switch and keep rolling downhill.
        rollingDirection.copy(travel).multiplyScalar(vel.dot(travel) < -0.1 ? -1 : 1);

        if (slide.state.active || wantSlide) {
          // A sideways slide scrubs speed along the existing motion instead of steering it across the road.
          const resistance=slide.state.active ? SLIDE.deceleration*(0.2+0.8*slide.state.amount) : SLIDE.deceleration;
          vel.multiplyScalar(Math.max(0, 1 - resistance * dt / Math.max(vel.length(), 0.001)));
        } else {
          // A real push adds momentum at low speed. Gravity supplies the downhill acceleration.
          if(pump.state.active)vel.addScaledVector(rollingDirection,SPEED.pushAcceleration*pump.state.weight*dt);
          // A well-aimed landing pumps a little of the touchdown back into the roll.
          vel.addScaledVector(rollingDirection,landingBoost);
          // Hard carves scrub speed, so wide S-turns check a fast descent.
          const rolling = vel.length();
          vel.multiplyScalar(Math.max(0, 1 - carveDrag(rolling, lean) * dt / Math.max(rolling, 0.001)));
        }
        const rollingSpeed=vel.length();
        if(rollingSpeed>0)vel.multiplyScalar(coastSpeed(rollingSpeed,dt,aeroTuck,n.y)/rollingSpeed);

        // Carve along the board, but keep the speed you carried onto a ramp.
        let spd = vel.length();
        if (spd > 0.5 && intent.push >= 0 && !slide.state.active) {
          // Wheels only roll along the board: whatever travels across them slides and bleeds speed.
          const alignment = vel.dot(rollingDirection) / spd;
          spd = Math.max(0, spd - CARVE.slide * (1 - alignment * alignment) * dt);
        }
        const carved = rollingDirection.multiplyScalar(spd);
        if (!slide.state.active) vel.lerp(carved, 1 - Math.exp(-dt / CARVE.grip));

        if(boostSpeed && !boostEntered) {
          boostEntered=true;
          if(!wantSlide && !slide.state.active && vel.length()<boostSpeed) {
            if(vel.length()>0.1)vel.setLength(boostSpeed);
            else vel.copy(courseForward).addScaledVector(n,-courseForward.dot(n)).normalize().multiplyScalar(boostSpeed);
            tricks.message='Boost!';tricks.messageAge=0;
          }
        }
        landingBoost = 0;
        vel.addScaledVector(n, normalSpeed);
        body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
        velocity.copy(vel);

        followSurface = true;
        // surfaceUp is rate-limited above; wheel forces still use actual contacts.
        holdDeck(n);
      }
    } else {
      if (wasOnKicker) {
        wasOnKicker = false;
        leaveGround = Math.max(leaveGround, 0.35);
        rideContact.takeoff();
        deckFrame.preserveLaunchAngle();
      }
      else if(startingFlight)deckFrame.preserveLaunchAngle();
      // A seam or shallow skim keeps the last support plane instead of snapping to the base hill.
      followSurface = wall.state.active || wall.state.floorExit || !rideContact.airborne;
      if(followSurface && nearRoad && rollingNormal.lengthSq()>.5 && !wall.state.active && !wall.state.floorExit)followNormal(rollingNormal,dt);
      // Air resistance acts on the ballistic motion too; the world still applies gravity once.
      const airSpeed=velocity.length();
      if(airSpeed>0) {
        velocity.multiplyScalar(dragSpeed(airSpeed,dt,aeroTuck)/airSpeed);
        body.setLinvel(velocity,true);
      }
      holdDeck(followSurface?surfaceUp:ramp.surfaceNormal);
    }

    if (slide.state.active) {
      tricks.message='Boardslide';tricks.messageAge=0;
    }
    if (pendingOllie > 0 && canOllie()) {
      ollieCount++;
      const hop = 4.4 + pendingOlliePower * 2.2 + Math.min(speed, 40) * 0.13;
      const lin = body.linvel();
      velocity.set(lin.x,lin.y,lin.z).addScaledVector(ollieNormal,hop);
      body.setLinvel(velocity,true);
      leaveGround = 0.28 + Math.min(speed, 40) * 0.006;
      ollieCooldown = 0.3;
      ollieGrace = pendingOllie = 0;
      nearGround = grounded = followSurface = false;
      rideContact.takeoff();
      slide.reset();
      deckFrame.preserveLaunchAngle();
      holdDeck();
    }

    const along = velocity.dot(forward);
    wheelRoll += (along / BOARD.wheelRadius) * dt;

    if (Math.abs(ramp.roadOffset?.(position) ?? position.x) > LANDSCAPE_HALF_WIDTH - 10 || tmp.copy(position).sub(ramp.anchor).dot(ramp.surfaceNormal) < -50) {
      startCrash(tricks, velocity, 'outOfBounds');
    }
  }

  function sync(paintFrame = true) {
    ramp.syncProps?.();
    originShift.set(0, 0, 0);
    if (!crash.active) holdDeck(followSurface ? surfaceUp : ramp.surfaceNormal);
    readPose();
    if (!crash.active && liveTricks && crashDetection.impactFromContacts(impactVelocity,speed,wall.allows)) startCrash(liveTricks, impactVelocity, 'impact');
    if (crash.active) { crash.sync(); position.copy(crash.focus); velocity.copy(crash.velocity); speed = velocity.length(); }
    // When you've ridden a full chunk downhill, snap origin and stream the next seeded stretch.
    // Keep the crash site streamed in while the ragdoll tumbles further downhill.
    const along = streamedProgress.copy(crash.active?recoveryPosition:position).sub(ramp.anchor).dot(ramp.forward);
    if (along > RAMP.chunkLength) {
      const steps = Math.floor(along / RAMP.chunkLength);
      const shift = steps * RAMP.chunkLength;
      const keep = {
        x: velocity.x,
        y: velocity.y,
        z: velocity.z,
      };
      originShift.copy(ramp.scroll(shift));
      recoveryPosition.add(originShift);
      position.add(originShift);
      previousPosition.add(originShift);
      if (crash.active) {
        crash.shift(originShift);
      } else {
        body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
        body.setLinvel(keep, true);
      }
    }
    if (paintFrame) render(1, poseDt);
  }

  function render(alpha: number, dt: number) {
    ramp.renderProps?.(THREE.MathUtils.clamp(alpha,0,1));
    poseDt = dt;
    renderBodyPosition.lerpVectors(previousPosition, position, THREE.MathUtils.clamp(alpha, 0, 1));
    renderAirOffset.lerpVectors(previousAirOffset,airOffset,THREE.MathUtils.clamp(alpha,0,1));
    renderPosition.copy(renderBodyPosition).sub(renderAirOffset);
    renderQuat.slerpQuaternions(previousQuat, quat, THREE.MathUtils.clamp(alpha, 0, 1));
    if (crash.active) {
      crash.render(alpha);
      return;
    }
    // A grind keeps its catch offset; brief suspension gaps retain the last fitted surface.
    if(!grind.state.active && !rideContact.airborne && leaveGround<=0)support.fit(renderBodyPosition,renderQuat,boardUp);
    const spin =
      liveTricks && (liveTricks.active || liveTricks.boardSpin.y !== 0 || liveTricks.boardSpin.z !== 0)
        ? liveTricks.boardSpin
        : { x: 0, y: 0, z: 0 };
    paint(crouchHolder, spin, renderBodyPosition);
  }

  // pose inputs captured each update for the post-step sync
  let crouchHolder = 0;
  let liveTricks: TrickState | null = null;

  function update(dt: number, intent: PlayerIntent, tricks: TrickState) {
    poseDt = dt;
    posePush = intent.push;
    crouchHolder = intent.crouchHold;
    liveTricks = tricks;
    simulate(dt, intent, tricks);
    const v = body.linvel(); impactVelocity.set(v.x,v.y,v.z);
  }

  reset(spawn);

  return {
    respawn,
    get crashed() { return crash.active; },
    get crashCause() { return crashCause; },
    get resetCount() { return resetCount; },
    get ollieCount() { return ollieCount; },
    get canOllie() { return canOllie(); },
    pump: pump.state,
    aerial: air.state,
    slide: slide.state,
    grind: grind.state,
    get wallRiding(){return wall.state.active;},
    originShift,
    mesh: visual.root,
    body,
    get grounded() {
      return grounded;
    },
    get airborne(){return rideContact.airborne;},
    get landingCount(){return rideContact.landings;},
    get landingImpact(){return rideContact.impact;},
    get surfaceVerticalSpeed(){return velocity.dot(surfaceUp);},
    get speed() {
      return speed;
    },
    forward,
    get uprightDot() {
      return uprightDot;
    },
    position,
    renderPosition,
    velocity,
    update,
    sync,
    render,
    reset,
    setMode(next:RideMode) {visual.setMode(next);applyRideSkin(scene,next);render(1,0);},
    get boardStyle(){return visual.boardStyle;},
    setBoardStyle(next:BoardStyleId){visual.setBoardStyle(next);render(1,0);},
    get character(){return visual.character;},
    setCharacter(next:CharacterId) {visual.setCharacter(next);applyCharacterSkin(scene,next);render(1,0);},
  };
}
