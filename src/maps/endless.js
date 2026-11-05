// Endless mode: a seeded, procedurally generated surf course that streams in
// piece by piece and gets harder the further you go.
import { Course, COLORS, fwdOf, rightOf } from './builder.js';

const PALETTE = [COLORS.cyan, COLORS.magenta, COLORS.purple, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.blue, COLORS.red];

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

export class EndlessTrack {
  constructor(seed) {
    this.seed = String(seed);
    this.rng = mulberry32(hashSeed(this.seed));
    this.pieces = [];
    this.pending = [];
    this.course = new Course((path, opts) => {
      for (let i = 0; i < path.length - 1; i++) this._emitSegment(path, i, opts);
    }, { width: 300, height: 420, color: COLORS.cyan, face: 'left', minSpeed: 850 });
    this.count = 0;
    this.drift = 0; // accumulated heading change, keeps the track from spiralling
  }

  _emitSegment(path, i, o) {
    // mirrors MapBuilder.ramp for a single segment
    const sec = (j) => {
      const a = path[Math.max(0, j - 1)], b = path[Math.min(path.length - 1, j + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const rx = -tz, rz = tx; const p = path[j];
      return [[p[0], p[1], p[2]], [p[0] - rx * o.width, p[1] - o.height, p[2] - rz * o.width], [p[0] + rx * o.width, p[1] - o.height, p[2] + rz * o.width]];
    };
    this.pending.push({ points: [...sec(i), ...sec(i + 1)], kind: 'surf', color: o.color });
  }

  /** Spawn platform + first piece. */
  begin() {
    const w = 300;
    const plat = 420;
    const brushes = [];
    const pts = [];
    for (const a of [-1, 1]) for (const c of [-1, 1]) for (const y of [0, -48]) pts.push([a * plat / 2, y, c * plat / 2]);
    brushes.push({ points: pts, kind: 'floor', color: COLORS.cyan });
    this.spawn = { pos: [0, 40, 0], yaw: 0 };
    this.course.at([w * 0.5, -80, -(plat / 2 - 100)], 0);
    this.startZone = { min: [-plat / 2 - 60, -10, -plat / 2 - 60], max: [plat / 2 + 60, 200, plat / 2 + 60] };
    const first = this.next();
    first.brushes.unshift(...brushes);
    return first;
  }

  /** Generate the next piece: { index, brushes, lineFrom, lineTo } */
  next() {
    const r = this.rng;
    const c = this.course;
    const n = this.count;
    const d = Math.min(1, n / 35); // difficulty 0..1
    const lineFrom = c.line.length - 1;

    if (n > 0) {
      // gap into this piece, with options for the new ramp
      const width = lerp(300, 175, d) * lerp(0.9, 1.1, r());
      const height = width * lerp(1.4, 1.62, r());
      const color = PALETTE[(n + Math.floor(this.rng() * 2)) % PALETTE.length];
      const face = c.opts.face;
      let shift = 0;
      if (r() < 0.25 + 0.45 * d) shift = (r() < 0.5 ? -1 : 1) * lerp(150, 520, d * r());
      const len = lerp(600, 1250, d) * lerp(0.85, 1.15, r());
      c.gap(len, shift, { width, height, color, face });
    }

    // Surf has no drag: speed comes from height lost. Estimate the rider's
    // speed from total descent (with some loss for imperfect play) and pick
    // slopes, including uphill climbs, that keep it in a fun band.
    const v = Math.sqrt(Math.max(0, 300 * 300 + 2 * 800 * 0.7 * (0 - c.p[1])));
    let slope;
    if (v > 2500 && !this.lastUphill) slope = -lerp(0.02, 0.06, r());
    else if (v > 1900) slope = lerp(0.03, 0.1, r());
    else slope = lerp(0.14, 0.24, r());
    if (n === 0) slope = 0.22;
    this.lastUphill = slope < 0;
    const kinds = v > 2200 ? ['straight', 'curve', 'combo'] : ['straight', 'curve', 'curve', 'wave', 'combo'];
    const kind = n === 0 || slope < 0.03 ? 'straight' : pick(r, kinds);
    // Turning away from the rider's face (rider on the outside) is easiest.
    // Inside turns get a wider radius. Steer against accumulated drift so
    // the track wanders instead of spiralling.
    const outside = c.opts.face === 'left' ? 1 : -1;
    let turnSign = r() < 0.65 ? outside : -outside;
    if (this.drift > 80) turnSign = -1;
    if (this.drift < -80) turnSign = 1;
    const inside = turnSign !== outside;
    if (kind === 'straight') {
      const L = n === 0 ? 5000 : slope < 0 ? lerp(2000, 3000, r()) : lerp(3000, 5000, r());
      c.straight(L, L * slope);
    } else if (kind === 'curve' || kind === 'combo') {
      if (kind === 'combo') { const L = lerp(1200, 2400, r()); c.straight(L, L * slope); }
      const ang = lerp(40, 100, r()) * turnSign;
      // faster riders get pushed up the ramp harder in turns: widen them
      const rad = Math.max(lerp(5500, 3200, d) * lerp(0.9, 1.2, r()), (v * v) / 650) * (inside ? 1.6 : 1);
      const arcLen = Math.abs(ang) * Math.PI / 180 * rad;
      c.curve(ang, rad, arcLen * slope);
      this.drift += ang;
      if (kind === 'combo') { const L = lerp(1000, 2000, r()); c.straight(L, L * slope); }
    } else {
      const L = lerp(6000, 8000, r());
      c.wave(L, L * slope, lerp(220, 380, d), 1);
    }
    // close the ramp so its brushes are emitted with this piece
    c._flush();
    c.path = [[...c.p]];

    const brushes = this.pending;
    this.pending = [];
    const piece = { index: n, brushes, lineFrom, lineTo: c.line.length - 1 };
    this.pieces.push(piece);
    this.count++;
    return piece;
  }

  get line() { return this.course.line; }
}

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
export { fwdOf, rightOf };
