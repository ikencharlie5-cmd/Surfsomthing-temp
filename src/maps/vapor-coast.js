import { MapBuilder, addCourse, COLORS } from './builder.js';

const PINK = [1.0, 0.45, 0.75];
const TEAL = [0.2, 1.0, 0.85];
const LILAC = [0.75, 0.55, 1.0];

// Easy, wide, open: a pastel sunset over a shimmering synthwave ocean.
export default function build() {
  const b = new MapBuilder('vapor-coast', 'Vapor Coast', {
    difficulty: 'easy',
    description: 'Wide pastel ramps over a glittering sunset ocean. Pure flow.',
    env: { floorMode: 'sea', fogColor: [0.5, 0.18, 0.38], fogNear: 9000, fogFar: 60000 },
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
  return b.build();
}
