import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerIntent } from "./controller.ts";
import type { TrickState } from "./tricks.ts";
import { BOARD, WHEEL_BOTTOM } from "./dimensions.ts";
import { createSkaterVisual } from "./skaterVisual.ts";
import { createRagdoll } from "./ragdoll.ts";
import { createPumpCycle } from "./pump.ts";
import { createGrindSystem } from "./grind.ts";
import { createAirRotation, describeAirRotation } from "./airRotation.ts";
import { approachTopSpeed, MAX_SPEED } from "./speed.ts";
import { CARVE, carveDrag, carveLean, carveTurnRate } from "./carve.ts";
import { LANDSCAPE_HALF_WIDTH } from "../world/landscape.ts";
import { courseSlope } from "../world/course.ts";
import { RAMP, type RampWorld } from "../world/ramp.ts";

/** Person-sized inertia so flips take a real moment, not a frisbee twitch. */
const INERTIA = { x: 14, y: 9, z: 6 };
const MASS = 72;

const REST = 0.16;
const TRAVEL = 0.12;
const WHEEL_R = BOARD.wheelRadius;
const RAY_LEN = REST + TRAVEL + WHEEL_R;
const STIFF = 28000;
const DAMP = 2400;

/** Local mounts: x right, y up, z toward tail. Nose is -Z. */
const MOUNTS = [
  { x: -BOARD.wheelX, y: -0.02, z: -BOARD.truckZ },
  { x: BOARD.wheelX, y: -0.02, z: -BOARD.truckZ },
  { x: -BOARD.wheelX, y: -0.02, z: BOARD.truckZ },
  { x: BOARD.wheelX, y: -0.02, z: BOARD.truckZ },
];

export type BoardPlayer = {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  grounded: boolean;
  readonly crashed: boolean;
  readonly resetCount: number;
  readonly pump: ReturnType<typeof createPumpCycle>["state"];
  readonly aerial: ReturnType<typeof createAirRotation>["state"];
  grind: ReturnType<typeof createGrindSystem>["state"];
  speed: number;
  forward: THREE.Vector3;
  uprightDot: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  update: (dt: number, intent: PlayerIntent, tricks: TrickState) => void;
  sync: (paint?: boolean) => void;
  render: (alpha: number, dt: number) => void;
  renderPosition: THREE.Vector3;
  originShift: THREE.Vector3;
  reset: (spawn: THREE.Vector3) => void;
};

export function createBoardPlayer(
  scene: THREE.Scene,
  world: RAPIER.World,
  ramp: RampWorld
): BoardPlayer {
  const grind = createGrindSystem();
  const pump = createPumpCycle();
  const air = createAirRotation();
  const visual = createSkaterVisual();
  const ragdoll = createRagdoll(scene, world);
  scene.add(visual.root);

  const spawn = ramp.spawn.clone();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0.35)
  );
  const boardCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.11, 0.04, 0.38)
      .setFriction(0.05)
      .setRestitution(0.02)
      .setMassProperties(MASS, { x: 0, y: 0, z: 0 }, INERTIA, { x: 0, y: 0, z: 0, w: 1 }),
    body
  );

  const originShift = new THREE.Vector3();
  const position = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const previousQuat = new THREE.Quaternion();
  const renderPosition = new THREE.Vector3();
  const renderBodyPosition = new THREE.Vector3();
  const airOffset = new THREE.Vector3(), previousAirOffset = new THREE.Vector3(), renderAirOffset = new THREE.Vector3();
  const pivot = new THREE.Vector3(0,0.5,0), nextAirOffset = new THREE.Vector3(), rotatedPivot = new THREE.Vector3();
  // Deck orientation before the whole-body flip is applied; the head tumbles with the body relative to it.
  const baseQuat = new THREE.Quaternion(), previousBaseQuat = new THREE.Quaternion();
  const renderBaseQuat = new THREE.Quaternion(), headFrame = new THREE.Quaternion();
  const landingProbe = new THREE.Vector3(), landingDown = ramp.surfaceNormal.clone().negate();
  const velocity = new THREE.Vector3();
  const forward = ramp.forward.clone();
  const quat = new THREE.Quaternion();
  const boardUp = new THREE.Vector3();
  const boardRight = new THREE.Vector3();
  const mount = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let resetCount = 0;
  let grounded = false;
  let speed = 0;
  let uprightDot = 1;
  let lean = 0;
  let yaw = 0;
  let wheelRoll = 0;
  let ollieCooldown = 0;
  let leaveGround = 0;
  let crashElapsed = 0;
  const impactVelocity = new THREE.Vector3();
  const loosePrevious = new THREE.Vector3();
  const loosePreviousQ = new THREE.Quaternion();
  let wheelsDown = 0;
  let followSurface = false;
  let wasOnKicker = false;
  const surfaceUp = new THREE.Vector3();
  const renderQuat = new THREE.Quaternion();
  let visualHeightOffset = -0.11;
  let poseDt = 0;
  let posePush = 0;
  const supportPoints = MOUNTS.map(()=>new THREE.Vector3());
  const supportUp = new THREE.Vector3(), supportDown = new THREE.Vector3();
  const supportCandidate = new THREE.Vector3(), supportOrigin = new THREE.Vector3();
  const supportAcross = new THREE.Vector3(), supportAlong = new THREE.Vector3(), supportPlane = new THREE.Vector3();
  const supportForward = new THREE.Vector3(), supportRight = new THREE.Vector3(), supportDelta = new THREE.Vector3();
  const supportBasis = new THREE.Matrix4(), supportRotation = new THREE.Quaternion();

  function sampleVisualSupport(at: THREE.Vector3) {
    if (grind.state.active) { visualHeightOffset = 0; return; }
    if (!grounded || leaveGround > 0) return;
    // Re-sample after fitting the board plane: pitching around a ramp seam shifts wheel positions.
    for (let pass = 0; pass < 3; pass++) {
      let contactCount = 0;
      const currentUp = supportUp.set(0,1,0).applyQuaternion(renderQuat);
      const down = supportDown.copy(currentUp).negate();
      const candidate = supportCandidate.copy(at).addScaledVector(currentUp, visualHeightOffset);
      for (const m of MOUNTS) {
        const origin = supportOrigin.set(m.x,0.1,m.z).applyQuaternion(renderQuat).add(candidate);
        const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, down), 0.5, true, undefined, undefined, undefined, body);
        if (!hit || supportDelta.set(hit.normal.x,hit.normal.y,hit.normal.z).dot(ramp.surfaceNormal)<0.4) continue;
        supportPoints[contactCount++]!.copy(origin).addScaledVector(down,hit.timeOfImpact);
      }
      if (contactCount < 2) return;
      let up = currentUp;
      if (contactCount === 4) {
        const across = supportAcross.copy(supportPoints[1]!).sub(supportPoints[0]!).add(supportPoints[3]!).sub(supportPoints[2]!);
        const along = supportAlong.copy(supportPoints[2]!).add(supportPoints[3]!).sub(supportPoints[0]!).sub(supportPoints[1]!);
        const planeUp = supportPlane.crossVectors(along, across).normalize();
        if (planeUp.dot(boardUp) > 0.8) up = planeUp;
      }
      const f = supportForward.set(0,0,-1).applyQuaternion(renderQuat);
      f.addScaledVector(up, -f.dot(up)).normalize();
      const right = supportRight.crossVectors(f, up).normalize();
      supportRotation.setFromRotationMatrix(supportBasis.makeBasis(right,up,f.negate()));
      const rotationChange = renderQuat.angleTo(supportRotation);
      renderQuat.copy(supportRotation);
      // Use the highest support plane so no supported wheel penetrates the surface.
      let correction = -Infinity;
      for(let i=0;i<contactCount;i++) correction=Math.max(correction,-WHEEL_BOTTOM-supportDelta.copy(at).sub(supportPoints[i]!).dot(up));
      const fitted = THREE.MathUtils.clamp(correction,-0.25,0.1);
      const heightChange = Math.abs(fitted-visualHeightOffset);
      visualHeightOffset = fitted;
      // A settled plane needs one pass. Refit only when a seam changes the contact plane.
      if(rotationChange<1e-5 && heightChange<0.0001) break;
    }
  }

  function facingQuat(): THREE.Quaternion {
    const n = ramp.surfaceNormal;
    const f = ramp.forward.clone().applyAxisAngle(n, yaw).normalize();
    const r = tmp.copy(f).cross(n).normalize();
    const basis = new THREE.Matrix4().makeBasis(r, n, f.clone().negate());
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  }

  /** Keep the deck planted on whatever surface the wheels are on. */
  function holdDeck(up: THREE.Vector3 = ramp.surfaceNormal) {
    const n = up;
    const f = ramp.forward.clone().applyAxisAngle(ramp.surfaceNormal, yaw);
    f.addScaledVector(n, -f.dot(n));
    if (f.lengthSq() < 1e-6) f.copy(ramp.forward);
    f.normalize();
    const r = new THREE.Vector3().crossVectors(f, n).normalize();
    const basis = new THREE.Matrix4().makeBasis(r, n, f.clone().negate());
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    baseQuat.copy(q);
    if(air.state.engaged && !grounded && !grind.state.active) {
      nextAirOffset.copy(pivot).applyQuaternion(q);
      q.multiply(air.rotation);
      nextAirOffset.sub(rotatedPivot.copy(pivot).applyQuaternion(q));
      // Rotate around the rider's center while the center follows the ballistic trajectory.
      const t=body.translation();
      body.setTranslation({x:t.x+nextAirOffset.x-airOffset.x,y:t.y+nextAirOffset.y-airOffset.y,z:t.z+nextAirOffset.z-airOffset.z},true);
      position.add(nextAirOffset).sub(airOffset);airOffset.copy(nextAirOffset);
    }
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    quat.copy(q);
    boardUp.set(0,1,0).applyQuaternion(q);
    forward.set(0,0,-1).applyQuaternion(q);
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
    boardRight.set(1, 0, 0).applyQuaternion(quat);
    forward.set(0, 0, -1).applyQuaternion(quat);
    uprightDot = boardUp.dot(ramp.surfaceNormal);
  }

  function reset(to: THREE.Vector3) {
    ragdoll.clear(); visual.setRagdoll(false);
    boardCollider.setMassProperties(MASS, {x:0,y:0,z:0}, INERTIA, {x:0,y:0,z:0,w:1});
    boardCollider.setFriction(0.05); boardCollider.setCollisionGroups(0xffffffff);
    if (liveTricks) {
      liveTricks.active = null; liveTricks.grab = null; liveTricks.grabTime = liveTricks.t = 0;
      liveTricks.boardSpin = {x:0,y:0,z:0}; liveTricks.bail = false;
      liveTricks.message = liveTricks.lastLanded = null; liveTricks.messageAge = 0;
    }
    resetCount++;
    pump.reset();
    air.reset();airOffset.set(0,0,0);previousAirOffset.set(0,0,0);
    grind.reset();
    visual.resetPose();
    visualHeightOffset = -0.11;
    poseDt = posePush = 0;
    ramp.reset();
    yaw = 0;
    const q = facingQuat();
    const p = to.clone().addScaledVector(ramp.surfaceNormal, 0.22);
    body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    crashElapsed = 0;
    ollieCooldown = 0;
    leaveGround = 0;
    wasOnKicker = false;
    followSurface = false;
    lean = 0;
    yaw = 0;
    wheelRoll = 0;
    grounded = true;
    readPose();
    previousPosition.copy(position); renderPosition.copy(position); previousQuat.copy(quat);
    renderQuat.copy(quat); baseQuat.copy(quat); previousBaseQuat.copy(quat);
    paint(0, { x: 0, y: 0, z: 0 });
  }

  function paint(crouch: number, boardSpin: { x: number; y: number; z: number }, at = position) {
    // Riding switch, the board points back up the hill: its right edge is on the rider's left as they travel.
    // Lean toward the inside of the turn as travelled, not toward a fixed side of the deck.
    const travelSide = grounded && velocity.dot(forward) < -0.1 ? -1 : 1;
    visual.root.quaternion.copy(renderQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(renderQuat);
    // The suspension body stays stable; its visible wheel bottoms sit on the measured surface.
    const offset = grind.state.active ? 0 : visualHeightOffset;
    visual.root.position.copy(at).addScaledVector(up, offset);
    visual.setPose({
      headForward: ramp.forward,
      headFrame: air.state.engaged && !grounded ? headFrame.copy(renderQuat).multiply(renderBaseQuat.invert()) : undefined,
      grab: liveTricks?.grab ?? null,
      pump: pump.state,
      dt: poseDt,
      speed,
      push: posePush,
      verticalSpeed: velocity.dot(ramp.surfaceNormal),
      grinding: grind.state.active,
      crouch: grind.state.active ? Math.max(crouch, 0.25) : crouch,
      lean: grind.state.active ? grind.state.balance : lean * travelSide,
      carve: grounded && !grind.state.active ? carveLean(speed, lean) * travelSide : 0,
      airborne: !grounded,
      bail: false,
      wheelRoll,
      boardSpin,
    });
  }

  function startCrash(tricks: TrickState, momentum: THREE.Vector3) {
    if (ragdoll.active) return;
    // Capture the current articulated pose rather than spawning a different crash model.
    render(1, 0);
    const rig = visual.captureRagdoll();
    const releasedBoard = visual.board.getWorldPosition(new THREE.Vector3());
    const releasedRotation = visual.board.getWorldQuaternion(new THREE.Quaternion());
    body.setTranslation(releasedBoard,true); body.setRotation(releasedRotation,true);
    ragdoll.start(rig, momentum, ramp.surfaceNormal); visual.setRagdoll(true);
    visual.board.position.set(0,0,0); visual.board.rotation.set(0,0,0);
    pump.reset(); grind.reset(); crashElapsed = 0; grounded = false; followSurface = false;
    air.reset();airOffset.set(0,0,0);previousAirOffset.set(0,0,0);
    tricks.active = null; tricks.grab = null; tricks.grabTime = 0;
    tricks.boardSpin = {x:0,y:0,z:0}; tricks.bail = true; tricks.message = "Bail!"; tricks.messageAge = 0;
    boardCollider.setMassProperties(3, {x:0,y:0,z:0}, {x:0.18,y:0.18,z:0.06}, {x:0,y:0,z:0,w:1});
    boardCollider.setFriction(0.55); boardCollider.setCollisionGroups(0x00040001);
    body.setAngvel({x:3,y:0.5,z:1.5}, true);
    const t = body.translation(), q = body.rotation();
    loosePrevious.set(t.x,t.y,t.z); loosePreviousQ.set(q.x,q.y,q.z,q.w);
    position.copy(ragdoll.focus); previousPosition.copy(position); renderPosition.copy(position);
  }

  function obstacleAhead(dt: number) {
    if (velocity.length() < 4.5) return false;
    const direction = velocity.clone().normalize();
    const hit = world.castRayAndGetNormal(new RAPIER.Ray(position, direction), 0.4 + speed * dt, true, undefined, undefined, undefined, body);
    if (!hit) return false;
    const n = new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z);
    return Math.abs(n.dot(ramp.surfaceNormal)) < 0.55 && Math.abs(n.dot(velocity)) > 4.5;
  }

  function impactFromContacts() {
    let hit = false;
    world.contactPairsWith(boardCollider, collider => {
      world.contactPair(boardCollider, collider, manifold => {
        const n = manifold.normal();
        if (Math.abs(n.x*ramp.surfaceNormal.x + n.y*ramp.surfaceNormal.y + n.z*ramp.surfaceNormal.z) > 0.55) return;
        let impulse = 0;
        for (let i=0; i<manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
        if (impulse > MASS * 3.5 || impactVelocity.length() - speed > 4.5) hit = true;
      });
    });
    return hit;
  }

  function invertedLanding() {
    if(!air.state.engaged) return false;
    // The wheel rays face away from the road when inverted; probe the rider too.
    for(const height of [0,0.55,1.05]) {
      landingProbe.set(0,height,0).applyQuaternion(quat).add(position).addScaledVector(ramp.surfaceNormal,0.15);
      const hit=world.castRayAndGetNormal(new RAPIER.Ray(landingProbe,landingDown),0.32,true,undefined,undefined,undefined,body);
      if(!hit)continue;
      const normal=tmp.set(hit.normal.x,hit.normal.y,hit.normal.z);
      if(normal.dot(ramp.surfaceNormal)>0.4 && velocity.dot(normal)<-0.1 && boardUp.dot(normal)<0.75) return true;
    }
    return false;
  }

  function update(dt: number, intent: PlayerIntent, tricks: TrickState) {
    if (intent.reset) {
      reset(ramp.spawn);
      return;
    }

    if (ragdoll.active) {
      crashElapsed += dt;
      if (crashElapsed >= 3.2) {
        reset(ramp.spawn); tricks.bail = false; tricks.message = null; tricks.lastLanded = null; return;
      }
      previousPosition.copy(position); previousQuat.copy(quat); ragdoll.beginStep();
      const t = body.translation(), q = body.rotation();
      loosePrevious.set(t.x,t.y,t.z); loosePreviousQ.set(q.x,q.y,q.z,q.w);
      tricks.message = "Bail!"; tricks.messageAge = 0;
      return;
    }
    readPose();
    previousPosition.copy(position); previousQuat.copy(quat);
    previousAirOffset.copy(airOffset); previousBaseQuat.copy(baseQuat);
    if (tricks.bail || obstacleAhead(dt)) { startCrash(tricks, velocity); return; }
    air.update(dt,intent.toggleAirFlip ?? false,intent.push,intent.steer,!grounded && !grind.state.active,yaw);
    pump.update(dt, intent.push > 0, speed, grounded && !grind.state.active && !intent.crouch && !intent.wantOllie && !tricks.bail);
    ollieCooldown = Math.max(0, ollieCooldown - dt);
    leaveGround = Math.max(0, leaveGround - dt);
    const steering=air.state.active ? 0 : intent.steer;
    lean = THREE.MathUtils.damp(lean, steering, grounded ? CARVE.response : 8, dt);

    // On the road the trucks turn as weight shifts onto an edge; in the air the rider spins freely.
    yaw -= grounded ? lean * carveTurnRate(speed) * dt : steering * 5 * dt;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));

    if (grind.update(dt, position, velocity, forward, ramp.surfaceNormal, ramp.grindRails,
      steering, intent.wantOllie, intent.push < 0, !tricks.active && leaveGround <= 0 && boardUp.dot(ramp.surfaceNormal)>0.8)) {
      air.reset();airOffset.set(0,0,0);
      yaw = Math.cos(yaw) >= 0 ? 0 : Math.PI;
      body.setTranslation(position, true); body.setLinvel(velocity, true);
      grounded = false; followSurface = grind.state.active; wasOnKicker = false;
      surfaceUp.copy(grind.normal);
      if (!grind.state.active) leaveGround = 0.25;
      holdDeck(grind.normal);
      return;
    }

    if(air.state.engaged)holdDeck();
    if(invertedLanding()) { startCrash(tricks,velocity);return; }

    // --- suspension rays ---
    rayDir.copy(boardUp).multiplyScalar(-1);
    wheelsDown = 0;
    let contactN = new THREE.Vector3();
    for (const m of MOUNTS) {
      mount.set(m.x, m.y, m.z).applyQuaternion(quat).add(position);
      const ray = new RAPIER.Ray(
        { x: mount.x, y: mount.y, z: mount.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z }
      );
      const hit = world.castRayAndGetNormal(ray, RAY_LEN, true, undefined, undefined, undefined, body);
      if (!hit) continue;
      const compressed = REST - (hit.timeOfImpact - WHEEL_R);
      if (compressed <= 0) continue;
      let nx = hit.normal.x;
      let ny = hit.normal.y;
      let nz = hit.normal.z;
      const upDot =
        nx * ramp.surfaceNormal.x + ny * ramp.surfaceNormal.y + nz * ramp.surfaceNormal.z;
      if (upDot < 0.4) continue;
      wheelsDown++;
      contactN.add(new THREE.Vector3(nx, ny, nz));

      // While popping, the springs would grab the deck and cancel the ollie.
      if (leaveGround > 0) continue;

      const point = ray.pointAt(hit.timeOfImpact);
      const velAt = body.velocityAtPoint(point);
      const vn = velAt.x * nx + velAt.y * ny + velAt.z * nz;
      const force = Math.max(0, compressed * STIFF - vn * DAMP);

      body.applyImpulseAtPoint({ x: nx * force * dt, y: ny * force * dt, z: nz * force * dt }, point, true);

      // Grip is applied at the center of mass so it slows the slide without flipping the deck
      const tx = velAt.x - nx * vn;
      const ty = velAt.y - ny * vn;
      const tz = velAt.z - nz * vn;
      const along = tx * forward.x + ty * forward.y + tz * forward.z;
      const sx = tx - forward.x * along;
      const sy = ty - forward.y * along;
      const sz = tz - forward.z * along;
      const sideMag = Math.hypot(sx, sy, sz);
      if (sideMag > 0.08) {
        const grip = Math.min(sideMag * 18, 40) * dt;
        body.applyImpulse({ x: (-sx / sideMag) * grip, y: (-sy / sideMag) * grip, z: (-sz / sideMag) * grip }, true);
      }

    }

    if (contactN.lengthSq() > 0) contactN.normalize();
    else contactN.copy(ramp.surfaceNormal);
    if (!grounded && leaveGround <= 0 && wheelsDown >= 2 && velocity.dot(contactN) < -20) {
      startCrash(tricks, velocity); return;
    }
    grounded = leaveGround <= 0 && wheelsDown >= 2;

    // Push, steer, ollie — only while the wheels are planted
    if (grounded) {
      if(air.state.engaged) {
        const courseRight=new THREE.Vector3().crossVectors(ramp.forward,ramp.surfaceNormal);
        yaw=Math.atan2(-forward.dot(courseRight),forward.dot(ramp.forward));
        const landedFlip=describeAirRotation(air.state);
        if(landedFlip) { tricks.message=tricks.lastLanded=landedFlip;tricks.messageAge=0; }
        air.reset();airOffset.set(0,0,0);
      }
      const n = contactN.lengthSq() > 0.5 ? contactN : ramp.surfaceNormal.clone();
      const coursePitch = Math.atan(courseSlope(ramp.distance + position.clone().sub(ramp.anchor).dot(ramp.forward)));
      const courseUp = ramp.surfaceNormal.clone().multiplyScalar(Math.cos(coursePitch)).addScaledVector(ramp.forward,-Math.sin(coursePitch));
      const onKicker = n.dot(courseUp) < 0.97;
      if (wasOnKicker && !onKicker) {
        // Keep the speed you had going up the face, so the lip throws you.
        wasOnKicker = false;
        leaveGround = 0.35;
        grounded = false;
        followSurface = false;
        holdDeck();
      } else {
        wasOnKicker = onKicker;
        const travel = ramp.forward.clone().applyAxisAngle(ramp.surfaceNormal, yaw);
        travel.addScaledVector(n, -travel.dot(n));
        if (travel.lengthSq() < 1e-6) travel.copy(ramp.forward);
        travel.normalize();

        // Keep the suspension impulses applied above, including their normal lift.
        const current = body.linvel();
        const vel = new THREE.Vector3(current.x, current.y, current.z);
        const normalSpeed = vel.dot(n);
        vel.addScaledVector(n, -normalSpeed);
        // A 180 changes stance, not momentum: land switch and keep rolling downhill.
        const rollingDirection = travel.clone().multiplyScalar(vel.dot(travel) < -0.1 ? -1 : 1);

        if (intent.push < 0) {
          // Brake along actual motion, without accelerating backwards.
          vel.multiplyScalar(Math.max(0, 1 - 24 * dt / Math.max(vel.length(), 0.001)));
        } else {
          // Diminishing speed gains only when riding downhill. Uphill turns still lose speed.
          const downhill = THREE.MathUtils.clamp(-rollingDirection.y/Math.sin(RAMP.angleDeg*Math.PI/180),0,1.3);
          const gain = (approachTopSpeed(vel.length(), dt, pump.state.active) - vel.length()) * downhill;
          const gravityAlong = -18 * rollingDirection.y;
          vel.addScaledVector(rollingDirection, gain - Math.max(0, gravityAlong) * dt);
          // Hard carves scrub speed, so wide S-turns check a fast descent.
          const rolling = vel.length();
          vel.multiplyScalar(Math.max(0, 1 - carveDrag(rolling, lean) * dt / Math.max(rolling, 0.001)));
        }

        // Carve along the board, but keep the speed you carried onto a ramp.
        let spd = vel.length();
        if (spd > 0.5 && intent.push >= 0) {
          // Wheels only roll along the board: whatever travels across them slides and bleeds speed.
          const alignment = vel.dot(rollingDirection) / spd;
          spd = Math.max(0, spd - CARVE.slide * (1 - alignment * alignment) * dt);
        }
        const carved = rollingDirection.multiplyScalar(spd);
        vel.lerp(carved, 1 - Math.exp(-dt / CARVE.grip));

        vel.addScaledVector(n, normalSpeed);
        body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
        velocity.copy(vel);

        if (intent.wantOllie && ollieCooldown <= 0) {
          const hop = 4.4 + intent.olliePower * 2.2 + Math.min(speed, 40) * 0.13;
          const lin = vel.clone();
          lin.addScaledVector(n, hop);
          body.setLinvel({ x: lin.x, y: lin.y, z: lin.z }, true);
          velocity.copy(lin);
          leaveGround = 0.28 + Math.min(speed, 40) * 0.006;
          ollieCooldown = 0.3;
          grounded = false;
          followSurface = false;
          holdDeck();
        } else {
          followSurface = true;
          surfaceUp.copy(n);
          holdDeck(n);
        }
      }
    } else {
      if (wasOnKicker) {
        wasOnKicker = false;
        leaveGround = Math.max(leaveGround, 0.35);
      }
      followSurface = false;
      holdDeck();
    }

    const along = Math.max(0, velocity.dot(forward));
    wheelRoll += (along / WHEEL_R) * dt;

    if (Math.abs(position.x) > LANDSCAPE_HALF_WIDTH - 10 || tmp.copy(position).sub(ramp.anchor).dot(ramp.surfaceNormal) < -50) {
      startCrash(tricks, velocity);
    }
  }

  function sync(paintFrame = true) {
    originShift.set(0, 0, 0);
    if (!ragdoll.active) holdDeck(followSurface ? surfaceUp : ramp.surfaceNormal);
    readPose();
    if (!ragdoll.active && liveTricks && impactFromContacts()) startCrash(liveTricks, impactVelocity);
    if (ragdoll.active) { ragdoll.sync(); position.copy(ragdoll.focus); velocity.copy(ragdoll.velocity); speed = velocity.length(); }
    if (!ragdoll.active && speed > MAX_SPEED) {
      velocity.multiplyScalar(MAX_SPEED / speed); body.setLinvel(velocity, true); speed = MAX_SPEED;
    }
    // When you've ridden a full chunk downhill, snap origin and stream the next seeded stretch.
    const along = position.clone().sub(ramp.anchor).dot(ramp.forward);
    if (along > RAMP.chunkLength) {
      const steps = Math.floor(along / RAMP.chunkLength);
      const shift = steps * RAMP.chunkLength;
      const keep = {
        x: velocity.x,
        y: velocity.y,
        z: velocity.z,
      };
      originShift.copy(ramp.scroll(shift));
      position.add(originShift);
      previousPosition.add(originShift);
      if (ragdoll.active) {
        const t = body.translation();
        body.setTranslation({x:t.x+originShift.x,y:t.y+originShift.y,z:t.z+originShift.z}, true);
        loosePrevious.add(originShift); ragdoll.shift(originShift);
      } else {
        body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
        body.setLinvel(keep, true);
      }
    }
    if (paintFrame) render(1, poseDt);
  }

  function render(alpha: number, dt: number) {
    poseDt = dt;
    renderBodyPosition.lerpVectors(previousPosition, position, THREE.MathUtils.clamp(alpha, 0, 1));
    renderAirOffset.lerpVectors(previousAirOffset,airOffset,THREE.MathUtils.clamp(alpha,0,1));
    renderPosition.copy(renderBodyPosition).sub(renderAirOffset);
    renderQuat.slerpQuaternions(previousQuat, quat, THREE.MathUtils.clamp(alpha, 0, 1));
    renderBaseQuat.slerpQuaternions(previousBaseQuat, baseQuat, THREE.MathUtils.clamp(alpha, 0, 1));
    if (ragdoll.active) {
      ragdoll.render(THREE.MathUtils.clamp(alpha,0,1));
      const t = body.translation(), q = body.rotation();
      visual.root.position.lerpVectors(loosePrevious, new THREE.Vector3(t.x,t.y,t.z), alpha);
      visual.root.quaternion.slerpQuaternions(loosePreviousQ, new THREE.Quaternion(q.x,q.y,q.z,q.w), alpha);
      return;
    }
    sampleVisualSupport(renderBodyPosition);
    const spin =
      liveTricks && (liveTricks.active || liveTricks.boardSpin.y !== 0 || liveTricks.boardSpin.z !== 0)
        ? liveTricks.boardSpin
        : { x: 0, y: 0, z: 0 };
    paint(crouchHolder, spin, renderBodyPosition);
  }

  // pose inputs captured each update for the post-step sync
  let crouchHolder = 0;
  let liveTricks: TrickState | null = null;

  const originalUpdate = update;
  function updateWrapped(dt: number, intent: PlayerIntent, tricks: TrickState) {
    poseDt = dt;
    posePush = intent.push;
    crouchHolder = intent.crouchHold;
    liveTricks = tricks;
    originalUpdate(dt, intent, tricks);
    const v = body.linvel(); impactVelocity.set(v.x,v.y,v.z);
  }

  reset(spawn);

  return {
    get crashed() { return ragdoll.active; },
    get resetCount() { return resetCount; },
    pump: pump.state,
    aerial: air.state,
    grind: grind.state,
    originShift,
    mesh: visual.root,
    body,
    get grounded() {
      return grounded;
    },
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
    update: updateWrapped,
    sync,
    render,
    reset,
  };
}
