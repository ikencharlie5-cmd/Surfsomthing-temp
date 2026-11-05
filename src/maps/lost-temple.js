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
  let course;
  course = addCourse(b, {
    // ride the INSIDE face around the pyramid so it fills your view
    ramp: { width: W, height: 360, color: GOLD, minSpeed: 1100, face: 'right' },
    platformColor: GOLD,
    startHint: 'Drop off the summit and circle the pyramid. The entrance is at its foot.',
    build: (c) => c
      // the summit drop-in, then once around the outside of the pyramid
      .dropIn(6000, 2300).straight(1500, 150)
      .curve(250, 10500, 2600)
      .straight(2000, 450)
      // kick off the foot of the pyramid and fly into the entrance
      .kicker({ rise: 420, gapLen: 2600, landDrop: 700, landLen: 3000, landSlope: 0.15 })
      // through the entrance: a torch-lit tunnel full of blocks
      .gap(1000, W * 0.9, { color: JADE, face: 'left' }).straight(1500, 200)
      .structure('temple', ['dodge', 'duck', 'dodge', 'duck'], { slope: 0.16 })
      .straight(2000, 250)
      // chamber 1: the Hall of Pillars
      .gap(1000, 0, { color: EMBER }).straight(1500, 150)
      .curve(300, 8000, 3000)
      .straight(1800, 150).straight(10000, 0)
      // chamber 2: the flooded chamber, circled the other way
      .gap(1000, -W * 0.9, { face: 'right', color: JADE }).straight(1500, 150)
      .curve(-300, 8000, 3000)
      .straight(1800, 150).straight(10000, 0)
      // the great hall: one and a half turns around the idol
      // (inside face, so the idol fills your view the whole way down)
      .gap(1000, 0, { color: GOLD }).straight(1500, 150)
      .curve(540, 9500, 4400)
      .straight(3000, 200),
  });
  const cv = course.curves;
  const line = b.map.line;
  // jungle floor sits well below the last outside ramp (falling = restart before you'd touch it)
  const ground = cv[0].y1 - 360 - 1700;
  const rooms = [
    { kind: 'pillars', ...room(line, cv[1]) },
    { kind: 'flooded', ...room(line, cv[2]) },
    { kind: 'idol', ...room(line, cv[3]) },
  ];
  // chambers are underground; where two overlap, split the height between them
  for (const r of rooms) r.top = Math.min(r.top, ground - 300);
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], c = rooms[j];
    if (Math.hypot(a.center[0] - c.center[0], a.center[1] - c.center[1]) > a.wallR + c.wallR - 1500) continue; // walls barely touch: leave them
    const [up, lo] = a.lineBot > c.lineBot ? [a, c] : [c, a];
    const mid = (up.lineBot + lo.lineTop) / 2;
    up.bottom = Math.max(up.bottom, mid);
    lo.top = Math.min(lo.top, mid);
  }
  b.map.temple = { pyramid: { center: cv[0].center, top: cv[0].y0 + 5200, ground, ringR: cv[0].radius }, ground, rooms };
  b.map.twist = 'Temple complex';
  return b.build();
}

/** A round chamber around a curve: wall radius, floor and ceiling heights. */
function room(line, c) {
  let top = -Infinity, bot = Infinity;
  for (let i = c.from; i <= c.to; i++) {
    top = Math.max(top, line[i].p[1]);
    bot = Math.min(bot, line[i].p[1] - line[i].height);
  }
  return { center: c.center, radius: c.radius, wallR: c.radius + 2700, top: top + 1800, bottom: bot - 1800, lineTop: top, lineBot: bot, from: c.from, to: c.to };
}
