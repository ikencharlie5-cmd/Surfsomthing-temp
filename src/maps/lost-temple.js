// Lost Temple: a hand-designed set piece. Circle a giant stepped pyramid
// from its summit down to the jungle floor, dive through the entrance into
// the temple, circle two underground chambers, then spiral down around a
// colossal idol in the great hall.
import { MapBuilder, addCourse, COLORS } from './builder.js';
import { themeById } from './themes.js';

const JADE = [0.2, 1.0, 0.6];
const GOLD = [1.0, 0.8, 0.25];
const EMBER = [1.0, 0.5, 0.15];

export default function build() {
  const th = themeById('jungle');
  const b = new MapBuilder('lost-temple', 'Lost Temple', {
    difficulty: 'medium',
    description: 'Circle a colossal jungle pyramid, dive inside, and spiral down around the idol in its great hall.',
    env: { ...th.env(7102), fogColor: [0.03, 0.05, 0.05], fogNear: 9000, fogFar: 70000 },
    theme: { type: 'temple-complex', seed: 7102 },
  });
  const W = 250;
  const needle = (size, at = 0.5) => ({ size, at, color: [0.35, 0.8, 0.45], edge: 1.6 });
  const dbl = (size) => [needle(size, 0.3), needle(size, 0.66)];
  const course = addCourse(b, {
    // ride the INSIDE face around the pyramid so it fills your view
    ramp: { width: W, height: 360, color: GOLD, minSpeed: 1150, face: 'right' },
    platformColor: GOLD,
    startHint: 'Drop off the tower and race around the pyramid. Gates, boosts and a kicker into the temple!',
    build: (c) => c
      // --- around the pyramid: short arcs broken up by gates and a boost
      .dropIn(5500, 2300).straight(1000, 100)
      .curve(55, 10500, 650)
      .gap(950, 0, { color: JADE, needle: needle(240) })
      .curve(55, 10500, 650)
      .gap(950, 0, { color: GOLD, boost: { mult: 1.08 } })
      .curve(50, 10500, 600)
      // kick off the pyramid's foot through a double gate
      .straight(1600, 380)
      .kicker({ rise: 380, gapLen: 2500, landDrop: 650, landLen: 3200, landSlope: 0.12, needles: dbl(260), ramp: { color: JADE } })
      // --- into the temple: duck and dodge down the entrance tunnel
      .gap(950, W * 0.9, { color: GOLD, face: 'left' }).straight(2000, 160)
      .structure('temple', ['dodge', 'dodge', 'duck', 'duck'], { slope: 0.08, spacing: 3000, approach: 2600 })
      .straight(2000, 260)
      // --- Hall of Pillars: two quick arcs with a gate between the columns
      .gap(950, 0, { color: EMBER }).straight(1000, 100)
      .curve(70, 8000, 750)
      .gap(950, 0, { color: GOLD, needle: needle(220) })
      .curve(70, 8000, 750)
      .straight(1500, 380)
      .kicker({ rise: 400, gapLen: 2600, landDrop: 700, landLen: 3800, landSlope: 0.14, needles: dbl(240), ramp: { color: JADE } })
      // --- flooded chamber: switch sides, dodge the fallen statues, boost
      .gap(950, -W * 0.9, { face: 'right', color: JADE }).straight(1500, 150).curve(-45, 8000, 500)
      .gap(950, 0, { color: EMBER, needle: needle(220) }).straight(1200, 150)
      .gap(950, 0, { color: GOLD, boost: { mult: 1.08 } }).straight(1000, 100)
      .curve(-80, 8000, 850)
      .straight(1500, 380)
      .kicker({ rise: 420, gapLen: 2700, landDrop: 720, landLen: 3800, landSlope: 0.14, needles: dbl(230), ramp: { color: GOLD } })
      // --- the great hall: race round the idol (inside face), gates and boosts
      .gap(950, 0, { color: EMBER }).straight(1000, 100)
      .curve(90, 9500, 600)
      .gap(950, 0, { color: JADE, needle: needle(220) })
      .curve(90, 9500, 600)
      .gap(950, 0, { color: GOLD, needle: needle(220) })
      .curve(90, 9500, 600)
      .straight(2000, 100),
  });
  const cv = course.curves;
  const line = b.map.line;
  const ground = Math.min(...line.slice(0, cv[2].to + 1).map((e) => e.p[1] - e.height)) - 1700;
  const mean = (cs) => [cs.reduce((s, c) => s + c.center[0], 0) / cs.length, cs.reduce((s, c) => s + c.center[1], 0) / cs.length];
  // the pyramid sits at the middle of the outside arcs, clear of the ride
  const pc = mean(cv.slice(0, 3));
  let minD = Infinity;
  for (let i = 0; i <= cv[2].to + 30 && i < line.length; i++) minD = Math.min(minD, Math.hypot(line[i].p[0] - pc[0], line[i].p[2] - pc[1]));
  const rooms = [
    { kind: 'pillars', ...roomOf(line, cv.slice(3, 5)) },
    { kind: 'flooded', ...roomOf(line, cv.slice(5, 7)) },
    { kind: 'idol', ...roomOf(line, cv.slice(7, 10)) },
  ];
  for (const r of rooms) r.top = Math.min(r.top, ground - 300);
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], c = rooms[j];
    if (Math.hypot(a.center[0] - c.center[0], a.center[1] - c.center[1]) > a.wallR + c.wallR - 1500) continue;
    const [up, lo] = a.lineBot > c.lineBot ? [a, c] : [c, a];
    const mid = (up.lineBot + lo.lineTop) / 2;
    up.bottom = Math.max(up.bottom, mid);
    lo.top = Math.min(lo.top, mid);
  }
  b.map.temple = { pyramid: { center: pc, top: cv[0].y0 + 4500, ground, half: Math.max(3000, minD - 2400), ringR: minD }, ground, rooms };
  b.map.twist = 'Temple complex';
  return b.build();
}

/** A round chamber around a group of arcs: centre, wall radius, floor and ceiling. */
function roomOf(line, cs) {
  const center = [cs.reduce((s, c) => s + c.center[0], 0) / cs.length, cs.reduce((s, c) => s + c.center[1], 0) / cs.length];
  const from = cs[0].from, to = cs[cs.length - 1].to;
  let top = -Infinity, bot = Infinity, rMin = Infinity, rMax = 0;
  for (let i = from; i <= to; i++) {
    const e = line[i];
    top = Math.max(top, e.p[1]);
    bot = Math.min(bot, e.p[1] - e.height);
    const d = Math.hypot(e.p[0] - center[0], e.p[2] - center[1]);
    rMin = Math.min(rMin, d); rMax = Math.max(rMax, d);
  }
  return { center, radius: (rMin + rMax) / 2, innerR: rMin, wallR: rMax + 2700, top: top + 1800, bottom: bot - 1800, lineTop: top, lineBot: bot, from, to };
}
