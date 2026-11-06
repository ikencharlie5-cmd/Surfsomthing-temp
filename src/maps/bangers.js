// "Banger" maps: one hand-designed, fast set-piece map per theme, built on
// the Lost Temple formula. You race around a giant landmark on the inside
// face (so it fills your view), with something every few seconds: gates,
// boost rings and double-needle kickers. Then you run through a building and
// finish with a lap around a second landmark.
import { MapBuilder, addCourse, addCity } from './builder.js';
import { themeById } from './themes.js';

const W = 250;

/**
 * Recipe tokens (riders start on the right face):
 *   ['in', [...]]   inside arcs around the main landmark; between arcs: 'g' gate, 'b' boost
 *   'kick'          launch ramp + double-needle kicker
 *   'L' / 'R'       switch to the left / right face across a gap
 *   ['tunnel', k]   duck & dodge run through a structure of kind k (left face)
 *   ['out', [...]]  outside arcs (left face, right turns) with gaps between
 *   ['fin', [...]]  finale: inside arcs around the second landmark (right face)
 */
export function buildBanger(def) {
  const th = themeById(def.theme);
  const env = { ...th.env(def.seed), ...(def.env || {}) };
  const b = new MapBuilder(def.id, def.name, {
    difficulty: 'medium', description: def.description, env,
    theme: { type: 'landmark', seed: def.seed, landmark: def.landmark, second: def.second, props: def.props || def.landmark },
    cvars: def.cvars || null,
  });
  const pal = th.palette;
  let ci = 0;
  const col = () => pal[(ci++) % pal.length];
  const needle = (size, at = 0.5) => ({ size, at, color: def.gateColor || [0.5, 0.9, 1.0], edge: 1.6 });
  const dbl = (size) => [needle(size, 0.3), needle(size, 0.66)];
  const gapFor = (k) => (k === 'g' ? { needle: needle(def.gate ?? 230) } : { boost: { mult: 1.08 } });
  const groups = { in: [], fin: [] };

  const course = addCourse(b, {
    ramp: { width: W, height: 360, color: pal[0], minSpeed: 1150, face: 'right' },
    platformColor: th.platform,
    startHint: def.hint || null,
    build: (c) => {
      c.dropIn(5500, 2300).straight(1000, 100);
      for (const step of def.recipe) {
        const [k, arg] = Array.isArray(step) ? step : [step];
        if (k === 'in') {
          const from = c.curves.length;
          c.curve(55, 10500, 520);
          for (const g of arg) c.gap(950, 0, { color: col(), ...gapFor(g) }).curve(55, 10500, 520);
          groups.in.push([from, c.curves.length]);
        } else if (k === 'kick') {
          c.straight(1600, 380).kicker({ rise: 390, gapLen: 2550, landDrop: 680, landLen: 7200, landSlope: 0.07, needles: dbl(def.kickGate ?? 250), ramp: { color: col() } });
        } else if (k === 'L') {
          c.straight(1500, 120).gap(950, W * 0.9, { color: col(), face: 'left' }).straight(2000, 160);
        } else if (k === 'R') {
          c.straight(1500, 120).gap(950, -W * 0.9, { color: col(), face: 'right' }).straight(1500, 150).curve(-45, 8000, 500)
            .gap(950, 0, { color: col(), needle: needle(def.gate ?? 230) }).straight(2400, 220);
        } else if (k === 'tunnel') {
          c.structure(arg, ['dodge', 'dodge', 'duck', 'duck'], { slope: 0.08, spacing: 3000, approach: 2600 }).straight(2000, 260);
        } else if (k === 'out') {
          c.gap(950, 0, { color: col() }).straight(1000, 100).curve(70, 8000, 520);
          for (const g of arg) c.gap(950, 0, { color: col(), ...gapFor(g) }).curve(70, 8000, 520);
        } else if (k === 'fin') {
          const from = c.curves.length;
          c.gap(950, 0, { color: col() }).straight(1000, 100).curve(90, 9500, 420);
          for (const g of arg) c.gap(950, 0, { color: col(), ...gapFor(g) }).curve(90, 9500, 420);
          groups.fin.push([from, c.curves.length]);
        }
      }
      c.straight(2000, 100);
    },
  });

  // landmarks sit at the middle of the arcs that circle them, clear of the ride
  const line = b.map.line;
  const cv = course.curves;
  const landmarkAt = ([a, z], kind) => {
    const cs = cv.slice(a, z);
    const center = [cs.reduce((s, c) => s + c.center[0], 0) / cs.length, cs.reduce((s, c) => s + c.center[1], 0) / cs.length];
    let minD = Infinity, top = -Infinity, bot = Infinity;
    for (const c of cs) for (let i = c.from; i <= c.to; i++) {
      minD = Math.min(minD, Math.hypot(line[i].p[0] - center[0], line[i].p[2] - center[1]));
      top = Math.max(top, line[i].p[1]); bot = Math.min(bot, line[i].p[1] - line[i].height);
    }
    return { kind, center, clear: minD - 2600, lineTop: top, lineBot: bot };
  };
  const ground = Math.min(...line.map((e) => e.p[1] - e.height)) - 1700;
  b.map.landmarks = [
    ...groups.in.map((g) => landmarkAt(g, def.landmark)),
    ...groups.fin.map((g) => landmarkAt(g, def.second)),
  ];
  b.map.ground = ground;
  b.map.twist = def.twist;
  if (def.post) def.post(b, ground);
  return b.build();
}

export const BANGERS = {
  beach: {
    theme: 'beach', id: 'beach-lighthouse-point', name: 'Lighthouse Point', seed: 1202, landmark: 'lighthouse', second: 'seastacks',
    description: 'Race round a giant neon lighthouse, kick through the surf, finish around the sea stacks.',
    twist: 'Lighthouse loop', recipe: [['in', ['g', 'b', 'g']], 'kick', 'L', ['tunnel', 'seacave'], ['out', ['b']], 'kick', 'R', ['fin', ['g', 'b']]],
    gateColor: [1.0, 0.5, 0.8],
    post: (b, ground) => { b.map.env.floorAbs = ground + 900; b.map.theme.seaY = ground + 900; },
  },
  canyon: {
    theme: 'canyon', id: 'canyon-spire-valley', name: 'Spire Valley', seed: 2202, landmark: 'spire', second: 'arch',
    description: 'Circle a towering red-rock spire, blast through a sandstone cave, finish under a giant natural arch.',
    twist: 'Rock spire loop', recipe: [['in', ['b', 'g']], 'kick', 'L', ['tunnel', 'sandstone'], ['out', ['g']], 'kick', 'R', ['fin', ['b', 'g']]],
    gateColor: [1.0, 0.6, 0.3],
    env: { floor: false },
  },
  cave: {
    theme: 'cave', id: 'cave-crystal-heart', name: 'Crystal Heart', seed: 3202, landmark: 'geode', second: 'geode2',
    description: 'A colossal glowing crystal at the heart of the earth. Race around it, through the crystal chamber, and back.',
    twist: 'Giant crystal loop', recipe: [['in', ['g', 'g']], 'kick', 'L', ['tunnel', 'crystal'], ['out', ['g']], 'kick', 'R', ['fin', ['b', 'g']]],
    gateColor: [0.5, 0.9, 1.0],
  },
  city: {
    theme: 'city', id: 'city-spire-tower', name: 'Spire Tower', seed: 4202, landmark: 'skyscraper', second: 'skyscraper2',
    description: 'Spiral round the tallest tower in the city, burst through its atrium, then race the next megatower.',
    twist: 'Megatower loop', recipe: [['in', ['b', 'b', 'g']], 'kick', 'L', ['tunnel', 'atrium'], 'kick', 'R', ['fin', ['g', 'b']]],
    gateColor: [0.3, 1.0, 1.0],
    post: (b, ground) => { addCity(b.map, { seed: 4202, streetY: ground - 1800, grid: 3000, fill: 9000 }); b.map.theme.streetY = ground - 1800; b.map.env.floorAbs = ground - 1800; },
  },
  station: {
    theme: 'station', id: 'station-reactor-core', name: 'Reactor Core', seed: 5202, landmark: 'reactor', second: 'reactor2',
    description: 'Circle a blazing reactor core and its spinning rings, through the hangar, and round the backup core.',
    twist: 'Reactor loop', recipe: [['in', ['g', 'b']], 'kick', 'L', ['tunnel', 'hangar'], ['out', ['b']], 'kick', 'R', ['fin', ['g', 'g']]],
    gateColor: [0.4, 0.9, 1.0],
  },
  servers: {
    theme: 'servers', id: 'servers-mainframe', name: 'Mainframe', seed: 6202, landmark: 'mainframe', second: 'mainframe2',
    description: 'Race around a colossal mainframe tower streaming data, break into the vault, and lap the backup core.',
    twist: 'Mainframe loop', recipe: [['in', ['g', 'g', 'b']], 'kick', 'L', ['tunnel', 'vault'], ['out', ['g']], 'kick', 'R', ['fin', ['b']]],
    gateColor: [0.3, 1.0, 0.5],
    env: { fogNear: 6000, fogFar: 40000 },
  },
  volcano: {
    theme: 'volcano', id: 'volcano-inferno', name: 'Inferno', seed: 8202, landmark: 'volcanocone', second: 'lavafall',
    description: 'Circle an erupting volcano, dive through a lava tube, and finish around a falling river of fire.',
    twist: 'Volcano loop', recipe: [['in', ['b', 'g']], 'kick', 'L', ['tunnel', 'lavatube'], ['out', ['b']], 'kick', 'R', ['fin', ['g', 'g']]],
    gateColor: [1.0, 0.5, 0.15],
  },
  vortex: {
    theme: 'vortex', id: 'vortex-event-zero', name: 'Event Zero', seed: 9202, landmark: 'blackhole', second: 'star',
    description: 'Orbit a black hole and its blazing accretion disk, punch through a warp gate, and slingshot round a star.',
    twist: 'Black hole orbit', recipe: [['in', ['b', 'g']], 'kick', 'L', ['tunnel', 'warpgate'], 'kick', 'R', ['fin', ['g', 'b', 'g']]],
    gateColor: [1.0, 0.4, 1.0],
  },
  castle: {
    theme: 'castle', id: 'castle-the-keep', name: 'The Keep', seed: 10202, landmark: 'keep', second: 'gatetower',
    description: 'Race around the great keep, ride straight through its great hall, and finish round the gate towers.',
    twist: 'Keep loop', recipe: [['in', ['g', 'b']], 'kick', 'L', ['tunnel', 'hall'], ['out', ['g']], 'kick', 'R', ['fin', ['g', 'g']]],
    gateColor: [1.0, 0.7, 0.3],
  },
};
