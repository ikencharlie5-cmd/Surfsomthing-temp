import { MapBuilder, addCourse, COLORS } from './builder.js';

const MAGMA = [1.0, 0.35, 0.08];
const EMBER = [1.0, 0.65, 0.2];
const DROP = 800;

// Surf down the flank of an erupting volcano, above rivers and a sea of lava.
export default function build() {
  const b = new MapBuilder('magma-run', 'Magma Run', {
    difficulty: 'hard',
    description: 'Drop off a volcano rim and surf down its flank over lava rivers, embers and a sea of magma.',
    env: { sky: 'volcanic', mountains: false, floor: false, fogColor: [0.13, 0.03, 0.02], fogNear: 6000, fogFar: 52000 },
    theme: { type: 'volcano', seed: 51, groundDrop: DROP },
    unlock: { after: ['skyline-rush'] },
  });
  addCourse(b, {
    ramp: { width: 215, height: 320, color: MAGMA, minSpeed: 1150 },
    platformColor: EMBER,
    build: (c) => c
      .dropIn(7000, 3000).straight(2000, 200)
      .gap(1000, 280).straight(3000, 300)
      .gap(1000, -280, { color: EMBER }).straight(1500, 150).curve(70, 6500, 650)
      .fork({ length: 4800, speed: 2050, shift: -450, gapIn: 1300, gapOut: 1300, color: COLORS.yellow })
      .straight(2500, 220)
      .gap(1100, -330, { face: 'right', color: MAGMA }).straight(1800, 150).curve(-70, 6500, 600)
      .gap(1100, 330, { face: 'left', color: EMBER }).straight(3000, 650).straight(1800, 120).wave(6000, 600, 240, 1)
      .gap(1200, 0, { color: MAGMA }).straight(2500, 250),
  });
  b.map.groundDrop = DROP;
  return b.build();
}
