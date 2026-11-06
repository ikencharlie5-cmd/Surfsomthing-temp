// Helpers to author surf maps in code.
//
// A ramp is a triangular prism swept along a "ridge" path. Each pair of path
// points becomes one convex brush; neighbouring brushes share their cross
// section exactly, so there are no gaps to snag on.

export const COLORS = {
  cyan: [0.0, 0.95, 1.0],
  magenta: [1.0, 0.15, 0.75],
  purple: [0.6, 0.25, 1.0],
  orange: [1.0, 0.5, 0.1],
  yellow: [1.0, 0.9, 0.2],
  green: [0.2, 1.0, 0.55],
  red: [1.0, 0.2, 0.25],
  blue: [0.2, 0.45, 1.0],
  white: [0.9, 0.9, 1.0],
};

export class MapBuilder {
  constructor(id, name, opts = {}) {
    this.map = {
      id,
      name,
      difficulty: opts.difficulty || 'easy',
      description: opts.description || '',
      palette: opts.palette || null,
      spawn: { pos: [0, 100, 0], yaw: 0 },
      brushes: [],
      triggers: [],
      checkpoints: [],
      line: [],
      ribs: [],
      env: opts.env || null,
      cvars: opts.cvars || null, // physics overrides, e.g. { gravity: 620 }
      unlock: opts.unlock || null, // { after: [mapIds] } must all be finished
      decor: [],
      theme: opts.theme || null, // procedural scenery: { type: 'beach'|'canyon'|'cave', ... }
      killY: opts.killY ?? -5000,
    };
  }

  spawn(pos, yawDeg = 0) {
    this.map.spawn = { pos, yaw: (yawDeg * Math.PI) / 180 };
    return this;
  }

  /** Axis-aligned box brush given centre and full size. */
  box(center, size, opts = {}) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size.map((s) => s / 2);
    const pts = [];
    for (const dx of [-sx, sx]) for (const dy of [-sy, sy]) for (const dz of [-sz, sz]) pts.push([cx + dx, cy + dy, cz + dz]);
    this.map.brushes.push({ points: pts, kind: opts.kind || 'floor', color: opts.color || COLORS.cyan, edge: opts.edge });
    return this;
  }

  /** Flat platform whose *top surface* is at center[1]. */
  platform(center, size, opts = {}) {
    const th = size[1] ?? 32;
    return this.box([center[0], center[1] - th / 2, center[2]], [size[0], th, size[2]], opts);
  }

  /** Raw convex brush from points. */
  brush(points, opts = {}) {
    this.map.brushes.push({ points, kind: opts.kind || 'surf', color: opts.color || COLORS.magenta });
    return this;
  }

  /**
   * Sweep a surf ramp along a ridge path.
   * @param {number[][]} path ridge points [x,y,z]
   * @param {object} o width: horizontal half-width of each slope, height: vertical drop of slope,
   *   sides: 'both'|'left'|'right' (left/right relative to path direction), color
   */
  ramp(path, o = {}) {
    const color = o.color || COLORS.magenta;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      const dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
      this.map.brushes.push({ points: rampSegmentPoints(path, i, o), kind: 'surf', color, dir });
    }
    return this;
  }

  trigger(type, min, max, data = {}) {
    this.map.triggers.push({ type, min, max, ...data });
    return this;
  }
  startZone(min, max) { return this.trigger('start', min, max); }
  endZone(min, max) { return this.trigger('end', min, max); }

  build() { return this.map; }
}

/**
 * The 6 corner points of ramp segment i (from path[i] to path[i+1]).
 * One triangular cross-section per path point (oriented by the averaged
 * tangent), shared by neighbouring segments so the surface is continuous.
 */
export function rampSegmentPoints(path, i, o = {}) {
  const w = o.width ?? 220;
  const h = o.height ?? 300;
  const sides = o.sides || 'both';
  const sec = (j) => {
    const a = path[Math.max(0, j - 1)], b = path[Math.min(path.length - 1, j + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const rx = -tz, rz = tx;
    const p = path[j];
    const ridge = [p[0], p[1], p[2]];
    const below = [p[0], p[1] - h, p[2]];
    const right = [p[0] + rx * w, p[1] - h, p[2] + rz * w];
    const left = [p[0] - rx * w, p[1] - h, p[2] - rz * w];
    return sides === 'both' ? [ridge, left, right] : sides === 'left' ? [ridge, left, below] : [ridge, right, below];
  };
  return [...sec(i), ...sec(i + 1)];
}

/** Straight line from a to b split into n segments. */
export function line(a, b, n = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/**
 * Horizontal circular arc with linear height change.
 * Angles in degrees, measured in the XZ plane (0 = +X, 90 = +Z).
 */
export function arc(cx, cz, radius, fromDeg, toDeg, y0, y1, steps = 12) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ((fromDeg + (toDeg - fromDeg) * t) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * radius, y0 + (y1 - y0) * t, cz + Math.sin(a) * radius]);
  }
  return out;
}

/** Smooth S-curve / wave path: lateral sine offset along a straight line. */
export function wave(a, b, amplitude, waves = 1, steps = 16) {
  const out = [];
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const l = Math.hypot(dx, dz) || 1;
  const rx = -dz / l, rz = dx / l;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * Math.PI * 2 * waves) * amplitude;
    out.push([a[0] + dx * t + rx * off, a[1] + (b[1] - a[1]) * t, a[2] + dz * t + rz * off]);
  }
  return out;
}

const D2R = Math.PI / 180;
export const fwdOf = (h) => [-Math.sin(h * D2R), -Math.cos(h * D2R)];
export const rightOf = (h) => [Math.cos(h * D2R), -Math.sin(h * D2R)];

// ---------------------------------------------------------------------------
// Course: author a continuous surf line as a chain of moves.
//
// Heading is in degrees, using the same convention as player yaw:
// 0 = looking down -Z, 90 = looking down -X (positive = turn left).
//
// Ramp options: width/height (of each slope), color, sides, face (which slope
// the intended line uses, 'left'|'right'), minSpeed (slowest expected rider,
// used for automatic gap drops), tunnel (enclosure: { side, top, bottom,
// ceiling, color }).
// ---------------------------------------------------------------------------

export class Course {
  /**
   * @param {(path:number[][], opts:object)=>void} sink receives finished ramps
   * @param {object} opts default ramp options
   */
  constructor(sink, opts = {}) {
    this.sink = sink;
    this.opts = { width: 240, height: 360, color: COLORS.magenta, sides: 'both', face: 'left', tunnel: null, ...opts };
    this.p = [0, 0, 0];
    this.h = 0;
    this.path = [];
    /** guide polyline: {p, h, gap, face, width, height, tunnel} */
    this.line = [];
    this.checkpoints = []; // { idx, hint }
    this.forks = []; // { from, to, speed }
    this.extra = []; // extra brushes (needle walls, obstacles)
    this.needles = [];
    this.jumps = [];
    this.obstacles = []; // duck/dodge blocks on the ramp face
    this.structures = []; // enclosed set pieces the course passes through
    this.boosts = []; // speed rings
    this.kickers = [];
    this.curves = []; // every curve's centre (set pieces are built around them)
    this.minY = Infinity;
    this.slope = 0.2; // drop per unit length of the last ramp move
  }

  set(opts) { this._flush(); Object.assign(this.opts, opts); this._begin(); return this; }

  at(p, h) { this._flush(); this.p = [...p]; this.h = h; this._begin(); return this; }

  _begin() { this.path = [[...this.p]]; this._mark(false); }

  _mark(gap) {
    const o = this.opts;
    this.line.push({ p: [...this.p], h: this.h, gap, face: o.face, width: o.width, height: o.height, tunnel: o.tunnel ? { ...o.tunnel } : null, color: o.color, offset: o.rideOffset ?? null });
    this.minY = Math.min(this.minY, this.p[1] - o.height);
  }

  _push() {
    this.path.push([...this.p]);
    this._mark(false);
  }

  _flush() {
    if (this.path.length >= 2) this.sink(this.path, { ...this.opts });
    this.path = [];
  }

  straight(length, drop, steps = Math.max(1, Math.round(length / 1500))) {
    this.slope = drop / length;
    const [fx, fz] = fwdOf(this.h);
    const s = [...this.p];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.p = [s[0] + fx * length * t, s[1] - drop * t, s[2] + fz * length * t];
      this._push();
    }
    return this;
  }

  /**
   * Drop-in: a straight ramp whose ridge starts steep and flattens out
   * (like a ski-jump in-run), so you start the map with speed.
   * Profile: y = drop * (1 - (1 - t)^3), starting slope 3*drop/length.
   */
  dropIn(length, drop, steps = 14) {
    const [fx, fz] = fwdOf(this.h);
    const s = [...this.p];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const k = 1 - (1 - t) ** 3;
      this.p = [s[0] + fx * length * t, s[1] - drop * k, s[2] + fz * length * t];
      this._push();
    }
    this.slope = 0.05;
    return this;
  }

  /** angle > 0 turns right, < 0 turns left. */
  curve(angle, radius, drop, steps = Math.max(4, Math.round(Math.abs(angle) / 7.5), Math.round((Math.abs(angle) * D2R * radius) / 700))) {
    const sgn = Math.sign(angle);
    const [rx, rz] = rightOf(this.h);
    const c = [this.p[0] + sgn * rx * radius, this.p[2] + sgn * rz * radius];
    const h0 = this.h, y0 = this.p[1];
    this.slope = drop / (Math.abs(angle) * D2R * radius);
    this.curves.push({ center: [c[0], c[1]], radius, angle, y0, y1: y0 - drop, from: this.line.length - 1, to: this.line.length - 1 + steps });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const h = h0 - angle * t;
      const [qx, qz] = rightOf(h);
      this.p = [c[0] - sgn * qx * radius, y0 - drop * t, c[1] - sgn * qz * radius];
      this.h = h;
      this._push();
    }
    return this;
  }

  /** Straight run with the ridge weaving side to side. */
  wave(length, drop, amplitude, waves = 1, steps = Math.max(8, waves * 10)) {
    this.slope = drop / length;
    const [fx, fz] = fwdOf(this.h);
    const [rx, rz] = rightOf(this.h);
    const s = [...this.p];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const off = Math.sin(t * Math.PI * 2 * waves) * amplitude;
      this.p = [s[0] + fx * length * t + rx * off, s[1] - drop * t, s[2] + fz * length * t + rz * off];
      this._push();
    }
    return this;
  }

  /** Automatic drop for a gap so the slowest expected rider clears it. */
  autoDrop(length, shift = 0, slope = this.slope, vmin = this.opts.minSpeed ?? 800) {
    const air = Math.hypot(length, shift) / vmin;
    return slope * length + 0.5 * 800 * air * air + 80;
  }

  /**
   * Air gap: ends the current ramp, the next move starts a new one.
   * @param {number} length horizontal gap
   * @param {number} [shift] sideways offset of the next ramp (+ = right)
   * @param {object} [opts] ramp option overrides; opts.drop forces a drop,
   *   opts.vmin sets the slowest expected rider for this gap only
   */
  gap(length, shift = 0, opts = {}) {
    this._flush();
    const { drop: forced, vmin, needle, boost, ...rampOpts } = opts;
    const faceBefore = this.opts.face;
    const drop = forced ?? this.autoDrop(length, shift, this.slope, vmin);
    Object.assign(this.opts, rampOpts);
    const [fx, fz] = fwdOf(this.h);
    const [rx, rz] = rightOf(this.h);
    const A = [...this.p];
    this.p = [this.p[0] + fx * length + rx * shift, this.p[1] - drop, this.p[2] + fz * length + rz * shift];
    this._mark(true);
    this.path = [[...this.p]];
    if (needle) for (const nd of Array.isArray(needle) ? needle : [needle]) this._needle(A, [...this.p], nd, faceBefore);
    if (boost) this._boost(A, [...this.p], boost);
    return this;
  }

  /** Speed ring hanging in a gap where the intended line passes. */
  _boost(A, B, o) {
    const t = o.at ?? 0.45;
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const l = Math.hypot(dx, dz) || 1;
    const rx = -dz / l, rz = dx / l;
    const faceSign = this.opts.face === 'right' ? 1 : -1;
    const lat = faceSign * this.opts.width * 0.45;
    const y = A[1] + (B[1] - A[1]) * t - this.opts.height * 0.45;
    this.boosts.push({
      center: [A[0] + dx * t + rx * lat, y, A[2] + dz * t + rz * lat], radius: o.radius ?? 520, height: o.height ?? 900,
      mult: o.mult ?? 1.18, heading: Math.atan2(-dx / l, -dz / l) * 180 / Math.PI, color: o.color || [0.3, 1.0, 1.0],
    });
  }

  /**
   * Duck and dodge: a straight run with blocks sticking out of the ramp
   * face. 'duck' blocks cover the top of the face (ride low); 'dodge' blocks
   * cover the bottom (ride high). The guide line carries the band to ride
   * in, so the bot (and a smart rider) lines up early.
   */
  dodgeRun(pattern, opts = {}) {
    const approach = opts.approach ?? 1400, zone = opts.zone ?? 420, spacing = opts.spacing ?? 2000;
    const L = approach + pattern.length * spacing + 600;
    const slope = opts.slope ?? 0.14;
    const [fx, fz] = fwdOf(this.h);
    const [rx, rz] = rightOf(this.h);
    const w = this.opts.width, h = this.opts.height;
    const fs = this.opts.face === 'right' ? 1 : -1;
    const S = [...this.p];
    const R = (s) => [S[0] + fx * s, S[1] - slope * s, S[2] + fz * s];
    const baseVec = [rx * fs * w, -h, rz * fs * w];
    const len3 = Math.hypot(1, slope);
    const along = [fx / len3, -slope / len3, fz / len3];
    let n = [along[1] * baseVec[2] - along[2] * baseVec[1], along[2] * baseVec[0] - along[0] * baseVec[2], along[0] * baseVec[1] - along[1] * baseVec[0]];
    const nl = Math.hypot(...n) || 1;
    n = n.map((x) => x / nl);
    if (n[1] < 0) n = n.map((x) => -x);
    const T = opts.thick ?? 230;
    const color = opts.color || [0.9, 0.5, 0.2];
    const goTo = (s, off) => {
      this.opts.rideOffset = off;
      this.p = R(s);
      this.slope = slope;
      this._push();
    };
    let s = 0;
    pattern.forEach((type, k) => {
      const a = approach + k * spacing;
      const off = type === 'duck' ? 0.72 : 0.28;
      const [f0, f1] = type === 'duck' ? [0, 0.4] : [0.6, 1.0];
      if (a - approach * 0.85 > s + 50) goTo(a - approach * 0.85, null);
      goTo(a, off);
      goTo(a + zone, off);
      s = a + zone;
      const pts = [];
      for (const ss of [a, a + zone]) for (const f of [f0, f1]) {
        const r = R(ss);
        const p = [r[0] + baseVec[0] * f, r[1] + baseVec[1] * f, r[2] + baseVec[2] * f];
        pts.push(p, [p[0] + n[0] * T, p[1] + n[1] * T, p[2] + n[2] * T]);
      }
      // bright block: duck = magenta (go under), dodge = amber (go over)
      const bc = type === 'duck' ? [1.0, 0.25, 0.75] : [1.0, 0.7, 0.15];
      this.extra.push({ points: pts, kind: 'floor', color: bc, edge: 2.2, obstacle: type });
      const mid = R(a + zone / 2);
      const fm = (f0 + f1) / 2;
      this.obstacles.push({ type, center: [mid[0] + baseVec[0] * fm + n[0] * T / 2, mid[1] + baseVec[1] * fm + n[1] * T / 2, mid[2] + baseVec[2] * fm + n[2] * T / 2], heading: this.h });
    });
    this.opts.rideOffset = null;
    goTo(L, null);
    return this;
  }

  /**
   * Pass through an enclosed structure (temple, hall, hangar...): solid,
   * visible walls and ceiling close around the ramp, with duck/dodge blocks
   * inside. Scenery decorates it by `kind`.
   */
  structure(kind, pattern, opts = {}) {
    const prev = this.opts.tunnel;
    const t = { side: opts.side ?? 300, top: opts.top ?? 560, bottom: opts.bottom ?? 520, ceiling: true, hidden: false, color: opts.wallColor || [0.5, 0.45, 0.35], ribColor: opts.ribColor || [1.0, 0.6, 0.25], ribSpacing: 700, structure: kind };
    if (prev && prev.interior) Object.assign(t, { side: prev.side, top: prev.top, bottom: prev.bottom, color: prev.color, interior: prev.interior, wallKind: prev.wallKind });
    this.opts.tunnel = t;
    if (this.line.length) this.line[this.line.length - 1].tunnel = { ...t };
    const from = this.line.length - 1;
    this.dodgeRun(pattern, { color: opts.blockColor || [0.55, 0.5, 0.4], edge: opts.edge ?? 1.0, slope: opts.slope, spacing: opts.spacing, approach: opts.approach });
    this.opts.tunnel = prev;
    this.line[this.line.length - 1].tunnel = prev ? { ...prev } : null;
    this.structures.push({ kind, from, to: this.line.length - 1 });
    return this;
  }

  /**
   * "Thread the needle": a solid wall across the middle of the gap from A to
   * B with one narrow vertical slot. The slot is centred where a rider
   * holding the intended line passes (the same lateral offset the bot
   * targets), so missing it means slamming into the wall.
   * needle: { size (slot width), color, kind, at (0..1 along the gap), top, bottom }
   */
  _needle(A, B, o, faceBefore = this.opts.face) {
    const t = o.at ?? 0.5;
    const c = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l, rx = -fz, rz = fx;
    const w = this.opts.width, h = this.opts.height;
    // where a clean rider flies: on the old face at the start of the gap,
    // the new face at the end (side switches cross over mid-air)
    const sA = faceBefore === 'right' ? 1 : -1, sB = this.opts.face === 'right' ? 1 : -1;
    const slot = (sA * (1 - t) + sB * t) * w * 0.45;
    const half = (o.size ?? 200) / 2;
    const reach = w + (o.reach ?? 1600);
    const yTop = Math.max(A[1], B[1]) + (o.top ?? 1100);
    const yBot = Math.min(A[1], B[1]) - h - (o.bottom ?? 1700);
    const thick = 60;
    const slab = (l0, l1, y0, y1) => {
      const pts = [];
      for (const a of [-thick, thick]) for (const lat of [l0, l1]) for (const y of [y0, y1]) {
        pts.push([c[0] + fx * a + rx * lat, y, c[2] + fz * a + rz * lat]);
      }
      return pts;
    };
    const color = o.color || [0.9, 0.9, 1.0];
    // castle gates are drawn by the castle scenery instead
    const meta = { kind: o.kind || 'wall', color, edge: o.edge ?? 1.2, needle: true, hidden: !!o.castle };
    const parts = [
      { l0: -reach, l1: slot - half, lintel: false },
      { l0: slot + half, l1: reach, lintel: false },
      ...(o.lintel ? [{ l0: slot - half, l1: slot + half, lintel: true }] : []),
    ];
    const brushes = parts.map((q) => {
      const br = { points: slab(q.l0, q.l1, q.lintel ? c[1] + o.lintel : yBot, yTop), ...meta };
      this.extra.push(br);
      return br;
    });
    this.needles.push({
      brushes, parts, slab,
      center: [c[0] + rx * slot, c[1], c[2] + rz * slot], size: o.size ?? 200, heading: Math.atan2(-fx, -fz) * 180 / Math.PI,
      gapIdx: this.line.length - 1, gapCenter: c, slotLat: slot, reach, yTop, yBot, right: [rx, 0, rz], fwd: [fx, 0, fz], lintel: o.lintel ?? null,
    });
  }

  /**
   * Kicker: the drop-in flipped. The ridge flattens then curls UP into a
   * lip, launching you into the air for a real jump. The landing ramp
   * starts `gapLen` past the lip, below it, and is long enough to catch
   * both slow and fast riders. Optional `needles` (array) are walls with
   * slots inside the jump: two of them makes a double needle.
   */
  kicker({ length = 2600, rise = 420, gapLen = 2600, landDrop = 650, landLen = 5500, landSlope = 0.2, needles = null, ramp = {} } = {}) {
    const [fx, fz] = fwdOf(this.h);
    const s = [...this.p];
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.p = [s[0] + fx * length * t, s[1] + rise * t * t * t, s[2] + fz * length * t];
      this._push();
    }
    this.slope = -3 * rise / length; // leaving the lip going up
    const lipIdx = this.line.length - 1;
    this.gap(gapLen, 0, { ...ramp, drop: landDrop, needle: needles });
    const ls = landSlope;
    this.straight(landLen, landLen * ls, Math.max(3, Math.round(landLen / 1500)));
    this.kickers.push({ lipIdx, gapIdx: lipIdx + 1, gapLen });
    return this;
  }

  /**
   * "Jump far": a steep launch ramp, then a long gap only riders carrying
   * `speed` can clear (slower riders fall short of the far ramp).
   */
  longJump(length, speed, opts = {}) {
    const launch = opts.launch ?? 2400;
    this.straight(launch, launch * (opts.launchSlope ?? 0.36));
    this.gap(length, 0, { ...opts.ramp, vmin: speed });
    this.jumps.push({ gapIdx: this.line.length - 1, length, speed });
    return this;
  }

  /** Mark a checkpoint at the start of the current ramp (call right after gap()). */
  checkpoint(hint = null) {
    if (this.path.length !== 1) throw new Error('checkpoint() must be called at the start of a ramp');
    this.checkpoints.push({ idx: this.line.length - 1, hint });
    return this;
  }

  /**
   * Speed-sensitive split. Straight ahead, a long gap that only a rider
   * carrying `speed` can clear lands directly on the next ramp. Off to the
   * side, a safe detour ramp leads to the same place for slower riders.
   * Call at the end of a ramp. Enclosures are switched off for the fork.
   */
  fork({ length = 4200, speed = 2000, shift = -650, gapIn = 1000, gapOut = 900, color } = {}) {
    this._flush();
    const tunnel = this.opts.tunnel;
    this.opts.tunnel = null;
    if (this.line.length) this.line[this.line.length - 1].tunnel = null;
    const from = this.line.length - 1;
    const air = length / speed;
    let dropFast = this.slope * length + 0.5 * 800 * air * air + 80;
    const g1 = this.autoDrop(gapIn, shift);
    const L = length - gapIn - gapOut;
    const vmin = this.opts.minSpeed ?? 800;
    const K = 0.5 * 800 * (Math.hypot(gapOut, shift) / vmin) ** 2 + 80;
    // detour slope s solves: g1 + s*L + (s*gapOut + K) = dropFast
    let sl = (dropFast - g1 - K) / (L + gapOut);
    if (sl < 0.1) { sl = 0.1; dropFast = g1 + sl * (L + gapOut) + K; }
    const mainColor = this.opts.color;
    this.gap(gapIn, shift, color ? { color } : {});
    this.straight(L, sl * L);
    this.gap(gapOut, -shift, { drop: sl * gapOut + K, color: mainColor, tunnel });
    this.forks.push({ from, to: this.line.length - 1, speed });
    return this;
  }

  /** Finish the ramp; returns a point ahead of the end (for the finish gate). */
  end(ahead = 600) {
    this._flush();
    const [fx, fz] = fwdOf(this.h);
    return [this.p[0] + fx * ahead, this.p[1], this.p[2] + fz * ahead];
  }
}

/** Where to respawn (standing still) for a checkpoint at line index idx. */
function checkpointSpawn(line, idx) {
  const e = line[idx];
  const n = line[Math.min(idx + 1, line.length - 1)];
  const dx = n.p[0] - e.p[0], dz = n.p[2] - e.p[2];
  const d = Math.hypot(dx, dz) || 1;
  const along = Math.min(350, d * 0.3);
  const t = along / d;
  const ridgeY = e.p[1] + (n.p[1] - e.p[1]) * t;
  const h = Math.atan2(-dx, -dz);
  const rx = -dz / d, rz = dx / d;
  const lat = (e.face === 'right' ? 1 : -1) * e.width * 0.42;
  const faceY = ridgeY - (Math.abs(lat) / e.width) * e.height;
  return {
    pos: [e.p[0] + dx * t + rx * lat, faceY + 36 + 70, e.p[2] + dz * t + rz * lat],
    yaw: h,
  };
}

/** Build tunnel/canyon walls, ceilings and glowing ribs along the guide line. */
function addEnclosure(m, line) {
  const sec = (e, t) => {
    const [rx, rz] = rightOf(e.h);
    const L = e.width + t.side;
    const yb = e.p[1] - e.height - (t.bottom ?? 700);
    const yt = e.p[1] + (t.top ?? 750);
    return { rx, rz, L, yb, yt, p: e.p };
  };
  const pt = (s, lat, y) => [s.p[0] + s.rx * lat, y, s.p[2] + s.rz * lat];
  const thick = 60;
  const look = (t) => ({ kind: t.interior ? (t.wallKind || 'stone') : 'wall', color: t.color || COLORS.purple, edge: t.interior ? 0.15 : 0.45, hidden: !!t.hidden });
  /** A solid block in the plane of section s: lat l0..l1, height y0..y1. */
  const plate = (s, l0, l1, y0, y1, meta) => {
    const [fx, fz] = fwdOf(s.h);
    const pts = [];
    for (const d of [-thick, thick]) for (const l of [l0, l1]) for (const y of [y0, y1]) pts.push([s.p[0] + s.rx * l + fx * d, y, s.p[2] + s.rz * l + fz * d]);
    m.brushes.push({ points: pts, ...meta });
  };
  const secH = (e, t) => ({ ...sec(e, t), h: e.h });
  // interior spaces are closed boxes: no holes anywhere
  for (let i = 0; i < line.length; i++) {
    const t0 = i > 0 ? line[i - 1].tunnel : null, t1 = i < line.length - 1 ? line[i].tunnel : null;
    if (i === 0 && t1 && t1.interior) {
      // back wall behind the spawn platform, joined to the side walls
      const [fx, fz] = fwdOf(line[0].h);
      const e0 = { ...line[0], p: [line[0].p[0] - fx * 650, line[0].p[1], line[0].p[2] - fz * 650] };
      const a = sec(e0, t1), b = sec(line[0], t1);
      for (const side of [-1, 1]) {
        const pts = [];
        for (const s of [a, b]) for (const lat of [s.L, s.L + thick]) pts.push(pt(s, side * lat, s.yb), pt(s, side * lat, s.yt + thick));
        m.brushes.push({ points: pts, ...look(t1) });
      }
      const pts = [];
      for (const s of [a, b]) for (const lat of [-(a.L + thick), a.L + thick]) pts.push(pt(s, lat, s.yt), pt(s, lat, s.yt + thick));
      m.brushes.push({ points: pts, ...look(t1) });
      plate({ ...a, h: line[0].h }, -(a.L + thick), a.L + thick, a.yb, a.yt + thick, look(t1));
    }
    if (t0 && t1 && t0.interior && t1.interior && (t0.side !== t1.side || t0.top !== t1.top || t0.bottom !== t1.bottom)) {
      // where a narrow room opens into a bigger one, wall off the step between them
      const s0 = secH(line[i], t0), s1 = secH(line[i], t1);
      const big = s0.L >= s1.L ? s0 : s1, small = big === s0 ? s1 : s0;
      const bigT = big === s0 ? t0 : t1;
      const oL = big.L + thick, oB = Math.min(s0.yb, s1.yb), oT = Math.max(s0.yt, s1.yt) + thick;
      const iL = small.L, iB = Math.max(s0.yb, s1.yb), iT = Math.min(s0.yt, s1.yt);
      plate(big, -oL, -iL, oB, oT, look(bigT));
      plate(big, iL, oL, oB, oT, look(bigT));
      if (oT > iT) plate(big, -iL, iL, iT, oT, look(bigT));
      if (iB > oB) plate(big, -iL, iL, oB, iB, look(bigT));
    }
  }
  for (let i = 0; i < line.length - 1; i++) {
    const t = line[i].tunnel;
    if (!t) continue;
    const a = sec(line[i], t), b = sec(line[i + 1], t);
    const color = t.color || COLORS.purple;
    for (const side of [-1, 1]) {
      const pts = [];
      for (const s of [a, b]) {
        for (const lat of [s.L, s.L + thick]) {
          pts.push(pt(s, side * lat, s.yb), pt(s, side * lat, s.yt + (t.ceiling ? thick : 0)));
        }
      }
      m.brushes.push({ points: pts, kind: t.interior ? (t.wallKind || 'stone') : 'wall', color, edge: t.interior ? 0.15 : t.structure ? 0.7 : 0.45, hidden: !!t.hidden });
    }
    if (t.ceiling) {
      const pts = [];
      for (const s of [a, b]) {
        for (const lat of [-(s.L + thick), s.L + thick]) pts.push(pt(s, lat, s.yt), pt(s, lat, s.yt + thick));
      }
      m.brushes.push({ points: pts, kind: t.interior ? (t.wallKind || 'stone') : 'wall', color, edge: t.interior ? 0.15 : 0.45, hidden: !!t.hidden });
    }
    if (t.hidden || t.interior) continue; // themed scenery replaces ribs
    // ribs: glowing frames along the enclosure
    const len = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]);
    const n = Math.max(1, Math.round(len / (t.ribSpacing ?? 900)));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const lerp = (u, v) => u + (v - u) * f;
      const s = {
        p: [lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2])],
        rx: lerp(a.rx, b.rx), rz: lerp(a.rz, b.rz), L: lerp(a.L, b.L) - 4,
        yb: lerp(a.yb, b.yb), yt: lerp(a.yt, b.yt) - 4,
      };
      const ribH = t.ceiling ? null : s.yt;
      const lo = s.p[1] - line[i].height - 150;
      const segs = [
        ...pt(s, -s.L, lo), ...pt(s, -s.L, ribH ?? s.yt),
        ...pt(s, s.L, lo), ...pt(s, s.L, ribH ?? s.yt),
      ];
      if (t.ceiling) segs.push(...pt(s, -s.L, s.yt), ...pt(s, s.L, s.yt));
      m.ribs.push({ segs, color: t.ribColor || color });
    }
  }
}

/**
 * Make every needle wall a real structure: extend it down toward the ground
 * and up into the sky, stopping short of any other part of the course that
 * passes through its footprint. On themed maps the slab is hidden and the
 * scenery draws the wall in the theme's style.
 */
function groundNeedles(m, course) {
  const line = course.line;
  const floor = course.minY - 2500;
  for (const n of course.needles) {
    const { right: R, fwd: F, gapCenter: c, reach } = n;
    let bot = floor, top = n.yTop + 5000;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      if (i === n.gapIdx - 1 || i === n.gapIdx) continue; // the gap the needle sits in
      const steps = Math.max(1, Math.ceil(Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) / 250));
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const x = a.p[0] + (b.p[0] - a.p[0]) * u, y = a.p[1] + (b.p[1] - a.p[1]) * u, z = a.p[2] + (b.p[2] - a.p[2]) * u;
        const lat = (x - c[0]) * R[0] + (z - c[2]) * R[2];
        const fw = (x - c[0]) * F[0] + (z - c[2]) * F[2];
        if (Math.abs(fw) > a.width + 400 || Math.abs(lat) > reach + a.width + 400) continue;
        if (y < n.yBot) bot = Math.max(bot, y + 900);
        else if (y - a.height > n.yTop) top = Math.min(top, y - a.height - 900);
      }
    }
    n.yBot = Math.min(n.yBot, bot);
    n.yTop = Math.max(n.yTop, top);
    n.brushes.forEach((br, k) => {
      const q = n.parts[k];
      br.points = n.slab(q.l0, q.l1, q.lintel ? c[1] + n.lintel : n.yBot, n.yTop);
      if (m.theme) br.hidden = true;
    });
    delete n.slab;
  }
}

/**
 * Build a whole continuous map: start platform, the course, checkpoints,
 * enclosures and the finish gate.
 * @param {MapBuilder} b
 * @param {object} cfg { origin, heading, ramp, build:(course)=>void, startHint, platformColor }
 */
export function addCourse(b, cfg) {
  const m = b.map;
  const h = cfg.heading ?? 0;
  const o = cfg.origin ?? [0, 0, 0];
  const ramp = { width: 240, height: 360, color: COLORS.magenta, sides: 'both', face: 'left', ...(cfg.ramp || {}) };
  const [fx, fz] = fwdOf(h);
  const [rx, rz] = rightOf(h);

  // Spawn platform. The first ramp's ridge begins under its front edge and
  // offset to the side, so walking forward drops you onto the intended face.
  const faceSign = ramp.face === 'left' ? 1 : -1;
  const plat = 420;
  const latOff = faceSign * ramp.width * 0.5;
  const pts = [];
  for (const a of [-1, 1]) for (const c of [-1, 1]) for (const yy of [0, -48]) {
    pts.push([o[0] + fx * a * plat / 2 + rx * c * plat / 2, o[1] + yy, o[2] + fz * a * plat / 2 + rz * c * plat / 2]);
  }
  m.brushes.push({ points: pts, kind: 'floor', color: cfg.platformColor || COLORS.cyan });
  const spawn = [o[0], o[1] + 40, o[2]];
  m.spawn = { pos: spawn, yaw: h * D2R };
  b.startZone([o[0] - plat / 2 - 60, o[1] - 10, o[2] - plat / 2 - 60], [o[0] + plat / 2 + 60, o[1] + 200, o[2] + plat / 2 + 60]);

  const course = new Course((path, opts) => b.ramp(path, opts), ramp);
  const ahead = plat / 2 - 100;
  course.at([o[0] + fx * ahead + rx * latOff, o[1] - 80, o[2] + fz * ahead + rz * latOff], h);
  cfg.build(course);
  const g = course.end(cfg.gateAhead ?? 700);
  const line = course.line;

  m.line = line;
  m.forks = course.forks;
  m.needles = course.needles;
  m.jumps = course.jumps;
  m.obstacles = course.obstacles;
  m.structures = course.structures;
  m.boosts = course.boosts;
  m.kickers = course.kickers;
  m.brushes.push(...course.extra);
  groundNeedles(m, course);
  m.checkpoints = [
    { idx: 0, pos: spawn, yaw: h * D2R, hint: cfg.startHint || null, start: true },
    ...course.checkpoints.map((c) => ({ idx: c.idx, hint: c.hint, ...checkpointSpawn(line, c.idx) })),
  ];
  addEnclosure(m, line);

  // the finish ring hangs where a rider holding the line flies off the end
  const last = line[line.length - 1];
  const fsg = last.face === 'right' ? 1 : -1;
  const [grx, grz] = rightOf(course.h);
  const glat = fsg * last.width * 0.45;
  const gy = g[1] - last.height * 0.45 - 260;
  const gc = [g[0] + grx * glat, gy, g[2] + grz * glat];
  const gs = 900;
  b.trigger('end', [gc[0] - gs, gy - gs, gc[2] - gs], [gc[0] + gs, gy + gs, gc[2] + gs], { heading: course.h, center: gc, radius: cfg.gateRadius ?? 650 });
  m.killY = Math.min(m.killY, course.minY - 4000);
  return course;
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horizontal distance from (x,z) to the guide line, and the line height there. */
function nearLine(line, x, z) {
  let best = Infinity, y = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i].p, b = line[i + 1].p;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2));
    const d = Math.hypot(x - (a[0] + dx * t), z - (a[2] + dz * t));
    if (d < best) { best = d; y = a[1] + (b[1] - a[1]) * t; }
  }
  return { d: best, y };
}

/**
 * Neon city: towers on both sides of the course. They're solid (you can
 * crash into one if you fly way off line) but kept clear of the ride.
 */
export function addCity(m, { seed = 1, spacing = 1500, clear = 1700, streetY = null, grid = 0, fill = 12000, colors = [COLORS.cyan, COLORS.magenta, COLORS.yellow, COLORS.purple] } = {}) {
  const taken = new Set();
  const r = rng(seed);
  const line = m.line;
  if (grid && streetY != null) {
    // Fill every city block near the course. Blocks under or beside the
    // ride get low-rise buildings that stay below the ramps; everything
    // else gets towers. Some blocks are split into two lots.
    const xs = line.map((e) => e.p[0]), zs = line.map((e) => e.p[2]);
    const x0 = Math.floor((Math.min(...xs) - fill) / grid), x1 = Math.ceil((Math.max(...xs) + fill) / grid);
    const z0 = Math.floor((Math.min(...zs) - fill) / grid), z1 = Math.ceil((Math.max(...zs) + fill) / grid);
    const lot = grid - 650; // leave room for the roads
    for (let gx = x0; gx < x1; gx++) for (let gz = z0; gz < z1; gz++) {
      const bx = (gx + 0.5) * grid, bz = (gz + 0.5) * grid;
      if (nearLine(line, bx, bz).d > fill) continue;
      const lots = [];
      if (r() < 0.35) {
        const alongX = r() < 0.5;
        for (const s of [-1, 1]) {
          lots.push(alongX ? [bx + s * lot / 4, bz, lot / 2 - 120, lot * (0.6 + r() * 0.35)] : [bx, bz + s * lot / 4, lot * (0.6 + r() * 0.35), lot / 2 - 120]);
        }
      } else {
        lots.push([bx, bz, lot * (0.55 + r() * 0.4), lot * (0.55 + r() * 0.4)]);
      }
      for (const [cx, cz, sx, sz] of lots) {
        const n = nearLine(line, cx, cz);
        const lowCap = n.y - 400 - 900; // safely under the ramps
        let top;
        if (n.d < clear + Math.max(sx, sz) * 0.75) {
          if (lowCap - streetY < 500) continue;
          top = streetY + (lowCap - streetY) * (0.35 + r() * 0.65);
        } else {
          const far = Math.min(1, n.d / fill);
          top = r() < 0.5 ? n.y + 400 + r() * (2500 + 3500 * far) : Math.max(streetY + 600, n.y - 1200 + r() * 1800);
        }
        m.brushes.push({
          points: [[-1, -1], [-1, 1], [1, -1], [1, 1]].flatMap(([u, v]) => [[cx + u * sx / 2, streetY, cz + v * sz / 2], [cx + u * sx / 2, top, cz + v * sz / 2]]),
          kind: 'building', color: colors[Math.floor(r() * colors.length)], edge: 0.55,
        });
      }
    }
    return;
  }
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i].p, b = line[i + 1].p;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = (k + r()) / n;
      const px = a[0] + (b[0] - a[0]) * t, pz = a[2] + (b[2] - a[2]) * t, py = a[1] + (b[1] - a[1]) * t;
      const [rx, rz] = rightOf(line[i].h);
      for (const side of [-1, 1]) {
        if (r() < 0.25) continue;
        const lat = side * (clear + line[i].width + r() * 2600);
        let cx = px + rx * lat, cz = pz + rz * lat;
        let sx = 700 + r() * 900, sz = 700 + r() * 900;
        if (grid) {
          // snap onto the centre of a city block between the roads
          const gx = Math.floor(cx / grid), gz = Math.floor(cz / grid);
          const key = gx + ',' + gz;
          if (taken.has(key)) continue;
          taken.add(key);
          cx = (gx + 0.5) * grid; cz = (gz + 0.5) * grid;
          sx = Math.min(sx * 1.4, grid - 700); sz = Math.min(sz * 1.4, grid - 700);
        }
        // keep clear of every part of the course
        if (nearLine(line, cx, cz).d < clear + Math.max(sx, sz) * 0.75) continue;
        const top = py + (r() < 0.4 ? 1500 + r() * 3500 : -300 + r() * 1400);
        const bottom = streetY ?? py - 9000;
        m.brushes.push({
          points: [[-1, -1], [-1, 1], [1, -1], [1, 1]].flatMap(([u, v]) => [[cx + u * sx / 2, bottom, cz + v * sz / 2], [cx + u * sx / 2, top, cz + v * sz / 2]]),
          kind: 'building', color: colors[Math.floor(r() * colors.length)], edge: 0.55,
        });
      }
    }
  }
}

/** Glowing crystals growing from the walls of an enclosed section (decoration only). */
export function addCrystals(m, { seed = 7, every = 500, colors = [COLORS.cyan, [0.5, 0.8, 1.0], COLORS.purple] } = {}) {
  const r = rng(seed);
  (m.decor ??= []);
  const line = m.line;
  for (let i = 0; i < line.length - 1; i++) {
    const t0 = line[i].tunnel;
    if (!t0) continue;
    const a = line[i].p, b = line[i + 1].p;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / every));
    const [rx, rz] = rightOf(line[i].h);
    const L = line[i].width + t0.side;
    for (let k = 0; k < n; k++) {
      const t = (k + r()) / n;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const side = r() < 0.5 ? -1 : 1;
      const onCeiling = t0.ceiling && r() < 0.35;
      const s = 60 + r() * 140;
      const pos = onCeiling
        ? [p[0] + rx * (r() - 0.5) * L * 1.6, p[1] + (t0.top ?? 750) - s * 0.6, p[2] + rz * (r() - 0.5) * L * 1.6]
        : [p[0] + rx * side * (L - s * 0.4), p[1] - line[i].height * (0.3 + r() * 0.9), p[2] + rz * side * (L - s * 0.4)];
      m.decor.push({
        pos, scale: [s * 0.45, s * (1.4 + r() * 1.5), s * 0.45],
        rot: [onCeiling ? Math.PI : (r() - 0.5) * 0.8, r() * Math.PI, side * (0.4 + r() * 0.5) * (onCeiling ? 0 : 1)],
        color: colors[Math.floor(r() * colors.length)],
      });
    }
  }
}
