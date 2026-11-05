// A simple surf bot that follows a stage's guide line.
// Used to validate maps (tests) and to fly the camera in the menu background.

const D2R = Math.PI / 180;

export class SurfBot {
  /**
   * @param {Array<{p:number[],h:number,gap:boolean,face:string,width:number}>} line
   * @param {object} [o] { offset: fraction of half-width to ride at (0..1) }
   */
  constructor(line, o = {}) {
    this.line = line;
    this.idx = o.start ?? 0;
    this.offset = o.offset ?? 0.5;
    this.walking = o.walk ?? true;
    this.skip = o.skip || null; // [from, to]: take a fork's fast line
    this.forks = o.forks || []; // take a fork's fast line when fast enough
  }

  /** Nearest guide segment at/after the current index. */
  _locate(pos) {
    const L = this.line;
    let best = this.idx, bestD = Infinity;
    for (let i = Math.max(0, this.idx - 1); i < Math.min(L.length - 1, this.idx + 6); i++) {
      const a = L[i].p, b = L[i + 1].p;
      const t = projT(pos, a, b);
      const cx = a[0] + (b[0] - a[0]) * t, cz = a[2] + (b[2] - a[2]) * t;
      const d = (pos.x - cx) ** 2 + (pos.z - cz) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    // advance once we're past the end of a segment
    const a = this.line[best].p, b = this.line[Math.min(best + 1, L.length - 1)].p;
    if (projT(pos, a, b, false) > 1 && best < L.length - 2) best++;
    this.idx = Math.max(this.idx, best);
    return this.idx;
  }

  /** @returns {{forward:number, side:number, jump:boolean, yaw:number, pitch:number}} */
  command(player) {
    const L = this.line;
    let i = this._locate(player.pos);
    if (!this.skip) {
      const sp = Math.hypot(player.vel.x, player.vel.z);
      for (const f of this.forks) if (i === f.from && sp > f.speed * 1.08) this.skip = [f.from, f.to];
    }
    if (this.skip && i >= this.skip[0] && i < this.skip[1]) {
      // fast line: aim straight at the far ramp
      i = this.skip[0];
      const a = L[i], b = L[this.skip[1]];
      if (projT(player.pos, a.p, b.p, false) >= 1) { this.idx = this.skip[1]; this.skip = null; }
      else return this._steer(player, a, { ...b, gap: true });
    }
    const a = L[i], b = L[Math.min(i + 1, L.length - 1)];
    return this._steer(player, a, b);
  }

  _steer(player, a, b) {
    const L = this.line;
    let tx = b.p[0] - a.p[0], tz = b.p[2] - a.p[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const rx = -tz, rz = tx;
    const t = projT(player.pos, a.p, b.p);
    const px = a.p[0] + (b.p[0] - a.p[0]) * t, pz = a.p[2] + (b.p[2] - a.p[2]) * t;
    const e = (player.pos.x - px) * rx + (player.pos.z - pz) * rz;
    const faceSign = b.face === 'right' ? 1 : -1;
    const target = faceSign * b.width * (b.offset ?? this.offset);
    const along = Math.atan2(-tx, -tz);
    if (player.onGround) this.touchedGround = true;
    if (this.walking && (player.onGround || !this.touchedGround)) {
      return { forward: 1, side: 0, jump: false, yaw: (L[0].h ?? 0) * D2R, pitch: -0.2 };
    }
    this.walking = false;

    if (player.surfing && !b.gap) {
      // push into the ramp when we've slid below the target line
      const low = faceSign < 0 ? e < target : e > target;
      // way too high (near the ridge): lean away from the ramp
      const high = Math.abs(e) < b.width * 0.15;
      return { forward: 0, side: low ? -faceSign : high ? faceSign : 0, jump: false, yaw: along, pitch: -0.15 };
    }

    // In the air: steer horizontal velocity toward the target line by
    // strafing perpendicular to our velocity (how real air strafing works).
    const vx = player.vel.x, vz = player.vel.z;
    const sp = Math.hypot(vx, vz);
    if (sp < 50) return { forward: 1, side: 0, jump: false, yaw: along, pitch: -0.15 };
    const vlat = vx * rx + vz * rz;
    const vfwd = vx * tx + vz * tz;
    const desiredLat = clamp(-(e - target) * 1.5, -0.5 * sp, 0.5 * sp);
    const want = Math.atan2(desiredLat, Math.max(vfwd, 100));
    const have = Math.atan2(vlat, Math.max(vfwd, 1));
    const err = want - have;
    if (Math.abs(err) < 0.01) return { forward: 0, side: 0, jump: false, yaw: along, pitch: -0.15 };
    // wishdir perpendicular to velocity, toward the side we want to turn to
    const s = err > 0 ? 1 : -1; // +1 => turn toward +right
    const ux = vx / sp, uz = vz / sp;
    // right-perpendicular of velocity in XZ, matching rx = -tz, rz = tx
    const wx = -uz * s, wz = ux * s;
    // choose yaw so that the "right" vector equals the wish direction, press D
    const yaw = Math.atan2(-wz, wx);
    return { forward: 0, side: 1, jump: false, yaw, pitch: -0.15, lookYaw: along };
  }
}

function projT(pos, a, b, clampIt = true) {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const l2 = dx * dx + dz * dz || 1;
  const t = ((pos.x - a[0]) * dx + (pos.z - a[2]) * dz) / l2;
  return clampIt ? clamp(t, 0, 1) : t;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
