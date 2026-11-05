import { MapBuilder, addCourse, COLORS } from './builder.js';

const PINK = [1.0, 0.45, 0.75];
const TEAL = [0.2, 1.0, 0.85];
const LILAC = [0.75, 0.55, 1.0];

// Easy, wide, open: drop in from a neon hotel rooftop, then skim low along a
// sunset beach with the ocean and horizon on your open side.
export default function build() {
  const b = new MapBuilder('vapor-coast', 'Vapor Coast', {
    difficulty: 'easy',
    description: 'Drop in from a neon hotel rooftop and skim a sunset beach: palms, boardwalk, pier and open ocean.',
    env: { floorMode: 'sea', mountains: false, fogColor: [0.5, 0.18, 0.38], fogNear: 14000, fogFar: 90000 },
    theme: { type: 'beach', seed: 21 },
    unlock: { after: ['night-tunnel'] },
  });
  addCourse(b, {
    // riders here are always fast (big drop-in, flat course), so gaps can be shallow
    ramp: { width: 320, height: 440, color: PINK, minSpeed: 1500 },
    platformColor: TEAL,
    startHint: null,
    build: (c) => c
      .dropIn(6500, 2700).straight(3000, 0)
      .gap(900, 0, { color: TEAL }).wave(6500, 0, 280, 1)
      .gap(900, 0, { color: LILAC }).straight(1500, -60).curve(40, 9000, 0)
      .gap(900, 0, { color: PINK }).straight(4000, -160)
      .gap(900, 0, { color: TEAL }).wave(6000, -60, 260, 1)
      .gap(900, 0, { color: LILAC }).straight(3500, -120)
      .gap(900, 0, { color: PINK }).straight(1500, -40).curve(30, 10000, 0)
      .gap(900, 0, { color: TEAL }).straight(4000, -60),
  });
  // sea level sits just below the lowest ramp; touching the sand or water is a fall
  const low = Math.min(...b.map.line.map((e) => e.p[1] - e.height));
  const seaY = low - 260;
  b.map.theme.seaY = seaY;
  b.map.env.floorAbs = seaY;
  b.map.waterY = seaY + 110;
  return b.build();
}
