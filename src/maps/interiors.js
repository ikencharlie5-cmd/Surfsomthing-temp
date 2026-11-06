// Interior maps: ride INSIDE a landmark. Every room is a closed, solid
// enclosure (walls, ceiling, floor) and the ramps are built into its floor.
// A map is a recipe of rooms and moves plus a "look" (materials and decor).
import { MapBuilder, addCourse } from './builder.js';
import { themeById } from './themes.js';

const W = 250;

export function buildInteriorMap(def) {
  const th = themeById(def.theme);
  const L = def.look;
  const b = new MapBuilder(def.id, def.name, {
    difficulty: 'medium', description: def.description,
    env: { ...th.env(def.seed), ...(def.env || {}) },
    theme: { type: 'interior', seed: def.seed, look: def.id },
    cvars: def.cvars || null,
  });
  const room = (interior, side, top) => ({ side, top, bottom: 140, ceiling: true, color: L.wall, wallKind: L.wallKind, interior });
  const shaft = room('shaft', 260, 900);
  const hall = room('hall', 1300, 2600);
  const crypt = room('crypt', 280, 560);
  const rooms = { shaft, hall, crypt };
  const door = (size, at = 0.5, lintel = 700) => ({ size, at, lintel, color: L.wall, edge: 0.5, castle: true });
  const dbl = (size) => [door(size, 0.3, 900), door(size, 0.66, 900)];
  const pal = L.accents;
  let ci = 0;
  const col = () => pal[(ci++) % pal.length];

  addCourse(b, {
    ramp: { width: W, height: 360, color: pal[0], minSpeed: 1100, face: 'left', tunnel: shaft },
    platformColor: L.ramp,
    startHint: def.hint || null,
    build: (c) => {
      const outside = () => (c.opts.face === 'left' ? 1 : -1); // turn away from the rider's face
      const sw = (o = {}) => {
        const toRight = c.opts.face === 'left';
        return c.gap(1000, (toRight ? -1 : 1) * W * 0.9, { face: toRight ? 'right' : 'left', color: col(), ...o });
      };
      for (const step of def.recipe) {
        const [k, a] = Array.isArray(step) ? step : [step];
        if (k === 'drop') c.dropIn(4200, 1700).straight(800, 60);
        else if (k === 'spiral') {
          const deg = a ?? 360;
          c.curve(outside() * deg * 0.55, 4600, deg * 0.55 * 7.5).straight(1200, 60).curve(outside() * deg * 0.45, 4600, deg * 0.45 * 7.5);
        } else if (k === 'enter') c.gap(1000, 0, { color: col(), tunnel: rooms[a], needle: door(300) }).straight(1600, 320);
        else if (k === 'slalom') {
          sw({ needle: door(280) }).straight(1800, 250);
          c.gap(1000, 0, { color: col(), needle: door(260) }).straight(1500, 220);
          sw({ needle: door(280) }).straight(1800, 250);
        } else if (k === 'kick') {
          c.straight(1900, 560).kicker({ rise: 380, gapLen: 2500, landDrop: 650, landLen: 4200, landSlope: 0.08, needles: dbl(a ?? 280), ramp: { color: col() } }).straight(2000, 120);
        } else if (k === 'turn') {
          c.straight(1500, 60);
          sw().straight(1200, 60);
          c.curve(outside() * (a ?? 120), 5200, 600);
        } else if (k === 'dodge') {
          sw({ tunnel: rooms[a ?? 'crypt'] }).straight(2200, 180);
          c.structure('hall', ['dodge', 'dodge', 'duck', 'duck'], { slope: 0.05, spacing: 3000, approach: 2600 }).straight(2000, 80);
        } else if (k === 'back') c.gap(1000, 0, { color: col(), tunnel: rooms[a ?? 'hall'] }).straight(2800, 120);
        else if (k === 'exit') c.straight(1200, 100).gap(1100, 0, { color: col(), tunnel: null, needle: door(320, 0.5, 900) }).straight(2500, 200);
      }
    },
  });
  b.map.twist = def.twist;
  b.map.look = L;
  for (const br of b.map.brushes) if (br.kind === 'surf') { br.kind = L.rampKind; br.color = L.ramp; br.edge = 0.3; }
  b.map.groundDrop = 120;
  b.map.engrained = true;
  return b.build();
}

const KEEP_RECIPE = ['drop', ['spiral', 360], ['enter', 'hall'], 'slalom', 'kick', ['turn', 120], ['dodge', 'crypt'], ['back', 'hall'], 'kick', 'exit'];

export const INTERIORS = {
  beach: {
    theme: 'beach', id: 'beach-lighthouse-point', name: 'Lighthouse Point', seed: 1202, twist: 'Inside the lighthouse',
    description: 'Corkscrew down inside a giant lighthouse, kick across the keeper\'s hall, duck through the sea cellar.',
    recipe: ['drop', ['spiral', 300], ['spiral', 240], ['enter', 'hall'], 'kick', 'slalom', ['dodge', 'crypt'], ['back', 'hall'], ['turn', 100], 'exit'],
    look: { wallKind: 'stone', wall: [0.85, 0.82, 0.8], rampKind: 'stone', ramp: [0.9, 0.35, 0.45], floor: [0.35, 0.25, 0.2], carpet: [0.1, 0.4, 0.5],
      light: [1.0, 0.85, 0.55], rib: [1.6, 0.4, 0.6], accents: [[1, 0.4, 0.6], [0.3, 1, 0.9]], windows: [[0.4, 0.9, 1.0]], decor: 'lighthouse', needle: 'castle' },
  },
  canyon: {
    theme: 'canyon', id: 'canyon-spire-valley', name: 'Spire Valley', seed: 2202, twist: 'Inside the rock spire',
    description: 'Ride the caves carved through a giant red-rock spire: corkscrew shafts, a vast cavern, a slot canyon.',
    recipe: ['drop', ['spiral', 360], ['enter', 'hall'], 'slalom', 'kick', ['dodge', 'crypt'], ['back', 'hall'], ['turn', 110], 'kick', 'exit'],
    look: { wallKind: 'rock', wall: [0.6, 0.3, 0.18], rampKind: 'rock', ramp: [0.75, 0.42, 0.25], floor: [0.3, 0.15, 0.1],
      light: [1.0, 0.55, 0.25], rib: [1.4, 0.6, 0.25], accents: [[1, 0.6, 0.3], [1, 0.85, 0.3]], decor: 'cave', needle: 'canyon' },
  },
  cave: {
    theme: 'cave', id: 'cave-crystal-heart', name: 'Crystal Heart', seed: 3202, twist: 'Inside the geode',
    description: 'Surf the inside of a colossal geode: crystal walls, a glowing cavern, a crystal crawlspace.',
    recipe: ['drop', ['spiral', 330], ['enter', 'hall'], 'kick', ['turn', 120], ['dodge', 'crypt'], ['back', 'hall'], 'slalom', 'kick', 'exit'],
    look: { wallKind: 'glow', wall: [0.35, 0.6, 1.0], rampKind: 'rock', ramp: [0.45, 0.45, 0.6], floor: [0.08, 0.1, 0.16],
      light: [0.5, 0.9, 1.0], rib: [0.6, 1.4, 1.8], accents: [[0.4, 1, 1], [0.7, 0.5, 1]], decor: 'crystal', needle: 'cave' },
  },
  city: {
    theme: 'city', id: 'city-spire-tower', name: 'Spire Tower', seed: 4202, twist: 'Inside the megatower',
    description: 'Drop down a megatower\'s elevator shaft, slalom the lobby, crawl the service ducts, smash out the windows.',
    recipe: ['drop', ['spiral', 360], ['enter', 'hall'], 'slalom', 'kick', ['turn', 120], ['dodge', 'crypt'], ['back', 'hall'], 'kick', 'exit'],
    look: { wallKind: 'panel', wall: [0.3, 0.3, 0.42], rampKind: 'panel', ramp: [0.75, 0.75, 0.85], floor: [0.12, 0.12, 0.16], carpet: [0.6, 0.1, 0.5],
      light: [0.6, 0.95, 1.0], rib: [1.6, 0.3, 1.2], accents: [[1, 0.3, 0.8], [0.3, 1, 1]], windows: [[1, 0.4, 0.8], [0.3, 0.9, 1], [1, 0.85, 0.3]], decor: 'tower', needle: 'city' },
  },
  station: {
    theme: 'station', id: 'station-reactor-core', name: 'Reactor Core', seed: 5202, twist: 'Inside the reactor',
    description: 'Down the coolant shaft, through the reactor hall and its glowing core, out the maintenance ducts.',
    recipe: ['drop', ['spiral', 360], ['enter', 'hall'], 'kick', 'slalom', ['dodge', 'crypt'], ['back', 'hall'], ['turn', 120], 'kick', 'exit'],
    look: { wallKind: 'panel', wall: [0.45, 0.5, 0.6], rampKind: 'panel', ramp: [0.7, 0.75, 0.85], floor: [0.1, 0.12, 0.16],
      light: [0.4, 0.95, 1.0], rib: [0.4, 1.4, 1.8], accents: [[0.3, 1, 1], [1, 0.4, 0.9]], decor: 'reactor', needle: 'station' },
  },
  servers: {
    theme: 'servers', id: 'servers-mainframe', name: 'Mainframe', seed: 6202, twist: 'Inside the mainframe',
    description: 'Inside the mainframe: down the cooling stack, through the server hall, under the cable trays.',
    recipe: ['drop', ['spiral', 360], ['enter', 'hall'], 'slalom', ['turn', 110], 'kick', ['dodge', 'crypt'], ['back', 'hall'], 'kick', 'exit'],
    look: { wallKind: 'panel', wall: [0.12, 0.16, 0.14], rampKind: 'panel', ramp: [0.35, 0.45, 0.4], floor: [0.03, 0.06, 0.05],
      light: [0.3, 1.0, 0.5], rib: [0.3, 1.4, 0.6], accents: [[0.3, 1, 0.5], [0.3, 0.8, 1]], decor: 'servers', needle: 'servers' },
  },
  volcano: {
    theme: 'volcano', id: 'volcano-inferno', name: 'Inferno', seed: 8202, twist: 'Inside the volcano',
    description: 'Ride the lava tubes inside an erupting volcano: a magma chamber, a fire slalom, a scorching crawl.',
    recipe: ['drop', ['spiral', 360], ['enter', 'hall'], 'kick', ['turn', 120], 'slalom', ['dodge', 'crypt'], ['back', 'hall'], 'kick', 'exit'],
    look: { wallKind: 'rock', wall: [0.2, 0.12, 0.12], rampKind: 'rock', ramp: [0.3, 0.2, 0.2], floor: [0.9, 0.3, 0.05],
      light: [1.0, 0.45, 0.1], rib: [1.8, 0.5, 0.1], accents: [[1, 0.4, 0.1], [1, 0.75, 0.2]], decor: 'lava', needle: 'volcano' },
  },
  vortex: {
    theme: 'vortex', id: 'vortex-event-zero', name: 'Event Zero', seed: 9202, twist: 'Inside the warp',
    description: 'Fall through the inside of a warp gate: light-walled shafts, a singularity chamber, a tachyon crawl.',
    recipe: ['drop', ['spiral', 360], ['enter', 'hall'], 'slalom', 'kick', ['dodge', 'crypt'], ['back', 'hall'], ['turn', 120], 'kick', 'exit'],
    look: { wallKind: 'glow', wall: [0.7, 0.2, 0.9], rampKind: 'glow', ramp: [0.3, 0.8, 1.0], floor: [0.05, 0.0, 0.1],
      light: [1.0, 0.4, 1.0], rib: [0.4, 1.4, 1.8], accents: [[1, 0.3, 0.9], [0.3, 1, 1]], decor: 'warp', needle: 'vortex' },
  },
};

export { KEEP_RECIPE };
