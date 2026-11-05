import { MapBuilder, addCourse, COLORS } from './builder.js';

// Tall walls on both sides but open to a red sunset sky.
export default function build() {
  const b = new MapBuilder('canyon-run', 'Canyon Run', {
    difficulty: 'medium',
    description: 'A winding canyon of towering walls under a blood-red sky.',
    env: { fogColor: [0.4, 0.07, 0.09], fogNear: 5000, fogFar: 38000, sunTint: [1.0, 0.35, 0.2] },
  });
  const canyon = { side: 520, top: 1600, bottom: 900, ceiling: false, color: COLORS.orange, ribColor: COLORS.red, ribSpacing: 1400 };
  addCourse(b, {
    ramp: { width: 260, height: 380, color: COLORS.yellow, minSpeed: 1150, tunnel: canyon },
    platformColor: COLORS.orange,
    build: (c) => c
      .curve(100, 3800, 2300).straight(2500, 280)
      .gap(850).curve(65, 4500, 560)
      .gap(900, -240, { face: 'right' }).curve(-65, 4500, 560)
      .gap(900, 240, { face: 'left', color: COLORS.orange, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).wave(6500, 600, 420, 1)
      .fork({ length: 4600, speed: 2000, shift: 600, gapIn: 1200, gapOut: 1100, color: COLORS.red })
      .curve(40, 6500, 450)
      .gap(900, 0, { color: COLORS.yellow, vmin: 1000 }).checkpoint()
      .straight(3500, 1050).curve(90, 4000, 650)
      .gap(900, -350).straight(3200, 300)
      .gap(900, 350, { color: COLORS.orange }).straight(3000, 300),
  });
  return b.build();
}
