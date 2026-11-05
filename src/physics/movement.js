// Source-engine style player movement (the bits that make surf work).
//
// Coordinate system: Y is up (three.js convention). Units are Source units
// (a player is 72 tall, 32 wide). Yaw 0 looks down -Z, like a three.js camera.
//
// Why surf works with this code:
//  * Any surface steeper than ~45 degrees (normal.y < 0.7) is never "ground",
//    so on a ramp you're always in AirMove.
//  * AirAccelerate caps the *projected* wish speed at 30, but accelerates by
//    airaccelerate * 250 * dt, so turning your view while strafing adds speed.
//  * ClipVelocity removes only the velocity component going into the ramp,
//    so momentum is redirected along the surface instead of lost.

import { V3 } from './vec.js';
import { TraceResult } from './world.js';

export const DEFAULT_CVARS = {
  gravity: 800,
  accelerate: 10,
  airaccelerate: 150,
  airSpeedCap: 30,
  friction: 4,
  stopspeed: 75,
  maxspeed: 260, // walking speed with a knife out
  maxvelocity: 3500,
  jumpImpulse: Math.sqrt(2 * 800 * 57), // ~302
  stepsize: 18,
  autobhop: true,
};

export const HULL = new V3(16, 36, 16); // half extents
export const EYE_OFFSET = 64 - 36; // eye height above hull center
const MOVE_SPEED = 450; // cl_forwardspeed / cl_sidespeed
const NON_JUMP_VELOCITY = 140;
const MAX_CLIP_PLANES = 5;
const GROUND_MIN_NY = 0.7;

export class Player {
  constructor() {
    this.pos = new V3();
    this.vel = new V3();
    this.onGround = false;
    this.groundNormal = new V3(0, 1, 0);
    this.surfing = false; // touched a surfable slope this tick
    this.surfNormal = new V3();
    this.lastJump = false;
  }
  teleport(p, yaw = null) {
    this.pos.copy(V3.from(p));
    this.vel.set(0, 0, 0);
    this.onGround = false;
    if (yaw !== null) this.yaw = yaw;
  }
}

const tr = new TraceResult();
const tr2 = new TraceResult();
const tmpA = new V3();
const tmpB = new V3();

export class Movement {
  constructor(world, cvars = {}) {
    this.world = world;
    this.cv = { ...DEFAULT_CVARS, ...cvars };
  }

  /**
   * Advance one tick.
   * @param {Player} p
   * @param {{forward:number, side:number, jump:boolean, yaw:number}} cmd
   * @param {number} dt seconds
   */
  tick(p, cmd, dt) {
    const cv = this.cv;
    p.surfing = false;
    p.ticksSinceSurf = (p.ticksSinceSurf ?? 99) + 1;
    this.unstick(p);

    if (!p.onGround) p.vel.y -= cv.gravity * 0.5 * dt;

    // jumping
    const wantJump = cmd.jump && (cv.autobhop || !p.lastJump);
    p.lastJump = cmd.jump;
    let jumped = false;
    if (wantJump && p.onGround) {
      p.vel.y = cv.jumpImpulse;
      p.onGround = false;
      jumped = true;
    }

    if (p.onGround) {
      p.vel.y = 0;
      this.friction(p, dt);
    }
    this.clampVelocity(p);

    // wish direction from input
    const fwdX = -Math.sin(cmd.yaw), fwdZ = -Math.cos(cmd.yaw);
    const rgtX = Math.cos(cmd.yaw), rgtZ = -Math.sin(cmd.yaw);
    const fm = clamp(cmd.forward, -1, 1) * MOVE_SPEED;
    const sm = clamp(cmd.side, -1, 1) * MOVE_SPEED;
    const wish = tmpA.set(fwdX * fm + rgtX * sm, 0, fwdZ * fm + rgtZ * sm);
    let wishspeed = wish.len();
    if (wishspeed > 1e-6) wish.scale(1 / wishspeed);
    if (wishspeed > cv.maxspeed) wishspeed = cv.maxspeed;

    if (p.onGround) {
      this.accelerate(p, wish, wishspeed, cv.accelerate, dt);
      p.vel.y = 0;
      this.walkMove(p, dt);
    } else {
      this.airAccelerate(p, wish, wishspeed, cv.airaccelerate, dt);
      this.tryPlayerMove(p, dt);
    }

    this.categorize(p);
    this.clampVelocity(p);
    if (!p.onGround) {
      // Source applies FinishGravity unless we're on ground. On jump ticks it
      // is applied too.
      p.vel.y -= cv.gravity * 0.5 * dt;
    } else {
      p.vel.y = 0;
    }
    return jumped;
  }

  friction(p, dt) {
    const speed = p.vel.len();
    if (speed < 0.1) return;
    const control = speed < this.cv.stopspeed ? this.cv.stopspeed : speed;
    const drop = control * this.cv.friction * dt;
    let ns = speed - drop;
    if (ns < 0) ns = 0;
    p.vel.scale(ns / speed);
  }

  accelerate(p, wishdir, wishspeed, accel, dt) {
    const cur = p.vel.dot(wishdir);
    const add = wishspeed - cur;
    if (add <= 0) return;
    let as = accel * dt * wishspeed;
    if (as > add) as = add;
    p.vel.addScaled(wishdir, as);
  }

  airAccelerate(p, wishdir, wishspeed, accel, dt) {
    let wishspd = wishspeed;
    if (wishspd > this.cv.airSpeedCap) wishspd = this.cv.airSpeedCap;
    const cur = p.vel.dot(wishdir);
    const add = wishspd - cur;
    if (add <= 0) return;
    let as = accel * wishspeed * dt;
    if (as > add) as = add;
    p.vel.addScaled(wishdir, as);
  }

  clampVelocity(p) {
    const m = this.cv.maxvelocity;
    p.vel.x = clamp(p.vel.x, -m, m);
    p.vel.y = clamp(p.vel.y, -m, m);
    p.vel.z = clamp(p.vel.z, -m, m);
  }

  walkMove(p, dt) {
    const speed = p.vel.len();
    if (speed < 1) { p.vel.set(0, 0, 0); return; }
    const dest = tmpB.copy(p.pos).addScaled(p.vel, dt);
    this.world.trace(p.pos, dest, HULL, tr);
    if (tr.fraction === 1 && !tr.startsolid) {
      p.pos.copy(tr.endpos);
      this.stayOnGround(p);
      return;
    }
    this.stepMove(p, dt);
    this.stayOnGround(p);
  }

  // Try a normal slide move and a "step up, slide, step down" move; keep
  // whichever went further horizontally (lets you walk up small ledges).
  stepMove(p, dt) {
    const startPos = p.pos.clone();
    const startVel = p.vel.clone();
    this.tryPlayerMove(p, dt);
    const downPos = p.pos.clone();
    const downVel = p.vel.clone();

    p.pos.copy(startPos); p.vel.copy(startVel);
    const up = new V3(p.pos.x, p.pos.y + this.cv.stepsize, p.pos.z);
    this.world.trace(p.pos, up, HULL, tr);
    if (!tr.startsolid && !tr.allsolid) p.pos.copy(tr.endpos);
    this.tryPlayerMove(p, dt);
    const down = new V3(p.pos.x, p.pos.y - this.cv.stepsize, p.pos.z);
    this.world.trace(p.pos, down, HULL, tr);
    if (!tr.startsolid && !tr.allsolid) p.pos.copy(tr.endpos);
    if (tr.fraction === 1 || tr.normal.y < GROUND_MIN_NY) {
      p.pos.copy(downPos); p.vel.copy(downVel);
      return;
    }
    const dDown = (downPos.x - startPos.x) ** 2 + (downPos.z - startPos.z) ** 2;
    const dUp = (p.pos.x - startPos.x) ** 2 + (p.pos.z - startPos.z) ** 2;
    if (dDown > dUp) {
      p.pos.copy(downPos); p.vel.copy(downVel);
    } else {
      p.vel.y = downVel.y;
    }
  }

  stayOnGround(p) {
    const start = new V3(p.pos.x, p.pos.y + 2, p.pos.z);
    const end = new V3(p.pos.x, p.pos.y - this.cv.stepsize, p.pos.z);
    this.world.trace(p.pos, start, HULL, tr);
    start.copy(tr.endpos);
    this.world.trace(start, end, HULL, tr);
    if (tr.fraction > 0 && tr.fraction < 1 && !tr.startsolid && tr.normal.y >= GROUND_MIN_NY) {
      p.pos.copy(tr.endpos);
    }
  }

  categorize(p) {
    if (p.vel.y > NON_JUMP_VELOCITY) { p.onGround = false; return; }
    const end = new V3(p.pos.x, p.pos.y - 2, p.pos.z);
    this.world.trace(p.pos, end, HULL, tr);
    if (tr.fraction < 1 && tr.normal.y >= GROUND_MIN_NY && !tr.allsolid) {
      p.onGround = true;
      p.groundNormal.copy(tr.normal);
      if (!tr.startsolid) p.pos.copy(tr.endpos);
    } else {
      p.onGround = false;
      if (tr.fraction < 1 && tr.normal.y > 0) this.markSurf(p, tr.normal);
    }
  }

  markSurf(p, n) {
    if (n.y > 0.05 && n.y < GROUND_MIN_NY) {
      p.surfing = true;
      p.surfNormal.copy(n);
      (p.lastSurfNormal ??= new V3()).copy(n);
      p.ticksSinceSurf = 0;
    }
  }

  /** Source's TryPlayerMove: slide along up to MAX_CLIP_PLANES planes. */
  tryPlayerMove(p, dt) {
    const planes = [];
    const original = p.vel.clone();
    const primal = p.vel.clone();
    let timeLeft = dt;
    const end = new V3();
    for (let bump = 0; bump < 4; bump++) {
      if (p.vel.isZero()) break;
      end.copy(p.pos).addScaled(p.vel, timeLeft);
      this.world.trace(p.pos, end, HULL, tr);
      if (tr.allsolid) { p.vel.set(0, 0, 0); return; }
      if (tr.fraction > 0) {
        p.pos.copy(tr.endpos);
        original.copy(p.vel);
        planes.length = 0;
      }
      if (tr.fraction === 1) break;
      if (this.seamStep(p, tr, timeLeft)) break;
      this.markSurf(p, tr.normal);
      timeLeft -= timeLeft * tr.fraction;
      if (planes.length >= MAX_CLIP_PLANES) { p.vel.set(0, 0, 0); break; }
      planes.push(tr.normal.clone());

      if (planes.length === 1 && !p.onGround) {
        clipVelocity(original, planes[0], p.vel, 1.0);
        original.copy(p.vel);
      } else {
        let i;
        for (i = 0; i < planes.length; i++) {
          clipVelocity(original, planes[i], p.vel, 1.0);
          let j;
          for (j = 0; j < planes.length; j++) {
            if (j !== i && p.vel.dot(planes[j]) < 0) break;
          }
          if (j === planes.length) break;
        }
        if (i === planes.length) {
          if (planes.length !== 2) { p.vel.set(0, 0, 0); break; }
          const dir = V3.cross(planes[0], planes[1]).normalize();
          const d = dir.dot(p.vel);
          p.vel.copy(dir).scale(d);
        }
        if (p.vel.dot(primal) <= 0) { p.vel.set(0, 0, 0); break; }
      }
    }
  }

  /**
   * Seam fix (like surf servers' "rampbug" fixes): while surfing, a tiny
   * lip where two ramp segments meet can register as a wall hit and stop
   * you dead. If lifting the move a few units off the ramp we're riding
   * clears it completely, take that move instead.
   */
  seamStep(p, hit, timeLeft) {
    const n = p.lastSurfNormal;
    if (!n || p.ticksSinceSurf > 3) return false;
    if (hit.normal.dot(n) > 0.97) return false; // that's just the ramp itself
    if (p.vel.len() < 300) return false;
    for (const lift of [2, 5, 9]) {
      const s = new V3(p.pos.x + n.x * lift, p.pos.y + n.y * lift, p.pos.z + n.z * lift);
      const e = s.clone().addScaled(p.vel, timeLeft);
      const t2 = this.world.trace(s, e, HULL, tr2);
      if (!t2.startsolid && t2.fraction === 1) {
        p.pos.copy(t2.endpos);
        return true;
      }
    }
    return false;
  }

  /** If we're embedded in geometry, nudge out. */
  unstick(p) {
    this.world.trace(p.pos, p.pos, HULL, tr);
    if (!tr.startsolid) return;
    const offs = [];
    for (const r of [0.125, 1, 2, 4, 8, 16]) {
      offs.push([0, r, 0], [r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r], [0, -r, 0]);
    }
    for (const o of offs) {
      const t = new V3(p.pos.x + o[0], p.pos.y + o[1], p.pos.z + o[2]);
      this.world.trace(t, t, HULL, tr);
      if (!tr.startsolid) { p.pos.copy(t); return; }
    }
  }
}

export function clipVelocity(inV, n, out, overbounce) {
  const backoff = inV.dot(n) * overbounce;
  out.set(inV.x - n.x * backoff, inV.y - n.y * backoff, inV.z - n.z * backoff);
  // make sure we're not still moving into the plane
  const adjust = out.dot(n);
  if (adjust < 0) out.addScaled(n, -adjust);
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
