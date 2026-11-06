// Weave maps: one per theme. A giant hollow landmark (tower, geode, cone...)
// and a route that loops round it, dives in through its walls, circles
// inside, bursts back out and crosses over and under itself on the way down.
// Holes are cut in the landmark's shell wherever the ride passes through.
import { MapBuilder, addCourse, addCity, rightOf } from './builder.js';
import { themeById } from './themes.js';

const W = 250;
const D2R = Math.PI / 180;

/** Orbit helper: keeps the course on circles around a fixed centre. */
class Orbit {
  constructor(c, def) {
    this.c = c; this.def = def; this.slope = 0.06;
    this.C = null; this.R = 0; this.sgn = 1;
    this.pal = def.accents; this.ci = 0;
  }
  col() { return this.pal[(this.ci++) % this.pal.length]; }
  /** start circling: centre on the turning side, `R` away */
  ring(R, sgn = this.sgn) {
    const c = this.c;
    const [rx, rz] = rightOf(c.h);
    this.C = [c.p[0] + sgn * rx * R, c.p[2] + sgn * rz * R];
    this.R = R; this.sgn = sgn;
    return this;
  }
  orbit(deg, s = this.slope) { this.c.curve(this.sgn * deg, this.R, s * deg * D2R * this.R); return this; }
  /** half circle onto a new radius around the same centre (in or out through a wall) */
  transfer(Rn, s = this.slope) {
    const r = (this.R + Rn) / 2;
    this.c.curve(this.sgn * 180, r, s * Math.PI * r);
    this.R = Rn;
    return this;
  }
  /** a petal: in towards the centre and back out, ending where it began (lower) */
  dip(Ri, s = this.slope) { const Ro = this.R; return this.transfer(Ri, s).transfer(Ro, s); }
  /** an air gap that stays on the circle; k: 'g' gate, 'b' boost, null plain */
  gap(k = null, len = 950) {
    const c = this.c, R = this.R, phi = len / R;
    const o = { color: this.col() };
    // the landmark walls are the needles here: gaps get boost rings, not floating slabs
    if (k === 'b' || k === 'g') o.boost = { mult: k === 'g' ? 1.05 : 1.08 };
    c.gap(R * Math.sin(phi), this.sgn * R * (1 - Math.cos(phi)), o);
    c.h -= this.sgn * phi / D2R;
    c.line[c.line.length - 1].h = c.h;
    return this;
  }
  /** jump across onto the other face and start turning the other way */
  flip(R = this.R, lead = 0) {
    const toRight = this.sgn < 0;
    this.c.gap(950, (toRight ? -1 : 1) * W * 0.9, { face: toRight ? 'right' : 'left', color: this.col() });
    if (lead) this.c.straight(lead, lead * 0.05);
    return this.ring(R, -this.sgn);
  }
  kick(gate = 250) {
    const dbl = [0.3, 0.66].map((at) => ({ size: gate, at, color: this.def.gateColor, edge: 1.6 }));
    this.c.straight(1600, 380).kicker({ rise: 390, gapLen: 2550, landDrop: 680, landLen: 7200, landSlope: 0.07, needles: dbl, ramp: { color: this.col() } });
    return this;
  }
  /** keep circling until heading straight at a point (x, z) */
  aimAt(T) {
    const c = this.c;
    const [rx, rz] = rightOf(c.h);
    const C = [c.p[0] + this.sgn * rx * this.R, c.p[2] + this.sgn * rz * this.R];
    let prev = null;
    for (let d = 0; d < 360; d += 0.25) {
      const h = c.h - this.sgn * d;
      const [qx, qz] = rightOf(h);
      const px = C[0] - this.sgn * qx * this.R, pz = C[1] - this.sgn * qz * this.R;
      const fx = -Math.sin(h * D2R), fz = -Math.cos(h * D2R);
      const tx = T[0] - px, tz = T[1] - pz;
      const cr = fx * tz - fz * tx, ahead = fx * tx + fz * tz > 0;
      if (prev != null && ahead && Math.sign(cr) !== Math.sign(prev)) { if (d > 1) this.orbit(d); return this; }
      prev = cr;
    }
    return this;
  }
  /** remember a landmark shell centred on the current circle */
  shell(spec) { this.def._shells.push({ ...spec, center: [...this.C] }); return this; }
}

function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

export function buildWeaveMap(def) {
  const th = themeById(def.theme);
  const env = { ...th.env(def.seed), ...(def.env || {}) };
  const b = new MapBuilder(def.id, def.name, {
    difficulty: 'medium', description: def.description, env,
    theme: { type: 'landmark', seed: def.seed, landmark: def.landmark, weave: true },
    cvars: def.cvars || null,
  });
  def._shells = [];
  addCourse(b, {
    ramp: { width: W, height: 360, color: def.accents[0], minSpeed: 1150, face: 'right' },
    platformColor: th.platform,
    startHint: def.hint || null,
    build: (c) => {
      c.dropIn(5500, 2300).straight(1000, 100);
      def.route(new Orbit(c, def), c);
      c.straight(2000, 100);
    },
  });
  const m = b.map;
  const line = m.line;
  const ground = Math.min(...line.map((e) => e.p[1] - e.height)) - 1700;
  const top = Math.max(...line.map((e) => e.p[1]));
  m.ground = ground;
  m.landmarks = [];
  m.shells = def._shells.map((s) => fitShell(s, line, ground, top));
  m.twist = def.twist;
  delete def._shells;
  if (def.post) def.post(b, ground);
  // nothing solid may stand inside a shell or under a crossing
  m.brushes = m.brushes.filter((br) => br.kind !== 'building' || !blocked(br, m));
  return b.build();
}

/** vertical extent of a shell from the part of the ride near it */
function fitShell(s, line, ground, top) {
  const near = line.filter((e) => Math.hypot(e.p[0] - s.center[0], e.p[2] - s.center[1]) < s.r + 3000);
  const ys = near.map((e) => e.p[1]);
  const hi = ys.length ? Math.max(...ys) : top, lo = ys.length ? Math.min(...ys) : ground;
  const out = { ...s, yb: s.yb ?? ground, yt: hi + (s.above ?? 3000) };
  if (s.kind === 'sphere') { out.cy = (hi + lo) / 2 + (s.dy ?? 0); out.yb = out.cy - s.r; out.yt = out.cy + s.r; }
  if (s.kind === 'disk') out.levels = (s.levels || [0.3, 0.6]).map((f) => lo + (hi - lo) * f);
  return out;
}

/** horizontal distance from a shell's axis, in the shell's own metric */
export function shellDist(s, x, z) {
  const dx = x - s.center[0], dz = z - s.center[1];
  return s.kind === 'box' ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
}

/** shell radius at height y (null when the shell doesn't reach that height) */
export function shellRadius(s, y) {
  if (s.kind === 'disk') return null;
  if (y < s.yb || y > s.yt) return null;
  const v = (y - s.yb) / (s.yt - s.yb);
  if (s.kind === 'sphere') { const d = y - s.cy; return Math.sqrt(Math.max(0, s.r * s.r - d * d)); }
  if (s.kind === 'cone') return s.r + ((s.rTop ?? s.r * 0.5) - s.r) * v;
  return s.r * (1 - (s.taper ?? 0) * v);
}

function blocked(br, m) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
  for (const p of br.points) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); y1 = Math.max(y1, p[1]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const s of m.shells) if (shellDist(s, cx, cz) < (s.kind === 'disk' ? 0 : s.r + Math.max(x1 - x0, z1 - z0) / 2 + 600)) return true;
  for (const e of m.line) {
    if (e.p[0] < x0 - 1500 || e.p[0] > x1 + 1500 || e.p[2] < z0 - 1500 || e.p[2] > z1 + 1500) continue;
    if (y1 > e.p[1] - e.height - 900) return true;
  }
  return false;
}

export const WEAVES = {
  beach: {
    theme: 'beach', id: 'beach-lighthouse-point', name: 'Lighthouse Point', seed: 1202, landmark: 'lighthouse',
    twist: 'Through the lighthouse',
    description: 'Spiral round a colossal lighthouse, crash in through its wall, corkscrew round the lamp inside and burst out over the sea.',
    accents: [[1, 0.4, 0.6], [0.3, 1, 0.9], [1, 0.8, 0.3]], gateColor: [1.0, 0.5, 0.8],
    route: (o) => {
      o.ring(9500, 1).shell({ kind: 'tower', r: 6400, look: 'lighthouse', above: 13000, taper: 0.2 });
      o.orbit(110).gap('g').orbit(120).gap('b').orbit(140);
      o.transfer(4600).orbit(150).gap('g').orbit(170).gap('b').orbit(110);
      o.transfer(9500).orbit(40).kick();
    },
    post: (b, ground) => { b.map.env.floorAbs = ground + 900; b.map.theme.seaY = ground + 900; },
  },
  canyon: {
    theme: 'canyon', id: 'canyon-spire-valley', name: 'Spire Valley', seed: 2202, landmark: 'spire',
    twist: 'Figure eight through twin spires',
    description: 'A figure eight round twin red-rock spires, tunnelling straight through the heart of each one.',
    accents: [[1, 0.6, 0.3], [1, 0.85, 0.3], [0.9, 0.4, 0.3]], gateColor: [1.0, 0.6, 0.3],
    env: { floor: false },
    route: (o) => {
      o.slope = 0.075;
      o.ring(8500, 1).shell({ kind: 'rock', r: 5200, look: 'spire', above: 6000, taper: 0.25 });
      o.orbit(120).gap('g').orbit(120);
      o.flip().shell({ kind: 'rock', r: 5000, look: 'spire', above: 5000, taper: 0.3 });
      o.orbit(80).dip(1200).orbit(120).gap('b').orbit(150);
      o.flip().orbit(90).dip(1400).orbit(70).kick();
    },
  },
  cave: {
    theme: 'cave', id: 'cave-crystal-heart', name: 'Crystal Heart', seed: 3202, landmark: 'geode',
    twist: 'Inside the geode',
    description: 'Dive into a hollow glowing geode, spiral twice round the giant crystal at its heart and smash back out.',
    accents: [[0.4, 1, 1], [0.7, 0.5, 1], [0.5, 0.8, 1]], gateColor: [0.5, 0.9, 1.0],
    route: (o) => {
      o.ring(11500, 1).shell({ kind: 'sphere', r: 8600, look: 'geode' });
      o.orbit(100).gap('g').orbit(80);
      o.transfer(5000).orbit(160).gap('b').orbit(170).gap('g').orbit(160);
      o.transfer(11500).orbit(50).kick();
    },
  },
  city: {
    theme: 'city', id: 'city-spire-tower', name: 'Spire Tower', seed: 4202, landmark: 'skyscraper',
    twist: 'Through the megatower',
    description: 'Loop round the tallest tower in the city and punch straight through it, again and again, lower every time.',
    accents: [[1, 0.3, 0.8], [0.3, 1, 1], [1, 0.85, 0.3]], gateColor: [0.3, 1.0, 1.0],
    route: (o) => {
      o.ring(10500, 1).shell({ kind: 'box', r: 4600, look: 'skyscraper', above: 9000 });
      o.orbit(70).dip(1500).orbit(50).gap('g').orbit(50).dip(1500).orbit(60).gap('b').orbit(40).dip(1500).orbit(40).kick();
    },
    post: (b, ground) => { addCity(b.map, { seed: 4202, streetY: ground - 1800, grid: 3000, fill: 9000 }); b.map.theme.streetY = ground - 1800; b.map.env.floorAbs = ground - 1800; },
  },
  station: {
    theme: 'station', id: 'station-reactor-core', name: 'Reactor Core', seed: 5202, landmark: 'reactor',
    twist: 'Round the reactor core',
    description: 'Break into the reactor chamber, orbit the blazing core, blast out and dive back through it.',
    accents: [[0.3, 1, 1], [1, 0.4, 0.9], [0.4, 0.6, 1]], gateColor: [0.4, 0.9, 1.0],
    route: (o) => {
      o.ring(11000, 1).shell({ kind: 'tower', r: 7600, look: 'reactor', above: 3000 });
      o.orbit(90).transfer(4800).orbit(170).gap('b').orbit(180);
      o.transfer(11000).orbit(60).gap('g').orbit(60).dip(3600).orbit(50).kick();
    },
  },
  servers: {
    theme: 'servers', id: 'servers-mainframe', name: 'Mainframe', seed: 6202, landmark: 'mainframe',
    twist: 'Slalom the server stacks',
    description: 'Slalom straight through a row of mainframe stacks, loop back under yourself and thread them again.',
    accents: [[0.3, 1, 0.5], [0.3, 0.8, 1], [1, 0.7, 0.2]], gateColor: [0.3, 1.0, 0.5],
    env: { fogNear: 6000, fogFar: 40000 },
    route: (o, c) => {
      o.ring(7500, 1).orbit(30);
      const from = c.line.length - 1, S0 = [c.p[0], c.p[2]];
      for (let k = 0; k < 4; k++) o.flip(7500, 1200).orbit(60);
      const to = c.line.length;
      // swing out, loop round behind and come straight back down the row, under the slalom
      o.flip().orbit(30).orbit(90).flip(5500).orbit(120).gap('g').aimAt(S0);
      const back = c.line.length - 1;
      const dist = Math.hypot(S0[0] - c.p[0], S0[1] - c.p[2]) + 3000;
      const n = 3, seg = (dist - 950 * (n - 1)) / n;
      for (let k = 0; k < n; k++) { if (k) c.gap(950, 0, { color: o.col(), ...(k === 1 ? { boost: { mult: 1.08 } } : {}) }); c.straight(seg, seg * 0.035); }
      // a server stack wherever the return run passes under the slalom
      const P = (i) => [c.line[i].p[0], c.line[i].p[2]];
      const hits = [];
      for (let i = from; i < to; i++) for (let j = back; j < c.line.length - 1; j++) {
        const x = segX(P(i), P(i + 1), P(j), P(j + 1));
        if (x && !hits.some((h) => Math.hypot(h[0] - x[0], h[1] - x[1]) < 5200)) hits.push(x);
      }
      for (const h of hits) o.def._shells.push({ kind: 'box', r: 2200, look: 'mainframe', above: 5000, center: h });
      o.kick();
    },
  },
  volcano: {
    theme: 'volcano', id: 'volcano-inferno', name: 'Inferno', seed: 8202, landmark: 'volcanocone',
    twist: 'Into the crater',
    description: 'Start in the crater of an erupting volcano, corkscrew down into the magma chamber and burst out of a side vent.',
    accents: [[1, 0.4, 0.1], [1, 0.75, 0.2], [1, 0.3, 0.3]], gateColor: [1.0, 0.5, 0.15],
    route: (o) => {
      o.slope = 0.05;
      o.ring(4800, 1).shell({ kind: 'cone', r: 17000, rTop: 6500, look: 'volcano', above: 7000 });
      o.orbit(140).gap('b').orbit(170).gap('g').orbit(180);
      o.transfer(18500).orbit(70).gap('g').orbit(40).kick();
    },
  },
  vortex: {
    theme: 'vortex', id: 'vortex-event-zero', name: 'Event Zero', seed: 9202, landmark: 'blackhole',
    twist: 'Spiral into the black hole',
    description: 'Spiral down into a black hole through its spinning accretion disks, skim the event horizon and slingshot out.',
    accents: [[1, 0.3, 0.9], [0.3, 1, 1], [1, 0.6, 0.2]], gateColor: [1.0, 0.4, 1.0],
    route: (o) => {
      o.slope = 0.05;
      o.ring(13000, 1).shell({ kind: 'disk', r: 16000, rIn: 3200, look: 'warp', levels: [0.25, 0.5, 0.75] });
      o.orbit(150).gap('g').orbit(100);
      o.transfer(7500).orbit(180).gap('b').orbit(150);
      o.transfer(4800).orbit(200);
      o.transfer(13000).orbit(40).kick();
    },
  },
};
