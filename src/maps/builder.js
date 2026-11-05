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
      stages: [],
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
    this.map.brushes.push({ points: pts, kind: opts.kind || 'floor', color: opts.color || COLORS.cyan });
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
    const w = o.width ?? 220;
    const h = o.height ?? 300;
    const sides = o.sides || 'both';
    const color = o.color || COLORS.magenta;
    const sections = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      const rx = -tz, rz = tx; // right vector (Y up)
      const p = path[i];
      const ridge = [p[0], p[1], p[2]];
      const below = [p[0], p[1] - h, p[2]];
      const right = [p[0] + rx * w, p[1] - h, p[2] + rz * w];
      const left = [p[0] - rx * w, p[1] - h, p[2] - rz * w];
      if (sides === 'both') sections.push([ridge, left, right]);
      else if (sides === 'left') sections.push([ridge, left, below]);
      else sections.push([ridge, right, below]);
    }
    for (let i = 0; i < sections.length - 1; i++) {
      this.map.brushes.push({ points: [...sections[i], ...sections[i + 1]], kind: 'surf', color });
    }
    return this;
  }

  trigger(type, min, max, data = {}) {
    this.map.triggers.push({ type, min, max, ...data });
    return this;
  }
  startZone(min, max) { return this.trigger('start', min, max); }
  endZone(min, max) { return this.trigger('end', min, max); }
  /** A stage: entering its zone makes it the respawn point. */
  stage(spawnPos, yawDeg, zoneMin, zoneMax) {
    const index = this.map.stages.length;
    this.map.stages.push({ pos: spawnPos, yaw: (yawDeg * Math.PI) / 180 });
    if (zoneMin) this.trigger('stage', zoneMin, zoneMax, { stage: index });
    return this;
  }
  /** Touching this sends you back to the current stage spawn. */
  resetZone(min, max) { return this.trigger('reset', min, max); }
  hint(min, max, text) { return this.trigger('hint', min, max, { text }); }

  build() { return this.map; }
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

// ---------------------------------------------------------------------------
// Course: author a stage as a sequence of moves (straight, curve, wave, gap).
//
// Heading is in degrees, using the same convention as player yaw:
// 0 = looking down -Z, 90 = looking down -X (positive = turn left).
// ---------------------------------------------------------------------------

const D2R = Math.PI / 180;
export const fwdOf = (h) => [-Math.sin(h * D2R), -Math.cos(h * D2R)];
export const rightOf = (h) => [Math.cos(h * D2R), -Math.sin(h * D2R)];

export class Course {
  /**
   * @param {(path:number[][], opts:object)=>void} sink receives finished ramps
   * @param {object} opts default ramp options { width, height, color, sides, face }
   *   face: which slope the intended line uses ('left'|'right'), used by the bot.
   */
  constructor(sink, opts = {}) {
    this.sink = sink;
    this.opts = { width: 240, height: 360, color: COLORS.magenta, sides: 'both', face: 'left', ...opts };
    this.p = [0, 0, 0];
    this.h = 0;
    this.path = [];
    this.line = []; // guide polyline for bots/progress: {p:[x,y,z], h, gap, face, width}
    this.minY = Infinity;
    this.slope = 0.2; // drop per unit length of the last ramp move
  }

  set(opts) { this._flush(); Object.assign(this.opts, opts); this._begin(); return this; }

  at(p, h) { this._flush(); this.p = [...p]; this.h = h; this._begin(); return this; }

  _begin() { this.path = [[...this.p]]; this._mark(false); }

  _mark(gap) {
    this.line.push({ p: [...this.p], h: this.h, gap, face: this.opts.face, width: this.opts.width });
    this.minY = Math.min(this.minY, this.p[1] - this.opts.height);
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

  /** angle > 0 turns right, < 0 turns left. */
  curve(angle, radius, drop, steps = Math.max(4, Math.round(Math.abs(angle) / 7.5))) {
    const sgn = Math.sign(angle);
    const [rx, rz] = rightOf(this.h);
    const c = [this.p[0] + sgn * rx * radius, this.p[2] + sgn * rz * radius];
    const h0 = this.h, y0 = this.p[1];
    this.slope = drop / (Math.abs(angle) * D2R * radius);
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

  /**
   * Air gap: ends the current ramp, the next move starts a new one.
   * The drop is computed so that even a slow player (opts.minSpeed) clears
   * the start of the next ramp: it follows the previous slope plus the
   * gravity arc for the time spent in the air.
   * @param {number} length horizontal gap
   * @param {number} [shift] sideways offset of the next ramp (+ = right)
   * @param {object} [opts] ramp option overrides; opts.drop forces a drop
   */
  gap(length, shift = 0, opts = {}) {
    this._flush();
    const { drop: forced, ...rampOpts } = opts;
    Object.assign(this.opts, rampOpts);
    const vmin = this.opts.minSpeed ?? 800;
    const air = Math.hypot(length, shift) / vmin;
    const drop = forced ?? (this.slope * length + 0.5 * 800 * air * air + 80);
    const [fx, fz] = fwdOf(this.h);
    const [rx, rz] = rightOf(this.h);
    this.p = [this.p[0] + fx * length + rx * shift, this.p[1] - drop, this.p[2] + fz * length + rz * shift];
    this.line.push({ p: [...this.p], h: this.h, gap: true, face: this.opts.face, width: this.opts.width });
    this.path = [[...this.p]];
    this.minY = Math.min(this.minY, this.p[1] - this.opts.height);
    return this;
  }

  /** Finish the ramp; returns a point ahead of the end (for gates). */
  end(ahead = 600) {
    this._flush();
    const [fx, fz] = fwdOf(this.h);
    return [this.p[0] + fx * ahead, this.p[1], this.p[2] + fz * ahead];
  }
}

/**
 * Add a staged course to a MapBuilder.
 * @param {MapBuilder} b
 * @param {object} cfg { origin:[x,y,z], heading, hint, ramp: opts, build:(course)=>void, last:boolean }
 */
export function addStage(b, cfg) {
  const m = b.map;
  const index = m.stages.length;
  const h = cfg.heading ?? 0;
  const o = cfg.origin;
  const ramp = { width: 240, height: 360, color: COLORS.magenta, sides: 'both', face: 'left', ...(cfg.ramp || {}) };
  const [fx, fz] = fwdOf(h);
  const [rx, rz] = rightOf(h);

  // Spawn platform. The ramp ridge begins just past its front edge and offset
  // to the side, so walking straight forward drops you onto the intended face.
  const faceSign = ramp.face === 'left' ? 1 : -1; // ridge is to the right of the platform for a left face
  const plat = 420;
  const latOff = faceSign * ramp.width * 0.5;
  const platColor = cfg.platformColor || COLORS.cyan;
  // platform as rotated box (8 points)
  const pts = [];
  for (const a of [-1, 1]) for (const c of [-1, 1]) for (const yy of [0, -48]) {
    pts.push([o[0] + fx * a * plat / 2 + rx * c * plat / 2, o[1] + yy, o[2] + fz * a * plat / 2 + rz * c * plat / 2]);
  }
  m.brushes.push({ points: pts, kind: 'floor', color: platColor });

  const spawn = [o[0], o[1] + 40, o[2]];
  const course = new Course((path, opts) => b.ramp(path, opts), ramp);
  const ahead = plat / 2 - 100;
  const start = [o[0] + fx * ahead + rx * latOff, o[1] - 80, o[2] + fz * ahead + rz * latOff];
  course.at(start, h);
  cfg.build(course);
  const g = course.end(cfg.gateAhead ?? 700);
  const resetY = course.minY - 1200;

  m.stages.push({ pos: spawn, yaw: h * D2R, resetY, hint: cfg.hint || null, line: course.line, heading: h });
  if (index === 0) {
    m.spawn = { pos: spawn, yaw: h * D2R };
    b.startZone([o[0] - plat / 2 - 60, o[1] - 10, o[2] - plat / 2 - 60], [o[0] + plat / 2 + 60, o[1] + 200, o[2] + plat / 2 + 60]);
  }
  const gy = g[1] - 500;
  const gs = cfg.gateSize ?? 1100;
  const trig = { min: [g[0] - gs, gy - gs, g[2] - gs], max: [g[0] + gs, gy + gs, g[2] + gs], heading: course.h, center: [g[0], gy, g[2]] };
  if (cfg.last) b.trigger('end', trig.min, trig.max, { heading: trig.heading, center: trig.center, stage: index });
  else b.trigger('teleport', trig.min, trig.max, { target: index + 1, heading: trig.heading, center: trig.center, stage: index });
  m.killY = Math.min(m.killY, resetY - 2000);
  return course;
}
