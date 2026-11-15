import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerIntent } from "./controller.ts";
import type { TrickState } from "./tricks.ts";
import { BOARD, WHEEL_BOTTOM } from "./dimensions.ts";
import { createSkaterVisual } from "./skaterVisual.ts";
import { createRagdoll } from "./ragdoll.ts";
import { createPumpCycle } from "./pump.ts";
import { createGrindSystem } from "./grind.ts";
import { approachTopSpeed, MAX_SPEED } from "./speed.ts";
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
  function sampleVisualSupport(at: THREE.Vector3) {
    if (grind.state.active) { visualHeightOffset = 0; return; }
    if (!grounded || leaveGround > 0) return;
    // Re-sample after fitting the board plane: pitching around a ramp seam shifts wheel positions.
    for (let pass = 0; pass < 3; pass++) {
      const contacts: THREE.Vector3[] = [];
      const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(renderQuat);
      const down = currentUp.clone().negate();
      const candidate = at.clone().addScaledVector(currentUp, visualHeightOffset);
      for (const m of MOUNTS) {
        const origin = new THREE.Vector3(m.x, 0.1, m.z).applyQuaternion(renderQuat).add(candidate);
        const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, down), 0.5, true, undefined, undefined, undefined, body);
        if (!hit || new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).dot(ramp.surfaceNormal) < 0.4) continue;
        contacts.push(origin.addScaledVector(down, hit.timeOfImpact));
      }
      if (contacts.length < 2) return;
      let up = currentUp;
      if (contacts.length === 4) {
        const across = contacts[1]!.clone().sub(contacts[0]!).add(contacts[3]!.clone().sub(contacts[2]!));
        const along = contacts[2]!.clone().add(contacts[3]!).sub(contacts[0]!).sub(contacts[1]!);
        const planeUp = new THREE.Vector3().crossVectors(along, across).normalize();
        if (planeUp.dot(boardUp) > 0.8) up = planeUp;
      }
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(renderQuat);
      f.addScaledVector(up, -f.dot(up)).normalize();
      const right = new THREE.Vector3().crossVectors(f, up).normalize();
      renderQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, f.negate()));
      // Use the highest support plane so no supported wheel penetrates the surface.
      let correction = -Infinity;
      for (const point of contacts) correction = Math.max(correction, -WHEEL_BOTTOM - at.clone().sub(point).dot(up));
      visualHeightOffset = THREE.MathUtils.clamp(correction, -0.25, 0.1);
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
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    quat.copy(q);
    boardUp.copy(n);
    forward.copy(f);
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
    renderQuat.copy(quat);
    paint(0, { x: 0, y: 0, z: 0 });
  }

  function paint(crouch: number, boardSpin: { x: number; y: number; z: number }, at = position) {
    visual.root.quaternion.copy(renderQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(renderQuat);
    // The suspension body stays stable; its visible wheel bottoms sit on the measured surface.
    const offset = grind.state.active ? 0 : visualHeightOffset;
    visual.root.position.copy(at).addScaledVector(up, offset);
    visual.setPose({
      grab: liveTricks?.grab ?? null,
      pump: pump.state,
      dt: poseDt,
      speed,
      push: posePush,
      verticalSpeed: velocity.dot(ramp.surfaceNormal),
      grinding: grind.state.active,
      crouch: grind.state.active ? Math.max(crouch, 0.25) : crouch,
      lean: grind.state.active ? grind.state.balance : lean,
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
    if (tricks.bail || obstacleAhead(dt)) { startCrash(tricks, velocity); return; }
    pump.update(dt, intent.push > 0, speed, grounded && !grind.state.active && !intent.crouch && !intent.wantOllie && !tricks.bail);
    ollieCooldown = Math.max(0, ollieCooldown - dt);
    leaveGround = Math.max(0, leaveGround - dt);
    lean = THREE.MathUtils.damp(lean, intent.steer, 8, dt);

    const turn = grounded ? THREE.MathUtils.lerp(1.3, 2.1, THREE.MathUtils.clamp(speed / 14, 0, 1)) : 5;
    yaw -= intent.steer * turn * dt;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));

    if (grind.update(dt, position, velocity, forward, ramp.surfaceNormal, ramp.grindRails,
      intent.steer, intent.wantOllie, intent.push < 0, !tricks.active && leaveGround <= 0)) {
      yaw = Math.cos(yaw) >= 0 ? 0 : Math.PI;
      body.setTranslation(position, true); body.setLinvel(velocity, true);
      grounded = false; followSurface = grind.state.active; wasOnKicker = false;
      surfaceUp.copy(grind.normal);
      if (!grind.state.active) leaveGround = 0.25;
      holdDeck(grind.normal);
      return;
    }

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
        }

        // Carve along the board, but keep the speed you carried onto a ramp.
        const spd = vel.length();
        const carved = rollingDirection.multiplyScalar(spd);
        vel.lerp(carved, 1 - Math.pow(0.15, dt));

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
    renderPosition.lerpVectors(previousPosition, position, THREE.MathUtils.clamp(alpha, 0, 1));
    renderQuat.slerpQuaternions(previousQuat, quat, THREE.MathUtils.clamp(alpha, 0, 1));
    if (ragdoll.active) {
      ragdoll.render(THREE.MathUtils.clamp(alpha,0,1));
      const t = body.translation(), q = body.rotation();
      visual.root.position.lerpVectors(loosePrevious, new THREE.Vector3(t.x,t.y,t.z), alpha);
      visual.root.quaternion.slerpQuaternions(loosePreviousQ, new THREE.Quaternion(q.x,q.y,q.z,q.w), alpha);
      return;
    }
    sampleVisualSupport(renderPosition);
    const spin =
      liveTricks && (liveTricks.active || liveTricks.boardSpin.y !== 0 || liveTricks.boardSpin.z !== 0)
        ? liveTricks.boardSpin
        : { x: 0, y: 0, z: 0 };
    paint(crouchHolder, spin, renderPosition);
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
