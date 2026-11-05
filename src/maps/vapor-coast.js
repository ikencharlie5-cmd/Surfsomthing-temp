import { MapBuilder, addCourse, COLORS } from './builder.js';

const PINK = [1.0, 0.45, 0.75];
const TEAL = [0.2, 1.0, 0.85];
const LILAC = [0.75, 0.55, 1.0];
const SAND_DROP = 700; // dunes sit this far below the ramps

// A wild, empty sunset beach: drop in off a rocky headland and surf down a
// dune coastline toward the sea, with open ocean to the horizon on your left.
export default function build() {
  const b = new MapBuilder('vapor-coast', 'Vapor Coast', {
    difficulty: 'easy',
    description: 'An empty sunset beach. Drop off a rocky headland and surf the dunes down to the sea.',
    env: { floorMode: 'sea', mountains: false, fogColor: [0.5, 0.18, 0.38], fogNear: 14000, fogFar: 90000 },
    theme: { type: 'beach', seed: 21, sandDrop: SAND_DROP },
    unlock: { after: ['night-tunnel'] },
  });
  addCourse(b, {
    ramp: { width: 320, height: 440, color: PINK, minSpeed: 1100 },
    platformColor: TEAL,
    build: (c) => c
      .dropIn(6500, 2400).straight(3000, 330)
      .gap(850, 0, { color: TEAL }).wave(6500, 650, 300, 1)
      .gap(850, 0, { color: LILAC }).straight(1500, 150).curve(55, 7000, 650)
      .gap(900, 0, { color: PINK }).straight(3500, 700).straight(2000, 120)
      .fork({ length: 4400, speed: 1900, shift: -600, gapIn: 1200, gapOut: 1100, color: COLORS.yellow })
      .straight(1500, 150).wave(6000, 600, 260, 1)
      .gap(900, 0, { color: TEAL }).straight(4000, 400),
  });
  // the dunes meet the sea at the finish; touching sand or water is a fall
  const low = Math.min(...b.map.line.map((e) => e.p[1] - e.height));
  const seaY = low - SAND_DROP - 60;
  b.map.theme.seaY = seaY;
  b.map.env.floorAbs = seaY;
  b.map.waterY = seaY + 110;
  b.map.groundDrop = SAND_DROP;
  return b.build();
}
