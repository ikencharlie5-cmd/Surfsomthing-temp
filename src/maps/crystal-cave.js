import { MapBuilder, addCourse, COLORS } from './builder.js';

const ICE = [0.45, 0.85, 1.0];

// Enclosed, icy and twisty, lit by glowing crystals.
export default function build() {
  const b = new MapBuilder('crystal-cave', 'Crystal Cave', {
    difficulty: 'medium',
    description: 'A natural rock cave: stalactites, glowing crystal clusters and an underground river.',
    env: { sky: false, mountains: false, floor: false, fogColor: [0.0, 0.015, 0.03], fogNear: 2500, fogFar: 17000 },
    theme: { type: 'cave', seed: 4 },
    unlock: { after: ['canyon-run'] },
  });
  const cave = { side: 360, top: 700, bottom: 600, ceiling: true, hidden: true, color: [0.25, 0.5, 0.9] };
  addCourse(b, {
    ramp: { width: 240, height: 360, color: ICE, minSpeed: 1100, tunnel: cave },
    platformColor: ICE,
    build: (c) => c
      .dropIn(6000, 2400).straight(2000, 220)
      .gap(850, 0, { color: COLORS.cyan }).straight(1500, 150).curve(70, 5000, 600)
      .gap(900, -230, { face: 'right', color: ICE }).straight(1500, 150).curve(-70, 5000, 600)
      .gap(900, 230, { face: 'left', color: COLORS.purple, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1800, 120).wave(5500, 550, 220, 1)
      .gap(900, 0, { color: ICE }).straight(1500, 150).curve(65, 5200, 600)
      .gap(950, 0, { color: COLORS.cyan, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1800, 120)
      .gap(950, -230, { face: 'right', color: ICE }).straight(1500, 150).curve(-60, 5500, 550)
      .gap(950, 230, { face: 'left', color: COLORS.purple }).straight(3000, 300),
  });
  return b.build();
}
