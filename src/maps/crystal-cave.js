import { MapBuilder, addCourse, addCrystals, COLORS } from './builder.js';

const ICE = [0.45, 0.85, 1.0];

// Enclosed, icy and twisty, lit by glowing crystals.
export default function build() {
  const b = new MapBuilder('crystal-cave', 'Crystal Cave', {
    difficulty: 'medium',
    description: 'An enclosed ice cave lit by glowing crystals. Twisty and close.',
    env: { sky: false, mountains: false, fogColor: [0.0, 0.04, 0.08], fogNear: 2200, fogFar: 15000, floorY: -2200, gridColor: [0.3, 0.8, 1.0] },
    unlock: { after: ['canyon-run'] },
  });
  const cave = { side: 360, top: 700, bottom: 600, ceiling: true, color: [0.25, 0.5, 0.9], ribColor: ICE, ribSpacing: 1100 };
  addCourse(b, {
    ramp: { width: 240, height: 360, color: ICE, minSpeed: 1100 },
    platformColor: ICE,
    build: (c) => c
      .dropIn(6000, 2400).straight(2000, 220)
      .gap(850, 0, { tunnel: cave, color: COLORS.cyan }).straight(1500, 150).curve(70, 5000, 600)
      .gap(900, -230, { face: 'right', color: ICE }).straight(1500, 150).curve(-70, 5000, 600)
      .gap(900, 230, { face: 'left', color: COLORS.purple, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1800, 120).wave(5500, 550, 220, 1)
      .gap(900, 0, { color: ICE }).straight(1500, 150).curve(65, 5200, 600)
      .gap(950, 0, { color: COLORS.cyan, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1800, 120)
      .gap(950, -230, { face: 'right', color: ICE }).straight(1500, 150).curve(-60, 5500, 550)
      .gap(950, 230, { face: 'left', color: COLORS.purple }).straight(3000, 300),
  });
  addCrystals(b.map, { seed: 5 });
  return b.build();
}
