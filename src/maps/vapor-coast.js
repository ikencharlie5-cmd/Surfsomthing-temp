import { MapBuilder, addCourse, COLORS } from './builder.js';

const PINK = [1.0, 0.45, 0.75];
const TEAL = [0.2, 1.0, 0.85];
const LILAC = [0.75, 0.55, 1.0];

// Easy, wide, open: a pastel sunset over a shimmering synthwave ocean.
export default function build() {
  const b = new MapBuilder('vapor-coast', 'Vapor Coast', {
    difficulty: 'easy',
    description: 'A neo beach at sunset: neon palms, a boardwalk and a pier over a glittering ocean.',
    env: { floorMode: 'sea', mountains: false, fogColor: [0.5, 0.18, 0.38], fogNear: 12000, fogFar: 70000 },
    theme: { type: 'beach', seed: 21 },
    unlock: { after: ['night-tunnel'] },
  });
  addCourse(b, {
    ramp: { width: 320, height: 440, color: PINK, minSpeed: 1050 },
    platformColor: TEAL,
    build: (c) => c
      .dropIn(6500, 2400).straight(3000, 330)
      .gap(850, 0, { color: TEAL }).wave(6500, 650, 300, 1)
      .gap(850, 0, { color: LILAC }).straight(1500, 150).curve(55, 7000, 650)
      .gap(900, 0, { color: PINK, vmin: 950 }).checkpoint('Stay above 1200 u/s and watch your speed combo climb.')
      .straight(3500, 1000).straight(2000, 120)
      .fork({ length: 4400, speed: 1900, shift: -600, gapIn: 1200, gapOut: 1100, color: COLORS.yellow })
      .straight(1500, 150).wave(6000, 600, 260, 1)
      .gap(900, 0, { color: TEAL }).straight(4000, 400),
  });
  // the sea sits just below the land at the finish, so the coast ends on a beach
  const last = b.map.line[b.map.line.length - 1];
  const seaY = last.p[1] - last.height - 1900 - 150;
  b.map.theme.seaY = seaY;
  b.map.env.floorAbs = seaY;
  return b.build();
}
