import { MapBuilder, addCourse, COLORS } from './builder.js';

// Tall walls on both sides but open to a red sunset sky.
export default function build() {
  const b = new MapBuilder('canyon-run', 'Canyon Run', {
    difficulty: 'medium',
    description: 'A real rock canyon at night: layered red walls, arches, mesas, neon cacti and a huge moon.',
    env: { sky: 'desert', mountains: false, floor: false, fogColor: [0.06, 0.04, 0.1], fogNear: 7000, fogFar: 50000 },
    theme: { type: 'canyon', seed: 9 },
  });
  const canyon = { side: 520, top: 1600, bottom: 900, ceiling: false, hidden: true, color: COLORS.orange };
  addCourse(b, {
    ramp: { width: 260, height: 380, color: COLORS.yellow, minSpeed: 1150, tunnel: canyon },
    platformColor: COLORS.orange,
    build: (c) => c
      .dropIn(6000, 2400).straight(2500, 280)
      .gap(850).curve(65, 4500, 560)
      .gap(900, -240, { face: 'right' }).curve(-65, 4500, 560)
      .gap(900, 240, { face: 'left', color: COLORS.orange, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).wave(6500, 600, 420, 1)
      .gap(900, 0, { color: COLORS.red }).straight(1500, 150).curve(40, 6500, 450)
      .gap(900, 0, { color: COLORS.yellow, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).curve(90, 4000, 650)
      .gap(900, -350).straight(3200, 300)
      .gap(900, 350, { color: COLORS.orange }).straight(3000, 300),
  });
  return b.build();
}
