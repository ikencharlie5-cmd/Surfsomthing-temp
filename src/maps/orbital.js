import { MapBuilder, addCourse, COLORS } from './builder.js';

const STEEL = [0.55, 0.65, 0.85];

// Space station: corridors and open space under a ringed planet, low gravity.
export default function build() {
  const b = new MapBuilder('orbital', 'Orbital', {
    difficulty: 'hard',
    description: 'A space station: panelled corridors, scaffolds, solar arrays and a giant ring station. Lower gravity.',
    env: { sky: 'space', mountains: false, floor: false, fogColor: [0.01, 0.01, 0.03], fogNear: 15000, fogFar: 80000 },
    cvars: { gravity: 620 },
    theme: { type: 'station', seed: 23 },
    unlock: { after: ['overclock'] },
  });
  const corridor = { side: 380, top: 720, bottom: 600, ceiling: true, hidden: true, color: STEEL };
  addCourse(b, {
    ramp: { width: 210, height: 320, color: COLORS.cyan, minSpeed: 1100 },
    platformColor: COLORS.cyan,
    build: (c) => c
      .dropIn(6000, 2600).straight(2000, 200)
      .gap(1100, 0, { tunnel: corridor, color: STEEL }).straight(3500, 330)
      .gap(1100, 0, { tunnel: null, color: COLORS.magenta }).straight(1500, 150).curve(75, 6000, 650)
      .gap(1300, 300, { color: COLORS.cyan, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1800, 120)
      .fork({ length: 5200, speed: 2000, shift: -500, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 250)
      .gap(1100, 0, { tunnel: corridor, color: STEEL }).straight(1500, 150).curve(60, 5500, 550)
      .gap(1100, 0, { tunnel: null, color: COLORS.cyan, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).straight(1800, 120)
      .gap(1300, -260, { face: 'right', color: COLORS.magenta }).straight(1500, 150).curve(-70, 6000, 600)
      .gap(1300, 260, { face: 'left', color: COLORS.cyan }).straight(3000, 300),
  });
  return b.build();
}
