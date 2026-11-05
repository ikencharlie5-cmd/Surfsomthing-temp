import { MapBuilder, addCourse, COLORS } from './builder.js';

// Hard and claustrophobic: a narrow enclosed shaft with tight turns.
export default function build() {
  const b = new MapBuilder('data-core', 'Data Core', {
    difficulty: 'hard',
    description: 'A server farm: racks of blinking LEDs, cable trays and data pulses in a tight shaft.',
    env: { sky: false, mountains: false, floor: false, fogColor: [0.0, 0.025, 0.02], fogNear: 2000, fogFar: 14000 },
    theme: { type: 'servers', seed: 31 },
  });
  const shaft = { side: 300, top: 600, bottom: 550, ceiling: true, hidden: true, color: COLORS.green };
  addCourse(b, {
    ramp: { width: 200, height: 320, color: COLORS.green, minSpeed: 1150, tunnel: shaft },
    platformColor: COLORS.green,
    build: (c) => c
      .dropIn(6000, 2500).straight(1800, 200)
      .gap(900, -190, { tunnel: shaft, face: 'right', color: COLORS.cyan }).curve(-80, 3600, 520)
      .gap(950, 190, { face: 'left' }).curve(80, 3600, 520)
      .gap(950, 0, { color: COLORS.green, vmin: 1000 }).checkpoint()
      .straight(3500, 1100).wave(5500, 600, 200, 1)
      .gap(1000, -190, { face: 'right', color: COLORS.cyan }).curve(-100, 3400, 620)
      .gap(1000, 190, { face: 'left', vmin: 1000 }).checkpoint()
      .straight(3500, 1100).curve(100, 3400, 620)
      .gap(1050, 350, { color: COLORS.green }).straight(2800, 250)
      .gap(1050, -350).straight(2800, 260),
  });
  return b.build();
}
